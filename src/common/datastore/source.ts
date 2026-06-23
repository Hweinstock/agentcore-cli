import { type Result, ok, wrap, wrapAsync } from '../result';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

/**
 * Pluggable persistence for a datastore document — where the bytes are read from / written to.
 * Provides both async and sync I/O so callers can opt into synchronous access per call.
 */
export interface DataSource {
  read: () => Promise<Result<unknown>>;
  write: (value: unknown) => Promise<Result<void>>;
  readSync: () => Result<unknown>;
  writeSync: (value: unknown) => Result<void>;
}

/**
 * A JSON-file-backed source exposing both async and sync I/O. A missing or
 * unreadable file reads as an empty document.
 */
export const jsonFileSource = (filePath: string): DataSource => ({
  read: wrapAsync(async () => {
    return JSON.parse(await readFile(filePath, 'utf-8')) as unknown;
  }),
  write: wrapAsync(async (data: unknown) => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, undefined, 2));
  }),
  readSync: wrap(() => {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  }),
  writeSync: wrap((data: unknown) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, undefined, 2));
  }),
});

/**
 * An in-memory source for testing — stores the document in a local variable.
 */
export function inMemorySource(initial: unknown = {}): DataSource {
  let stored: unknown = initial;
  return {
    read: () => Promise.resolve(ok(structuredClone(stored))),
    write: (value: unknown) => {
      stored = structuredClone(value);
      return Promise.resolve(ok(undefined));
    },
    readSync: () => ok(structuredClone(stored)),
    writeSync: (value: unknown) => {
      stored = structuredClone(value);
      return ok(undefined);
    },
  };
}
