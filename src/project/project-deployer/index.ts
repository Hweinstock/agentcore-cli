import { type GlobalConfigAccessor, type Logger, type Result, type TelemetryClient, ok } from '../../common';

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
