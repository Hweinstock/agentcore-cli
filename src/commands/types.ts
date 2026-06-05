import type { GlobalConfigAccessor, Logger, TelemetryClient } from '../common';
import type { Command } from '@commander-js/extra-typings';

export interface CommandOptions {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
}

export interface AgentCoreCommand {
  register: (props: CommandOptions, parentCommand: Command) => Command;
}
