import type { Result } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { TelemetryClient } from '../telemetry';
import type { ProjectConfigAccessor } from './config-accessor';

export interface ProjectManagerContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  env: EnvironmentAccessor;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AddAgentOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DeployProjectOptions {}

export interface Project {
  addAgent: (input: AddAgentOptions) => Promise<Result<Project>>;
  deploy: (input: DeployProjectOptions) => Promise<Result<Project>>;
  config: ProjectConfigAccessor;
}
