import { type Result, ValidationError, err, ok } from '../common';
import { getProject } from './project';
import { scaffoldProject } from './scaffold';
import type { Project, ProjectManagerContext } from './types';
import path from 'node:path';

interface CreateProjectOptions {
  projectName: string;
  onProgress: (event: { step: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface FindProjectOptions {}

export interface ProjectManager {
  create: (input: CreateProjectOptions) => Promise<Result<Project>>;
  find: (input: FindProjectOptions) => Promise<Result<Project>>;
}

export function getProjectManager(context: ProjectManagerContext): ProjectManager {
  const projectManagerLogger = context.logger.child('project-manager');

  const newContext = {
    ...context,
    logger: projectManagerLogger,
  };
  return {
    create: async input => {
      projectManagerLogger.info(`creating project with input=${JSON.stringify(input)}`);

      const outputDir = path.resolve(input.projectName);

      if (await context.env.fs.dirExists(outputDir)) {
        return err(new ValidationError(`Directory ${outputDir} already exists`));
      }

      const mkdirResult = await context.env.fs.mkdir(outputDir, { recursive: true });

      if (!mkdirResult.success) return mkdirResult;

      input.onProgress({ step: 'scaffold' });

      const scaffoldResult = await scaffoldProject(newContext, { outputDir });

      return scaffoldResult;
    },

    find: async _input => {
      projectManagerLogger.info(`finding project`);
      return ok(getProject(context, {}));
    },
  };
}
