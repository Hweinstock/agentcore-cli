import type { ClientRegistry, GlobalConstants, Result } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { AgentBuildType, AgentFramework, AgentLanguage, AgentMemory, AgentProtocol } from '../schemas';
import type { TelemetryClient } from '../telemetry';
import type { AgentTemplateValues, TemplateRenderer } from '../templates';
import type { ProjectConfigAccessor } from './config-accessor';

export interface AddAgentOptions {
  agentName: string;
  language: AgentLanguage;
  framework: AgentFramework;
  protocol: AgentProtocol;
  memory: AgentMemory;
  buildType: AgentBuildType;
}

export interface ProjectManagerContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  env: EnvironmentAccessor;
  constants: GlobalConstants;
  clientRegistry: ClientRegistry;
  agentTemplateRenderer: TemplateRenderer<AgentTemplateValues>;
}

export interface OnProgressEvent {
  step: string;
}

export interface CreateProjectOptions {
  projectName: string;
  noInstall?: boolean;
  onProgress?: (event: OnProgressEvent) => void;
}

export interface ProjectManager {
  create: (input: CreateProjectOptions) => Promise<Result<Project>>;
  find: () => Promise<Result<Project>>;
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
