import { type Result, ok } from '../common';
import type { EnvironmentAccessorContext } from './accessor';

export interface AWSEnvironmentAccessor {
  getAccount: () => Promise<Result<{ account: string }>>;
  getRegion: () => Promise<Result<{ region?: string }>>;
}

export const getAWSEnvironmentAccessor = (_context: EnvironmentAccessorContext): AWSEnvironmentAccessor => ({
  getAccount: async () => ok({ account: '1111111111' }),
  getRegion: async () => ok({ region: 'us-east-1' }),
});
