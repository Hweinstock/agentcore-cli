import { type Logger, getNullLogger } from '../../logging';
import { FileSystemIOError, ValidationError } from '../errors';
import { type Result, err, ok } from '../result';
import type { DataSource } from './source';
import stableStringify from 'fast-json-stable-stringify';
import { z } from 'zod';

/** Resolve `fn` over a value that may or may not be a promise, preserving sync-ness. */
function then<A, B>(value: A | Promise<A>, fn: (a: A) => B): B | Promise<B> {
  return value instanceof Promise ? value.then(fn) : fn(value);
}

type Path<T> = T extends object
  ? {
      [K in keyof T & string]: NonNullable<T[K]> extends object ? K | `${K}.${Path<NonNullable<T[K]>>}` : K;
    }[keyof T & string]
  : never;

type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<NonNullable<T[K]>, Rest> | (undefined extends T[K] ? undefined : never)
    : never
  : P extends keyof T
    ? T[P]
    : never;

type ArrayPath<T> = {
  [P in Path<T>]: NonNullable<PathValue<T, P>> extends readonly unknown[] ? P : never;
}[Path<T>];

type ElementOf<V> = NonNullable<V> extends readonly (infer E)[] ? E : never;

/** Options accepted by every datastore operation. */
interface OpOptions {
  sync?: boolean;
}

export interface JsonDatastore<T> {
  get: {
    <P extends Path<T>>(path: P): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends Path<T>>(path: P, opts: { sync: true }): Result<{ value: PathValue<T, P> }>;
  };
  set: {
    <P extends Path<T>>(path: P, value: PathValue<T, P>): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends Path<T>>(path: P, value: PathValue<T, P>, opts: { sync: true }): Result<{ value: PathValue<T, P> }>;
  };
  all: {
    (): Promise<Result<{ config: T }>>;
    (opts: { sync: true }): Result<{ config: T }>;
  };
  add: {
    <P extends ArrayPath<T>>(path: P, item: ElementOf<PathValue<T, P>>): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends ArrayPath<T>>(
      path: P,
      item: ElementOf<PathValue<T, P>>,
      opts: { sync: true }
    ): Result<{ value: PathValue<T, P> }>;
  };
  remove: {
    <P extends ArrayPath<T>>(path: P, item: ElementOf<PathValue<T, P>>): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends ArrayPath<T>>(
      path: P,
      item: ElementOf<PathValue<T, P>>,
      opts: { sync: true }
    ): Result<{ value: PathValue<T, P> }>;
  };
  isValidPath: (path: string) => path is Path<T>;
  isValidPathValue: <P extends Path<T>>(path: P, value: unknown) => value is PathValue<T, P>;
}

