import { unwrapResult } from '../../common';
import { getTestCommandContext } from '../../testing';
import { createCommand } from './create';
import { describe, expect, it } from 'vitest';

describe('create handler', () => {
  it('creates a project', async () => {
    const context = getTestCommandContext();
    const result = await createCommand.handler(context, { projectName: 'my-project' });

    expect(result.success).toBe(true);

    const projectLookup = await context.projectManager.find();

    const project = unwrapResult(projectLookup);
    expect(project).toBeDefined();
  });

  it('creates a project and adds an agent when --agent is true', async () => {
    const context = getTestCommandContext();
    const result = await createCommand.handler(context, { projectName: 'my-project', agent: true });

    expect(result.success).toBe(true);

    const projectLookup = await context.projectManager.find();

    const project = unwrapResult(projectLookup);

    const agentsLookup = await project.config.get('agents');
    const agents = unwrapResult(agentsLookup);
    expect(agents.value).toContain('my-project');
  });
});
