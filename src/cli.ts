import { getCommandExecutor } from './commands';
import {
  AgentCoreError,
  type Logger,
  type Result,
  getGlobalConfigAccessor,
  getLogger,
  getTelemetryClient,
} from './common';

export async function main(args: string[]): Promise<void> {
  // bootstrap shared dependencies
  const globalConfigAccessor = getGlobalConfigAccessor();
  const logger = getLogger();
  const telemetry = await globalConfigAccessor.get('telemetry');
  const telemetryClient = getTelemetryClient({
    logger,
    config: telemetry.success ? telemetry.data?.value : undefined,
  });
  const commandExecutor = getCommandExecutor({ globalConfigAccessor, logger, telemetryClient });

  const result = await commandExecutor.route(args);

  printPostCommandNotices(logger);
  exitProcess(result, logger);
}

function exitProcess(result: Result, logger: Logger): void {
  if (!result.success && result.error instanceof AgentCoreError) {
    logger.error(`Error: ${result.error.message}`);
    process.exit(result.error.exitCode);
  }

  if (!result.success) {
    logger.error(`Error: an unexpeected error occurred, see the logs at ${logger.getFilePath()} for more information`);
    process.exit(1);
  }

  process.exit(0);
}

function printPostCommandNotices(logger: Logger): void {
  logger.info('command ran!');
}
