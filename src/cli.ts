import { getCommandRouter } from './commands';
import {
  AgentCoreError,
  type Result,
  unwrapResult,
} from './common';
import { type GlobalConfig, getGlobalConfigAccessor } from './global-config';
import { type Logger, getFileLogger } from './logging';
import { getTelemetryClient } from './telemetry';
import { getProjectManager } from './project';
import { getConsoleLogger, getTuiScreenRenderer } from './ui';

export async function main(args: string[]): Promise<void> {
  // Setup Section

  // We bootstrap read the config to avoid circular dependencies.
  const config = await bootstrapConfig();
  const fileLogger = getFileLogger(config.logging ?? {});
  const consoleLogger = getConsoleLogger(config.logging ?? {});
  const telemetryClient = getTelemetryClient({
    logger: fileLogger,
    config: config.telemetry ?? {},
  });
  const globalConfigAccessor = getGlobalConfigAccessor({ logger: fileLogger });

  const projectManager = getProjectManager({ telemetryClient, logger: fileLogger, globalConfigAccessor });

  // Leaf Nodes in the Dependency Tree.
  const tuiScreenRenderer = getTuiScreenRenderer({
    logger: fileLogger,
    telemetryClient,
    globalConfigAccessor,
    projectManager,
  });
  const commandRouter = getCommandRouter({
    globalConfigAccessor,
    fileLogger,
    consoleLogger,
    telemetryClient,
    tuiScreenRenderer,
    projectManager,
  });

  // Execute Section
  const result = await commandRouter.route(args);

  // Post Execute section
  printPostCommandNotices(consoleLogger);
  exitProcess(result, fileLogger.getFilePath(), consoleLogger);
}

function exitProcess(result: Result, logFilePath: string, consoleLogger: Logger): void {
  if (!result.success && result.error instanceof AgentCoreError) {
    consoleLogger.error(`Error: ${result.error.message}`);
    process.exit(result.error.exitCode);
  }

  if (!result.success) {
    consoleLogger.error(`Error: an unexpeected error occurred, see the logs at ${logFilePath} for more information`);
    process.exit(1);
  }

  process.exit(0);
}

function printPostCommandNotices(consoleLogger: Logger): void {
  consoleLogger.info('here is a post command notice!');
}

// Load in config (without logging) to initialize the root level logging and telemetry clients.
async function bootstrapConfig(): Promise<Pick<GlobalConfig, 'telemetry' | 'logging'>> {
  const accessor = getGlobalConfigAccessor();

  return {
    logging: unwrapResult(await accessor.get('logging'), { value: {} }).value,
    telemetry: unwrapResult(await accessor.get('telemetry'), { value: {} }).value,
  };
}
