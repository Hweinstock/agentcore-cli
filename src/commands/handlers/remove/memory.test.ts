import { getInMemoryProject, getTestCommandContext } from '../../../testing';
import { removeMemoryCommand } from './memory';
import { describe, expect, it } from 'vitest';

describe('remove memory handler', () => {
  it('removes memory from config', async () => {
    const project = getInMemoryProject();
    await project.config.add('memories', 'my-memory');
    const context = getTestCommandContext({ project });

    const result = await removeMemoryCommand.handler(context, { name: 'my-memory' });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    expect(configResult.success && configResult.data.config.memories).not.toContain('my-memory');
  });
});
