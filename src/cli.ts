import { getCommandRouter } from './commands';
import {
  AgentCoreError,
  type GlobalConfig,
  type Logger,
  type Result,
  getGlobalConfigAccessor,
  getLogger,
  getTelemetryClient,
  unwrapResult,
} from './common';

export async function main(args: string[]): Promise<void> {
  const config = await bootstrapConfig();
  const logger = getLogger(config.logging ?? {});
  const telemetryClient = getTelemetryClient({
    logger,
    config: config.telemetry ?? {},
  });
  const globalConfigAccessor = getGlobalConfigAccessor({ logger });
  const commandRouter = getCommandRouter({ globalConfigAccessor, logger, telemetryClient });

  const result = await commandRouter.route(args);

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

// Load in config (without logging) to initialize the root level logging and telemetry clients.
async function bootstrapConfig(): Promise<Pick<GlobalConfig, 'telemetry' | 'logging'>> {
  const accessor = getGlobalConfigAccessor();

  return {
    logging: unwrapResult(await accessor.get('logging'), { value: {} }).value,
    telemetry: unwrapResult(await accessor.get('telemetry'), { value: {} }).value,
  };
}
