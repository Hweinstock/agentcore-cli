import type { FileLogger, GlobalConfigAccessor, Logger, Result, TelemetryClient } from '../common';
import type { ProjectBuilder } from '../project';
import type { TuiScreenRenderer } from '../ui/';
import type { Command } from '@commander-js/extra-typings';
import z from 'zod';

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

const emptyZodObject = z.object({});

export interface AgentCoreCommandSpec<
  SchemaType extends z.ZodObject = typeof emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
> {
  schema: SchemaType;
  handler: (context: CommandContext, input: z.infer<SchemaType>) => Promise<Result>;
  setup: (context: CommandContext, parentCommand: Command) => Command;
}
