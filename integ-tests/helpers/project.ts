import { getTmpDir } from './common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { expect } from 'vitest';

export interface ProjectHelper {
  assertConfigContains: (key: string, value: string) => void;
  assertConfigNotContains: (key: string, value: string) => void;
  assertExists: (relativePath: string) => void;
}

export function project(projectName: string): ProjectHelper {
  const dir = join(getTmpDir(), projectName);
  return {
    assertConfigContains: (key, value) => {
      const config = JSON.parse(readFileSync(join(dir, 'agentcore', 'agentcore.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(config[key]).toContain(value);
    },
    assertConfigNotContains: (key, value) => {
      const config = JSON.parse(readFileSync(join(dir, 'agentcore', 'agentcore.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(config[key]).not.toContain(value);
    },
    assertExists: relativePath => {
      expect(existsSync(join(dir, relativePath))).toBe(true);
    },
  };
}
