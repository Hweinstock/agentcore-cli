import { type Result, ValidationError, ok, unwrapResult } from '../../common';
import { getTestCommand, getTestCommandContext } from '../../testing';
import type { CommandContext } from '../types';
import { withInputValidation, withLogging, withTelemetry } from './common';
import { describe, expect, it } from 'vitest';
import z from 'zod';

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

describe('withInputValidation', () => {
  it('passes valid input to handler', async () => {
    const schema = z.object({ name: z.string() });
    let capturedInput: unknown;
    const command = getTestCommand({
      schema,
      handler: async (_ctx, input) => {
        capturedInput = input;
        return ok();
      },
    });
    const wrapped = withInputValidation(command);

    await wrapped.handler(getTestCommandContext(), { name: 'hello' });

    expect(capturedInput).toEqual({ name: 'hello' });
  });

  it('returns error for invalid input without calling handler', async () => {
    const schema = z.object({ name: z.string() });
    let handlerCalled = false;
    const command = getTestCommand({
      schema,
      handler: async () => {
        handlerCalled = true;
        return ok();
      },
    });
    const wrapped = withInputValidation(command);

    const result: Result = await wrapped.handler(getTestCommandContext(), { name: 123 });

    expect(() => unwrapResult(result)).toThrow(ValidationError);
    expect(handlerCalled).toBe(false);
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
