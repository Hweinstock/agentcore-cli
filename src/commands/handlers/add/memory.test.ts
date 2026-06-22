import { getInMemoryProject, getTestCommandContext } from '../../../testing';
import { addMemoryCommand } from './memory';
import { describe, expect, it } from 'vitest';

describe('add memory handler', () => {
  it('adds memory to config', async () => {
    const project = getInMemoryProject();
    const context = getTestCommandContext({ project });
    const result = await addMemoryCommand.handler(context, { name: 'my-memory' });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    // TODO: actually assert that the default fields are filled
    expect(configResult.success && configResult.data.config.memories).toContain('my-memory');
  });
});