export function getJsonDatastore<S extends z.ZodType>(
  context: { logger?: Logger },
  opts: {
    schema: S;
    source: DataSource;
    useCache?: boolean;
  }
): JsonDatastore<z.infer<S>> {
  type T = z.infer<S>;

  const logger = context.logger?.child({ module: 'JsonDatastore' }) ?? getNullLogger();
  const useCache = opts.useCache ?? true;

  let cachedConfigData: T;

  const load = (sync: boolean): Result<{ config: T }> | Promise<Result<{ config: T }>> => {
    if (useCache && cachedConfigData) return ok({ config: cachedConfigData });
    const readResult = sync ? opts.source.readSync() : opts.source.read();
    return then(readResult, read => {
      if (!read.success) return err(new FileSystemIOError(read.error.message));

      const parsed = opts.schema.safeParse(read.data);
      if (!parsed.success) return err(new ValidationError(parsed.error.message));
      cachedConfigData = parsed.data as T;
      return ok({ config: parsed.data as T });
    });
  };

  const validPaths = deriveValidPaths(opts.schema);

  const datastore: JsonDatastore<T> = {
    all: (op?: OpOptions) => load(op?.sync ?? false),

    get: <P extends Path<T>>(path: P, op?: OpOptions) => {
      logger.info(`get with path=${path}`);
      return then(load(op?.sync ?? false), loaded => {
        if (!loaded.success) return loaded;
        return ok({ value: getAtPath(loaded.data?.config, path) as PathValue<T, P> });
      });
    },

    set: <P extends Path<T>>(path: P, value: PathValue<T, P>, op?: OpOptions) => {
      logger.info(`set with path=${path}, value=${String(value)}`);
      const sync = op?.sync ?? false;

      const safe = assertSafePath(path);
      if (!safe.success) return safe;

      return then(load(sync), loaded => {
        if (!loaded.success) return loaded;

        const next = (loaded.data?.config ?? {}) as Record<string, unknown>;
        setAtPath(next, path, value);

        const parsed = opts.schema.safeParse(next);
        if (!parsed.success) return err(new ValidationError(parsed.error.message));

        const writeResult = sync ? opts.source.writeSync(parsed.data) : opts.source.write(parsed.data);
        return then(writeResult, written => {
          if (!written.success) return err(new FileSystemIOError(written.error.message));
          return ok({ value });
        });
      });
    },

    add: <P extends ArrayPath<T>>(path: P, item: ElementOf<PathValue<T, P>>, op?: OpOptions) =>
      mutateList({
        path,
        item,
        op,
        transform: (list, value) => (list.some(x => itemsEqual(x, value)) ? list : [...list, value]),
      }),

    remove: <P extends ArrayPath<T>>(path: P, item: ElementOf<PathValue<T, P>>, op?: OpOptions) =>
      mutateList({
        path,
        item,
        op,
        transform: (list, value) => list.filter(x => !itemsEqual(x, value)),
      }),

    isValidPath: (path: string): path is Path<T> => validPaths.has(path),

    isValidPathValue: <P extends Path<T>>(path: P, value: unknown): value is PathValue<T, P> => {
      const subSchema = getSchemaAtPath(opts.schema, path);
      if (!subSchema) return false;
      return subSchema.safeParse(value).success;
    },
  } as JsonDatastore<T>;

  function mutateList<P extends ArrayPath<T>>(props: {
    path: P;
    item: ElementOf<PathValue<T, P>>;
    op: OpOptions | undefined;
    transform: (list: unknown[], item: unknown) => unknown[];
  }) {
    return then(datastore.get(props.path as never, props.op as { sync: true }), got => {
      if (!got.success) return got;
      const current = Array.isArray(got.data?.value) ? (got.data.value as unknown[]) : [];
      const next = props.transform(current, props.item);
      return datastore.set(props.path as never, next as never, props.op as { sync: true });
    });
  }

  return datastore;
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function itemsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return stableStringify(a) === stableStringify(b);
}

function assertSafePath(path: string): Result {
  for (const key of path.split('.')) {
    if (RESERVED_KEYS.has(key)) return err(new ValidationError(`Illegal key: ${key}`));
  }
  return ok();
}

function getAtPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), obj);
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop();
  if (last === undefined) return;
  let node = obj;
  for (const key of keys) {
    if (!isRecord(node[key])) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[last] = value;
}

function deriveValidPaths(schema: z.ZodTypeAny, prefix = ''): Set<string> {
  const paths = new Set<string>();
  const shape = getZodShape(schema);
  if (!shape) return paths;
  for (const [key, value] of Object.entries(shape)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.add(fullPath);
    const nested = deriveValidPaths(value as z.ZodTypeAny, fullPath);
    for (const p of nested) paths.add(p);
  }
  return paths;
}

function getSchemaAtPath(schema: z.ZodTypeAny, path: string): z.ZodTypeAny | undefined {
  const segments = path.split('.');
  let current: z.ZodTypeAny = schema;
  for (const seg of segments) {
    const shape = getZodShape(current);
    if (!shape || !(seg in shape)) return undefined;
    current = shape[seg] as z.ZodTypeAny;
  }
  return current;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodType = z.ZodTypeAny | (z.ZodTypeAny & { shape?: any });

function getZodShape(schema: AnyZodType): Record<string, AnyZodType> | undefined {
  if (schema instanceof z.ZodObject) return schema.shape as Record<string, AnyZodType>;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return getZodShape(schema.unwrap() as AnyZodType);
  if (schema instanceof z.ZodDefault && 'unwrap' in schema) return getZodShape(schema.unwrap() as AnyZodType);
  return undefined;
}
