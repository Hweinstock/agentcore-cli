import { getInMemoryProject, getTestCommandContext } from '../../testing';
import { deployCommand } from './deploy';
import { describe, expect, it } from 'vitest';

describe('deploy handler', () => {
  it('deploys when options are provided', async () => {
    const project = getInMemoryProject();
    const context = getTestCommandContext({ project });
    const result = await deployCommand.handler(context, { yes: true });

    expect(result.success).toBe(true);
    // TODO: verify deployed state has changed.
  });
});
