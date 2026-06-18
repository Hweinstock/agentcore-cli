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
        return err(new ValidationError(`directory ${outputDir} already exists`));
      }

      const mkdirResult = await context.env.fs.mkdir(outputDir, { recursive: true });

      if (!mkdirResult.success) return mkdirResult;

      input.onProgress({ step: 'scaffold' });

      const scaffoldResult = await scaffoldProject(newContext, {
        outputDir,
        projectName: input.projectName,
        targets: [],
      });

      if (!scaffoldResult.success) {
        context.logger.info(`failed to scaffold project, deleting partially created project`);
        const cleanupResult = await context.env.fs.rm(outputDir, { recursive: true, force: true });
        context.logger.info(`auto cleanup result=${cleanupResult.success}`);
      }

      return scaffoldResult;
    },

    find: async _input => {
      projectManagerLogger.info(`finding project`);
      const noProjectFoundResult = err(new ValidationError(`no agentcore project found`));

      const cwd = context.env.process.cwd();
      projectManagerLogger.debug(`cwd=${cwd}`);

      const currentDirFilesResult = await context.env.fs.readdir(cwd, { withFileTypes: true });

      if (!currentDirFilesResult.success) {
        projectManagerLogger.debug(`readdir cwd failed: ${currentDirFilesResult.error.message}`);
        return noProjectFoundResult;
      }

      const files = currentDirFilesResult.data;
      projectManagerLogger.debug(`entries: ${files.map(f => `${f.name}(dir=${String(f.isDirectory())})`).join(', ')}`);

      const agentcoreDir = files.find(f => f.isDirectory() && f.name === 'agentcore');
      const appDir = files.find(f => f.isDirectory() && f.name === 'app');

      if (agentcoreDir === undefined || appDir === undefined) {
        projectManagerLogger.debug(`missing: agentcore=${String(!!agentcoreDir)} app=${String(!!appDir)}`);
        return noProjectFoundResult;
      }

      const agentcoreFilesResult = await context.env.fs.readdir(path.join(cwd, 'agentcore'), { withFileTypes: true });

      if (!agentcoreFilesResult.success) {
        projectManagerLogger.debug(`readdir agentcore/ failed: ${agentcoreFilesResult.error.message}`);
        return noProjectFoundResult;
      }

      const agentcoreFiles = agentcoreFilesResult.data;
      projectManagerLogger.debug(
        `agentcore/ entries: ${agentcoreFiles.map(f => `${f.name}(file=${String(f.isFile())})`).join(', ')}`
      );

      const agentcoreConfigFile = agentcoreFiles.find(f => f.isFile() && f.name === 'agentcore.json');

      if (!agentcoreConfigFile) {
        projectManagerLogger.debug(`agentcore.json not found as file`);
        return noProjectFoundResult;
      }

      const projectName = path.basename(cwd);
      projectManagerLogger.debug(`project found: ${projectName} at ${cwd}`);
      return ok(getProject(context, { path: cwd, projectName }));
    },
  };
}
