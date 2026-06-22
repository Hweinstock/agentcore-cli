import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempDir {
  getPath: (filename: string) => string;
  destroy: () => void;
}

export const createTempDir = (parent?: string): TempDir => {
  const dir = mkdtempSync(join(parent ?? tmpdir(), 'test-'));
  return {
    getPath: filename => join(dir, filename),
    destroy: () => rmSync(dir, { recursive: true, force: true }),
  };
};
