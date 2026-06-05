import type { GlobalConfigAccessor, Logger, Result, TelemetryClient } from '../common';
import type { Command } from '@commander-js/extra-typings';

export interface BaseCommandContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
}

export interface AgentCoreCommand<CommandContext extends BaseCommandContext = BaseCommandContext> {
  register: (context: CommandContext, parentCommand: Command) => Command;
}

export type CommandHandler<
  InputType = {},
  CommandContext extends BaseCommandContext = BaseCommandContext,
  OutputType extends Result = Result,
> = (props: CommandContext, input: InputType) => Promise<OutputType>;
