import { type Result, ok } from '../../common';
import type { GlobalConfigAccessor } from '../../global-config';
import type { Logger } from '../../logging';
import type { TelemetryClient } from '../../telemetry';

export interface BuildProjectInput {
  name?: string;
  projectName?: string;
  language?: string;
  framework?: string;
  agent?: boolean;
  // Send events as progress updates
  onProgress: (event: unknown) => void;
}

interface BuildProjectContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
}

export type Project = {
  name: string;
};

export async function buildProject(context: BuildProjectContext, input: BuildProjectInput): Promise<Result<Project>> {
  const name = input.projectName ?? input.name ?? 'my-agent-project';
  context.logger.info(`building project ${name}`);
  return ok({ name });
}
