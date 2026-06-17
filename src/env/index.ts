import { type Result, type ResultWrapped, err, ok, wrapInResult } from '../common';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import * as fs from 'node:fs/promises';

interface EnvironmentAccessorContext {
  logger: Logger;
  globalConfigAccessor: GlobalConfigAccessor;
}

interface AWSEnvironmentAccessor {
  getAccount: () => Promise<Result<{ account: string }>>;
  getRegion: () => Promise<Result<{ region?: string }>>;
}

interface FilesystemAccessor {
  dirExists: (path: string) => Promise<boolean>;
  mkdir: ResultWrapped<typeof fs.mkdir>;
}

export interface EnvironmentAccessor {
  aws: AWSEnvironmentAccessor;
  fs: FilesystemAccessor;

  readEnvVar: (key: string, fallback?: string) => Result<{ value: string }>;

  validateNodeVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
  validateUvVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
}

const getAWSEnvironmentAccessor = (_context: EnvironmentAccessorContext): AWSEnvironmentAccessor => ({
  getAccount: async () => ok({ account: '1111111111' }),
  getRegion: async () => ok({ region: 'us-east-1' }),
});

const getFilesystemAccessor = (_context: EnvironmentAccessorContext): FilesystemAccessor => ({
  dirExists: async (path: string) => {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: wrapInResult(fs.mkdir),
});

export const getEnvironmentAccessor = (context: EnvironmentAccessorContext): EnvironmentAccessor => {
  return {
    aws: getAWSEnvironmentAccessor(context),
    fs: getFilesystemAccessor(context),
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
    validateNodeVersion: async () => ok({ satisfied: true, version: '20' }),
    validateUvVersion: async () => ok({ satisfied: true, version: '2' }),
  };
};
