import { getCommandRouter } from './commands';
import { AgentCoreError, type Result, getClientRegistry, getGlobalConstants } from './common';
import { getEnvironmentAccessor } from './env';
import { type GlobalConfig, getGlobalConfigAccessor } from './global-config';
import { type Logger, getConsoleLogger, getFileLogger } from './logging';
import { getProjectManager } from './project';
import { getTelemetryClient } from './telemetry';
import { getTuiScreenRenderer } from './tui';

/**
 * this is the global entrypoint where we wire up all the dependencies and create context objects to inject into modules used for different pieces of functionality.
 */
export async function main(args: string[]): Promise<void> {
  const globalConstants = getGlobalConstants();
  // We bootstrap read the config to avoid circular dependencies.
  const config = await bootstrapConfig();

  const fileLogger = getFileLogger(config.logging ?? {});
  const consoleLogger = getConsoleLogger(config.logging ?? {});

  const telemetryClient = getTelemetryClient(
    {
      logger: fileLogger,
    },
    config.telemetry ?? {}
  );

  const globalConfigAccessor = getGlobalConfigAccessor({ logger: fileLogger });

  const environmentAccessor = getEnvironmentAccessor({ logger: fileLogger, globalConfigAccessor });

  const clientRegistry = getClientRegistry({ logger: fileLogger });

  const projectManager = getProjectManager({
    telemetryClient,
    logger: consoleLogger,
    globalConfigAccessor,
    env: environmentAccessor,
    constants: globalConstants,
    clientRegistry,
  });

  const tuiScreenRenderer = getTuiScreenRenderer({
    logger: fileLogger,
    telemetryClient,
    globalConfigAccessor,
    environmentAccessor,
    projectManager,
  });

  const commandRouter = getCommandRouter({
    globalConstants,
    globalConfigAccessor,
    environmentAccessor,
    fileLogger: consoleLogger,
    consoleLogger,
    telemetryClient,
    tuiScreenRenderer,
    projectManager,
  });

  // route and execute the command
  const result = await commandRouter.route(args);

  // post execute
  printPostCommandNotices(consoleLogger);
  exitProcess(result, globalConstants.defaultLogPath, consoleLogger);
}

function exitProcess(result: Result, logFilePath: string, consoleLogger: Logger): void {
  if (!result.success && result.error instanceof AgentCoreError) {
    consoleLogger.error(`Error: ${result.error.message}`);
    process.exit(result.error.exitCode);
  }

  if (!result.success) {
    consoleLogger.error(String(result.error));
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
    logging: (await accessor.get('logging')).unwrapOr({ value: {} }).value,
    telemetry: (await accessor.get('telemetry')).unwrapOr({ value: {} }).value,
  };
}
