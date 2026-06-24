import { type AsyncResult, FileSystemIOError, type ResultWrapped, err, ok, wrapAsync } from '../common';
import type { EnvironmentAccessorContext } from './accessor';
import * as fs from 'node:fs/promises';

export interface FilesystemAccessor {
  dirExists: (path: string) => Promise<boolean>;
  mkdir: ResultWrapped<typeof fs.mkdir, FileSystemIOError>;
  writeFile: ResultWrapped<typeof fs.writeFile, FileSystemIOError>;
  readFile: (path: string, encoding?: BufferEncoding) => AsyncResult<string, FileSystemIOError>;
  readdir: (
    path: string,
    options: { withFileTypes: true }
  ) => AsyncResult<import('node:fs').Dirent[], FileSystemIOError>;
  cp: ResultWrapped<typeof fs.cp>;
  rm: ResultWrapped<typeof fs.rm>;
  rename: ResultWrapped<typeof fs.rename>;
}

export const getFilesystemAccessor = (_context: EnvironmentAccessorContext): FilesystemAccessor => ({
  dirExists: async (path: string) => {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: (...args) => wrapAsync(fs.mkdir)(...args).then(r => r.mapError(e => new FileSystemIOError(e.message))),
  writeFile: (...args) => wrapAsync(fs.writeFile)(...args).then(r => r.mapError(e => new FileSystemIOError(e.message))),
  readFile: async (filePath, encoding) => {
    try {
      const data = await fs.readFile(filePath, encoding ?? 'utf8');
      return ok(data);
    } catch (e) {
      return err(new FileSystemIOError((e as Error).message));
    }
  },
  readdir: async (dirPath, options) => {
    try {
      const entries = await fs.readdir(dirPath, options);
      return ok(entries);
    } catch (e) {
      return err(new FileSystemIOError((e as Error).message));
    }
  },
  cp: wrapAsync(fs.cp),
  rename: wrapAsync(fs.rename),
  rm: wrapAsync(fs.rm),
});
