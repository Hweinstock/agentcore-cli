import { readFileSync } from 'fs';
import { join } from 'path';
import { expect } from 'vitest';

export interface GlobalConfigHelper {
  assertFieldEquals: (dottedPath: string, expected: unknown) => void;
  read: () => Record<string, unknown>;
}

export function globalConfig(configDir: string): GlobalConfigHelper {
  const filePath = join(configDir, 'config.json');

  const read = () => JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;

  return {
    read,
    assertFieldEquals: (dottedPath, expected) => {
      const config = read();
      const value = dottedPath.split('.').reduce<unknown>((obj, key) => {
        return obj != null && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
      }, config);
      expect(value, `expected config.${dottedPath} to equal ${JSON.stringify(expected)}`).toEqual(expected);
    },
  };
}
