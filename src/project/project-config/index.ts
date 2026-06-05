import type { Result } from '../../common';

export interface ProjectConfigAccessor {
  get: (key?: string) => Result<{ value: string }>;
  set: (key: string, value: string) => Result<{ value: string }>;
  add: (key: string, value: string) => Result<{ values: string[] }>;
  remove: (key: string, value: string) => Result<{ values: string[] }>;
}
