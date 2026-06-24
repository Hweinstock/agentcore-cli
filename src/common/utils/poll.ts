import { PollTimeoutError } from '../errors';

interface RetryOpts<T> {
  operation: () => T | Promise<T>;
  condition: (result: T) => boolean;
  interval: number;
  maxAttempts: number;
  throwOnError?: boolean;
}

export const retry = async <T>({
  operation,
  condition,
  interval,
  maxAttempts,
  throwOnError,
}: RetryOpts<T>): Promise<T> => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await operation();
      if (condition(result)) return result;
    } catch (e) {
      if (throwOnError) throw e;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new PollTimeoutError(`retry exhausted after ${maxAttempts} attempts`);
};
