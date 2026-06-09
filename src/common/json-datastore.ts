import { FileSystemIOError, ValidationError } from './errors';
import { type Logger, getNullLogger } from './logging';
import { type Result, err, ok, wrapInResult } from './result';
import stableStringify from 'fast-json-stable-stringify';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { z } from 'zod';

/** Resolve `fn` over a value that may or may not be a promise, preserving sync-ness. */
function then<A, B>(value: A | Promise<A>, fn: (a: A) => B): B | Promise<B> {
  return value instanceof Promise ? value.then(fn) : fn(value);
}

/**
 * Dot-notation paths over an (object-tree) type, e.g.
 * "telemetry" | "telemetry.enabled". Optional branches still expand because we
 * recurse through `NonNullable`.
 */
type Path<T> = T extends object
  ? {
      [K in keyof T & string]: NonNullable<T[K]> extends object ? K | `${K}.${Path<NonNullable<T[K]>>}` : K;
    }[keyof T & string]
  : never;

/**
 * The value type at a given dot path. `| undefined` is propagated through any
 * optional ancestor, since that branch may be absent at runtime.
 */
type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<NonNullable<T[K]>, Rest> | (undefined extends T[K] ? undefined : never)
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** The subset of dot paths in `T` whose value is an array. */
type ArrayPath<T> = {
  [P in Path<T>]: NonNullable<PathValue<T, P>> extends readonly unknown[] ? P : never;
}[Path<T>];

/** The element type of an array-valued path. */
type ElementOf<V> = NonNullable<V> extends readonly (infer E)[] ? E : never;

/**
 * Pluggable persistence for a datastore document — where the bytes are read from / written to.
 * Provides both async and sync I/O so callers can opt into synchronous access per call.
 */
export interface DataSource {
  read: () => Promise<Result>;
  write: (value: unknown) => Promise<Result>;
  readSync: () => Result;
  writeSync: (value: unknown) => Result;
}

/** Options accepted by every datastore operation. */
interface OpOptions {
  /** When `true`, the operation runs synchronously and returns a `Result` instead of a `Promise`. */
  sync?: boolean;
}

export interface JsonDatastore<T> {
  /** Read the value at a dot path. Returns a `Result` directly when `{ sync: true }` is passed. */
  get: {
    <P extends Path<T>>(path: P): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends Path<T>>(path: P, opts: { sync: true }): Result<{ value: PathValue<T, P> }>;
  };
  /**
   * Set the value at a dot path; the whole document is re-validated against the schema before
   * persisting. Returns a `Result` directly when `{ sync: true }` is passed.
   */
  set: {
    <P extends Path<T>>(path: P, value: PathValue<T, P>): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends Path<T>>(path: P, value: PathValue<T, P>, opts: { sync: true }): Result<{ value: PathValue<T, P> }>;
  };
  /** The whole validated document. Returns a `Result` directly when `{ sync: true }` is passed. */
  all: {
    (): Promise<Result<{ config: T }>>;
    (opts: { sync: true }): Result<{ config: T }>;
  };
  /**
   * Append `item` to the array at a dot path, skipping duplicates (by `===`). The whole document
   * is re-validated before persisting. Returns a `Result` directly when `{ sync: true }` is passed.
   */
  add: {
    <P extends ArrayPath<T>>(path: P, item: ElementOf<PathValue<T, P>>): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends ArrayPath<T>>(
      path: P,
      item: ElementOf<PathValue<T, P>>,
      opts: { sync: true }
    ): Result<{ value: PathValue<T, P> }>;
  };
  /**
   * Remove all items equal (by `===`) to `item` from the array at a dot path; a no-op if none
   * match. The whole document is re-validated before persisting. Returns a `Result` directly when
   * `{ sync: true }` is passed.
   */
  remove: {
    <P extends ArrayPath<T>>(path: P, item: ElementOf<PathValue<T, P>>): Promise<Result<{ value: PathValue<T, P> }>>;
    <P extends ArrayPath<T>>(
      path: P,
      item: ElementOf<PathValue<T, P>>,
      opts: { sync: true }
    ): Result<{ value: PathValue<T, P> }>;
  };
}

/**
 * A generic, schema-driven JSON datastore. The Zod schema is the single source
 * of truth: TypeScript types are derived from it via `z.infer`, and every write
 * re-validates the entire document so the persisted store is always schema-valid.
 *
 * All operations return a `Result` and never throw. Each operation runs
 * asynchronously by default; pass `{ sync: true }` to run it synchronously and
 * receive the `Result` directly instead of a `Promise`.
 */
export function getJsonDatastore<S extends z.ZodType>(
  context: { logger?: Logger },
  opts: {
    schema: S;
    source: DataSource;
    useCache?: boolean;
  }
): JsonDatastore<z.infer<S>> {
  type T = z.infer<S>;

  const logger = context.logger?.child('JsonDatastore') ?? getNullLogger();
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

  const datastore: JsonDatastore<T> = {
    all: (op?: OpOptions) => load(op?.sync ?? false),

    get: <P extends Path<T>>(path: P, op?: OpOptions) => {
      logger.info(`get with path=${path}`);
      return then(load(op?.sync ?? false), loaded => {
        if (!loaded.success) return loaded;
        // `load()` validated the whole document against the schema, so the value
        // at a typed path `P` is guaranteed to be `PathValue<T, P>`; this assertion
        // just bridges the `unknown` from the runtime walk to that validated type.
        return ok({ value: getAtPath(loaded.data?.config, path) as PathValue<T, P> });
      });
    },

    set: <P extends Path<T>>(path: P, value: PathValue<T, P>, op?: OpOptions) => {
      logger.info(`set with path=${path}, value=${value}`);
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
    // The public overloads guarantee callers see a `Result` for `{ sync: true }`
    // and a `Promise<Result>` otherwise; the shared implementation works in the
    // value-or-promise union, so we bridge it to the declared interface here.
  } as JsonDatastore<T>;

  /**
   * Read-modify-write helper for array-valued paths: loads the current list, applies `transform`,
   * and writes it back through `set` (so schema re-validation and persistence stay centralized).
   * Preserves sync-ness end-to-end via `then`.
   */
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

/**
 * A JSON-file-backed source exposing both async and sync I/O. A missing or
 * unreadable file reads as an empty document.
 */
export const jsonFileSource = (filePath: string): DataSource => ({
  read: wrapInResult(async () => {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  }),
  write: wrapInResult(async (data: unknown) => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, undefined, 2));
    return {};
  }),
  readSync: wrapInResult(() => {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }),
  writeSync: wrapInResult((data: unknown) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, undefined, 2));
    return {};
  }),
});

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural equality for list items. Primitives compare directly; objects/arrays compare by
 * key-stable JSON serialization, so dedup/removal works on value rather than reference and is
 * insensitive to object key order.
 */
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
