import type { AsyncResult, ClientRegistry, GlobalConstants, JsonDatastore, Result } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { TelemetryClient } from '../telemetry';
import type { AgentBuildType, AgentFramework, AgentLanguage, AgentMemory, AgentProtocol } from './schemas';
import type { AgentTemplateValues, TemplateRenderer } from './templates';
import z from 'zod';

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

// This is a simplified config, intended to represent the agentcore.json schema.
export const projectConfigSchema = z.object({
  agents: z.array(z.string()),
  memories: z.array(z.string()),
  gateways: z.array(z.string()),
  harnesses: z.array(z.string()),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export type ProjectConfigAccessor<S extends Record<string, unknown> = ProjectConfig> = JsonDatastore<S>;

export interface Project {
  addAgent: (input: AddAgentOptions) => Promise<Result>;
  deploy: (input: DeployProjectOptions) => Promise<Result>;
  startDevServer: (input: StartDevServerOptions) => Promise<Result>;
  invokeDevServer: (input: InvokeDevServerOptions) => Promise<Result<{ response: string }>>;
  config: ProjectConfigAccessor;
}

export interface ProjectManager {
  create: (input: CreateProjectOptions) => AsyncResult<Project>;
  find: () => AsyncResult<Project>;
}
