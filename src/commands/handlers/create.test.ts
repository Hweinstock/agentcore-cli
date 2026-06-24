import { ProjectTestingHelpers } from '../../project';
import { getTestCommandContext } from '../testing';
import { createCommand } from './create';
import { describe, expect, it } from 'vitest';

describe('create handler', () => {
  it('creates a project', async () => {
    const projectManager = ProjectTestingHelpers.getInMemoryProjectManager();
    const context = getTestCommandContext({ projectManager });
    const result = await createCommand.handler(context, { projectName: 'my-project' });

    result.unwrap();

    const projectLookup = await projectManager.find();
    const project = projectLookup.unwrap();
    expect(project).toBeDefined();
  });

  it('creates a project and adds an agent when --agent is true', async () => {
    const projectManager = ProjectTestingHelpers.getInMemoryProjectManager();
    const context = getTestCommandContext({ projectManager });
    const result = await createCommand.handler(context, { projectName: 'my-project', agent: true });

    result.unwrap();
    const projectLookup = await projectManager.find();
    const project = projectLookup.unwrap();

    const agentsLookup = await project.config.get('agents');
    const agents = agentsLookup.unwrap();
    expect(agents.value).toContain('my-project');
  });
});
