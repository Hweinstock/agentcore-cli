import { type Result, err, ok } from '../common';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';

interface EnvironmentAccessorContext {
  logger: Logger;
  globalConfigAccessor: GlobalConfigAccessor;
}

export interface EnvironmentAccessor {
  detectAWSAccount: () => Promise<Result<{ account: string }>>;
  detectAWSRegion: () => Promise<Result<{ region?: string }>>;
  readEnvVar: (key: string, fallback?: string) => Result<{ value: string }>;

  validateNodeVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
  validateUvVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
}

export const getEnvironmentAccessor = (context: EnvironmentAccessorContext): EnvironmentAccessor => {
  return {
    detectAWSAccount: async () => ok({ account: '1111111111' }),
    detectAWSRegion: async () => ok({ region: 'us-east-1' }),
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
