import type { FileLogger, GlobalConfigAccessor, Logger, Result, TelemetryClient } from '../common';
import type { ProjectBuilder } from '../project';
import type { TuiScreenRenderer } from '../ui/';
import type { Command } from '@commander-js/extra-typings';

export interface BaseCommandContext {
  fileLogger: FileLogger;
  consoleLogger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  tuiScreenRenderer: TuiScreenRenderer;
  projectBuilder: ProjectBuilder;
}

export interface AgentCoreCommand<CommandContext extends BaseCommandContext = BaseCommandContext> {
  register: (context: CommandContext, parentCommand: Command) => Command;
}

export type CommandHandler<
  InputType = {},
  CommandContext extends BaseCommandContext = BaseCommandContext,
  OutputType extends Result = Result,
> = (props: CommandContext, input: InputType) => Promise<OutputType>;
