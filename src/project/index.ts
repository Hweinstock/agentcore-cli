import type { GlobalConfigAccessor, Logger, Result, TelemetryClient } from '../common';
import { type BuildProjectInput, type Project, buildProject } from './project-builder';
import { type ProjectConfigAccessor, getProjectConfigAccessor } from './project-config';
import { type DeployProjectInput, deployProject } from './project-deployer';

export interface ProjectManagerContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
}

export interface ProjectManager {
  hasProject: () => boolean;
  build: (input: BuildProjectInput) => Promise<Result<Project>>;
  deploy: (input: DeployProjectInput) => Promise<Result>;
  configAccessor: ProjectConfigAccessor;
}

export const getProjectManager = (context: ProjectManagerContext): ProjectManager => {
  const projectContext = {
    ...context,
    logger: context.logger.child('project-manager'),
  };

  return {
    hasProject: () => true,
    build: input => buildProject(projectContext, input),
    deploy: input => deployProject(projectContext, input),
    configAccessor: getProjectConfigAccessor(projectContext),
  };
};
