import { FileSystemIOError, ValidationError } from './errors';
import { type Result, err, ok, wrapInResult } from './result';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { z } from 'zod';

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

/** Pluggable persistence for a datastore document — where the bytes are read from / written to. */
export interface DataSource {
  read: () => Promise<Result>;
  write: (value: unknown) => Promise<Result>;
}

export interface JsonDatastore<T> {
  /** Read the value at a dot path. */
  get: <P extends Path<T>>(path: P) => Promise<Result<{ value: PathValue<T, P> }>>;
  /** Set the value at a dot path; the whole document is re-validated against the schema before persisting. */
  set: <P extends Path<T>>(path: P, value: PathValue<T, P>) => Promise<Result<{ value: PathValue<T, P> }>>;
  /** The whole validated document. */
  all: () => Promise<Result<{ config: T }>>;
}

/**
 * A generic, schema-driven JSON datastore. The Zod schema is the single source
 * of truth: TypeScript types are derived from it via `z.infer`, and every write
 * re-validates the entire document so the persisted store is always schema-valid.
 *
 * All operations return a `Result` and never throw.
 */
export function getJsonDatastore<S extends z.ZodType>(opts: {
  schema: S;
  source: DataSource;
}): JsonDatastore<z.infer<S>> {
  type T = z.infer<S>;

  const load = async (): Promise<Result<{ config: T }>> => {
    const readResult = await opts.source.read();
    if (!readResult.success) return err(new FileSystemIOError(readResult.error.message));

    const parsed = opts.schema.safeParse(readResult.data);
    if (!parsed.success) return err(new ValidationError(parsed.error.message));
    return ok({ config: parsed.data as T });
  };

  return {
    all: load,

    get: async <P extends Path<T>>(path: P): Promise<Result<{ value: PathValue<T, P> }>> => {
      const loaded = await load();
      if (!loaded.success) return loaded;
      // `load()` validated the whole document against the schema, so the value
      // at a typed path `P` is guaranteed to be `PathValue<T, P>`; this assertion
      // just bridges the `unknown` from the runtime walk to that validated type.
      return ok({ value: getAtPath(loaded.data?.config, path) as PathValue<T, P> });
    },

    set: async <P extends Path<T>>(path: P, value: PathValue<T, P>): Promise<Result<{ value: PathValue<T, P> }>> => {
      const safe = assertSafePath(path);
      if (!safe.success) return safe;

      const loaded = await load();
      if (!loaded.success) return loaded;

      const next = (loaded.data?.config ?? {}) as Record<string, unknown>;
      setAtPath(next, path, value);

      const parsed = opts.schema.safeParse(next);
      if (!parsed.success) return err(new ValidationError(parsed.error.message));

      const writeResult = await opts.source.write(parsed.data);
      if (!writeResult.success) return err(new FileSystemIOError(writeResult.error.message));

      return ok({ value });
    },
  };
}

/** A JSON-file-backed source. A missing or unreadable file reads as an empty document. */
export const jsonFileSource = (filePath: string): DataSource => ({
  read: wrapInResult(async () => {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  }),
  write: wrapInResult(async (data: unknown) => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, undefined, 2));
    return {};
  }),
});

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
