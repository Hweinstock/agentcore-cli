import type { ClientRegistry, GlobalConstants, Result } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { TelemetryClient } from '../telemetry';
import type { ProjectConfigAccessor } from './config-accessor';
import type { AddAgentOptions } from './project';

export interface ProjectManagerContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  env: EnvironmentAccessor;
  constants: GlobalConstants;
  clientRegistry: ClientRegistry;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DeployProjectOptions {}

interface StartDevServerOptions {
  agentName: string;
  port: number;
}

interface InvokeDevServerOptions {
  port: number;
  prompt: string;
  stream: boolean;
}

export interface Project {
  addAgent: (input: AddAgentOptions) => Promise<Result>;
  deploy: (input: DeployProjectOptions) => Promise<Result>;
  startDevServer: (input: StartDevServerOptions) => Promise<Result>;
  invokeDevServer: (input: InvokeDevServerOptions) => Promise<Result<{ response: string }>>;
  config: ProjectConfigAccessor;
}
