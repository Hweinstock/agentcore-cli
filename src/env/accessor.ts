import { type Result, err, ok } from '../common';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { AWSEnvironmentAccessor } from './aws';
import { getAWSEnvironmentAccessor } from './aws';
import type { FilesystemAccessor } from './filesystem';
import { getFilesystemAccessor } from './filesystem';
import type { ProcessManager } from './process-manager';
import { getProcessManager } from './process-manager';

export interface EnvironmentAccessorContext {
  logger: Logger;
  globalConfigAccessor: GlobalConfigAccessor;
}

export interface EnvironmentAccessor {
  aws: AWSEnvironmentAccessor;
  fs: FilesystemAccessor;
  process: ProcessManager;

  readEnvVar: (key: string, fallback?: string) => Result<{ value: string }>;

  validateNodeVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
  validateUvVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
}

export const getEnvironmentAccessor = (
  context: EnvironmentAccessorContext,
  options?: {
    aws?: AWSEnvironmentAccessor;
    fs?: FilesystemAccessor;
    process?: ProcessManager;
  }
): EnvironmentAccessor => {
  return {
    aws: options?.aws ?? getAWSEnvironmentAccessor(context),
    fs: options?.fs ?? getFilesystemAccessor(context),
    readEnvVar: (key, fallback) => {
      const value = process.env[key];

      if (value !== undefined) {
        return ok({ value });
      }

      if (fallback !== undefined) {
        context.logger.warn(`Failed to find value for ${key}, using fallback=${fallback}`);
        return ok({ value: fallback });
      }

      return err(new Error(`Missing env key ${key}`));
    },
    process: options?.process ?? getProcessManager(context),
    validateNodeVersion: async () => ok({ satisfied: true, version: '20' }),
    validateUvVersion: async () => ok({ satisfied: true, version: '2' }),
  };
};
