import { getInMemoryProject, getTestCommandContext } from '../../../testing';
import { removeAgentCommand } from './agent';
import { describe, expect, it } from 'vitest';

describe('remove agent handler', () => {
  it('removes agent from config', async () => {
    const project = getInMemoryProject();
    await project.config.add('agents', 'my-agent');
    const context = getTestCommandContext({ project });

    const result = await removeAgentCommand.handler(context, { name: 'my-agent' });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    expect(configResult.success && configResult.data.config.agents).not.toContain('my-agent');
  });
});
