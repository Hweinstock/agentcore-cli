import { ok } from '../../common';
import { getTestCommand, getTestCommandContext } from '../../testing';
import type { CommandContext } from '../types';
import { withLogging, withTelemetry } from './common';
import { describe, expect, it } from 'vitest';

describe('withLogging', () => {
  it('creates a child logger with command name', async () => {
    let capturedContext: CommandContext | undefined;
    const command = getTestCommand({
      handler: async ctx => {
        capturedContext = ctx;
        return ok();
      },
    });
    const context = getTestCommandContext();
    const wrapped = withLogging(command);

    const result = await wrapped.handler(context, {});

    expect(result.success).toBe(true);
    expect(capturedContext).toBeDefined();
    expect(capturedContext!.fileLogger).not.toBe(context.fileLogger);
  });

  it('returns the handler result', async () => {
    const expected = ok({ value: 'test' });
    const command = getTestCommand({ handler: () => Promise.resolve(expected) });
    const wrapped = withLogging(command);

    const actual = await wrapped.handler(getTestCommandContext(), {});
    expect(actual).toBe(expected);
  });
});

describe('withTelemetry', () => {
  it('calls handler and returns its result', async () => {
    const expected = ok({ done: true });
    const command = getTestCommand({ handler: () => Promise.resolve(expected) });
    const wrapped = withTelemetry(command);

    const result = await wrapped.handler(getTestCommandContext(), {});
    expect(result).toBe(expected);
  });
});
