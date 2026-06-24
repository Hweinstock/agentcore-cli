import { ProjectTestingHelpers } from '../../../project';
import { getTestCommandContext } from '../../testing';
import { addAgentCommand } from './agent';
import { describe, expect, it } from 'vitest';

describe('add agent handler', () => {
  it('adds agent with defaults when only name is provided', async () => {
    const project = ProjectTestingHelpers.getInMemoryProject();
    const context = getTestCommandContext({ project });
    const result = await addAgentCommand.handler(context, { name: 'my-agent' });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    // TODO: actually assert that the default fields are filled
    expect(configResult.success && configResult.data.config.agents).toContain('my-agent');
  });

  it('passes explicit options through', async () => {
    const project = ProjectTestingHelpers.getInMemoryProject();
    const context = getTestCommandContext({ project });
    const result = await addAgentCommand.handler(context, {
      name: 'ts-agent',
      language: 'typescript',
      framework: 'langchain_langgraph',
      protocol: 'mcp',
      memory: 'longAndShort',
      buildType: 'container',
    });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    // TODO: actually assert they make it to the project.
    expect(configResult.success && configResult.data.config.agents).toContain('ts-agent');
  });
});
