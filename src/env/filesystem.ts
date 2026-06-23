import { type Result, type ResultWrapped, err, ok, wrapAsync } from '../common';
import type { EnvironmentAccessorContext } from './accessor';
import * as fs from 'node:fs/promises';

export interface FilesystemAccessor {
  dirExists: (path: string) => Promise<boolean>;
  mkdir: ResultWrapped<typeof fs.mkdir>;
  writeFile: ResultWrapped<typeof fs.writeFile>;
  readFile: (path: string, encoding: BufferEncoding) => Promise<Result<string>>;
  readdir: (path: string, options: { withFileTypes: true }) => Promise<Result<import('node:fs').Dirent[]>>;
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
  mkdir: wrapAsync(fs.mkdir),
  writeFile: wrapAsync(fs.writeFile),
  readFile: async (filePath, encoding) => {
    try {
      const data = await fs.readFile(filePath, encoding);
      return ok(data);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
  readdir: async (dirPath, options) => {
    try {
      const entries = await fs.readdir(dirPath, options);
      return ok(entries);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
  cp: wrapAsync(fs.cp),
  rename: wrapAsync(fs.rename),
  rm: wrapAsync(fs.rm),
});
