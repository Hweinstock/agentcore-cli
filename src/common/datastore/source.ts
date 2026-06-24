import { FileSystemIOError, ValidationError } from '../errors';
import { type Result, err, ok } from '../result';
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
  read: async () => {
    try {
      return ok(JSON.parse(await readFile(filePath, 'utf-8')) as unknown);
    } catch (e) {
      return err(new FileSystemIOError((e as Error).message));
    }
  },
  write: async (data: unknown) => {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(data, undefined, 2));
      return ok(undefined);
    } catch (e) {
      return err(new FileSystemIOError((e as Error).message));
    }
  },
  readSync: () => {
    try {
      return ok(JSON.parse(readFileSync(filePath, 'utf-8')) as unknown);
    } catch (e) {
      return err(new FileSystemIOError((e as Error).message));
    }
  },
  writeSync: (data: unknown) => {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(data, undefined, 2));
      return ok(undefined);
    } catch (e) {
      return err(new FileSystemIOError((e as Error).message));
    }
  },
});

/**
 * An in-memory source for testing — stores the document in a local variable.
 */
export function inMemorySource(initial: unknown = {}): DataSource {
  let stored: unknown = initial;
  return {
    read: async () => {
      try {
        return ok(structuredClone(stored));
      } catch (e) {
        return err(new ValidationError((e as Error).message));
      }
    },
    write: async (value: unknown) => {
      try {
        stored = structuredClone(value);
        return ok(undefined);
      } catch (e) {
        return err(new ValidationError((e as Error).message));
      }
    },
    readSync: () => {
      try {
        return ok(structuredClone(stored));
      } catch (e) {
        return err(new ValidationError((e as Error).message));
      }
    },
    writeSync: (value: unknown) => {
      try {
        stored = structuredClone(value);
        return ok(undefined);
      } catch (e) {
        return err(new ValidationError((e as Error).message));
      }
    },
  };
}
