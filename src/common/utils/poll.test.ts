import { PollTimeoutError } from '../errors';
import { retry } from './poll';
import { describe, expect, it, vi } from 'vitest';

describe('retry', () => {
  it('returns immediately when condition is met on first attempt', async () => {
    const op = vi.fn(() => 'done');
    const result = await retry({ operation: op, condition: r => r === 'done', interval: 0, maxAttempts: 3 });
    expect(result).toBe('done');
    expect(op).toHaveBeenCalledOnce();
  });

  it('retries until condition is met', async () => {
    let count = 0;
    const op = () => ++count;
    const result = await retry({ operation: op, condition: r => r >= 3, interval: 0, maxAttempts: 5 });
    expect(result).toBe(3);
  });

  it('throws after exhausting max attempts', async () => {
    const op = () => 0;
    await expect(retry({ operation: op, condition: r => r === 1, interval: 0, maxAttempts: 3 })).rejects.toThrow(
      PollTimeoutError
    );
  });

  it('swallows errors by default and keeps retrying', async () => {
    let count = 0;
    const op = () => {
      if (++count < 3) throw new Error('fail');
      return 'ok';
    };
    const result = await retry({ operation: op, condition: r => r === 'ok', interval: 0, maxAttempts: 5 });
    expect(result).toBe('ok');
  });

  it('throws immediately when throwOnError is true', async () => {
    const op = () => {
      throw new Error('boom');
    };
    await expect(
      retry({ operation: op, condition: () => true, interval: 0, maxAttempts: 3, throwOnError: true })
    ).rejects.toThrow('boom');
  });
});
