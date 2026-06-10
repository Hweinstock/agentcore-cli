import { type Result, ok } from '../../common';
import type { GlobalConfigAccessor } from '../../global-config';
import type { Logger } from '../../logging';
import type { TelemetryClient } from '../../telemetry';

export interface DeployProjectInput {
  // send events as deployment progresses
  onProgress: (event: unknown) => void;
}

interface DeployProjectContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
}

export async function deployProject(context: DeployProjectContext, input: DeployProjectInput): Promise<Result> {
  context.logger.info(`deploying project with input ${JSON.stringify(input)}`);
  return ok();
}
