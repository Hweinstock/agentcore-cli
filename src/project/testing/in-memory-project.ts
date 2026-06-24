import { NoProjectFoundError, err, getJsonDatastore, inMemorySource, ok } from '../../common';
import { getDefaultProjectConfig } from '../config-accessor';
import { projectConfigSchema } from '../types';
import type { Project, ProjectManager } from '../types';

export function getInMemoryProject(): Project {
  const config = getJsonDatastore(
    {},
    {
      schema: projectConfigSchema,
      source: inMemorySource(getDefaultProjectConfig()),
    }
  );

  return {
    config,
    addAgent: async input => {
      const result = await config.add('agents', input.agentName);
      if (!result.success) return result;
      return ok();
    },
    deploy: async () => ok(),
    startDevServer: async () => ok(),
    invokeDevServer: async () => ok({ response: '' }),
  };
}

export function getInMemoryProjectManager(): ProjectManager {
  let project: Project | undefined;

  return {
    create: async () => {
      project = getInMemoryProject();
      return ok(project);
    },
    find: async () => {
      if (!project) return err(new NoProjectFoundError('no agentcore project found'));
      return ok(project);
    },
  };
}
