import type { Result } from '../common';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { TelemetryClient } from '../telemetry';
import { type BuildProjectInput, type Project, buildProject } from './project-builder';
import { type ProjectConfigAccessor, getProjectConfigAccessor } from './project-config';
import { type DeployProjectInput, deployProject } from './project-deployer';

export interface ProjectManagerContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
}

export interface ProjectManager {
  /* Checks if the CLI is running within a valid AgentCore Project */
  hasProject: () => boolean;
  /* Builds a project from the templates */
  build: (input: BuildProjectInput) => Promise<Result<Project>>;
  /* Deploys a project */
  deploy: (input: DeployProjectInput) => Promise<Result>;
  /* Access to AgentCore schema (agentcore.json)*/
  configAccessor: ProjectConfigAccessor;
}

export const getProjectManager = (context: ProjectManagerContext): ProjectManager => {
  const projectContext = {
    ...context,
    logger: context.logger.child('project-manager'),
  };

  return {
    hasProject: () => false,
    build: input => buildProject(projectContext, input),
    deploy: input => deployProject(projectContext, input),
    configAccessor: getProjectConfigAccessor(projectContext),
  };
};
