import { NoProjectFoundError, ok } from '../../common';
import { getTestCommand, getTestCommandContext } from '../../testing';
import type { CommandContext } from '../types';
import { withProject } from './withProject';
import { describe, expect, it } from 'vitest';

describe('withProject', () => {
  it('attaches project to context when found', async () => {
    let capturedContext: CommandContext | undefined;
    const command = getTestCommand({
      handler: async ctx => {
        capturedContext = ctx;
        return ok();
      },
    });
    const context = getTestCommandContext();
    await context.projectManager.create({ projectName: 'test' });
    const wrapped = withProject(command);

    await wrapped.handler(context, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.project).toBeDefined();
  });

  it('returns error when no project found', async () => {
    let handlerCalled = false;
    const command = getTestCommand({
      handler: async () => {
        handlerCalled = true;
        return ok();
      },
    });
    const wrapped = withProject(command);

    const result = await wrapped.handler(getTestCommandContext(), {});

    expect(() => result.unwrap()).toThrow(NoProjectFoundError);
    expect(handlerCalled).toBe(false);
  });
});
