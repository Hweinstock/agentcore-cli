import type { FileLogger, GlobalConfigAccessor, Logger, Result, TelemetryClient } from '../common';
import type { ProjectManager } from '../project';
import type { TuiScreenRenderer } from '../ui/';
import type { Command } from '@commander-js/extra-typings';
import z from 'zod';

export interface BaseCommandContext {
  fileLogger: FileLogger;
  consoleLogger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  tuiScreenRenderer: TuiScreenRenderer;
  projectManager: ProjectManager;
}

export interface AgentCoreCommand<CommandContext extends BaseCommandContext = BaseCommandContext> {
  register: (context: CommandContext, parentCommand: Command) => Command;
}

const emptyZodObject = z.object({});

export type AgentCoreCommandHandler<
  SchemaType extends z.ZodObject = typeof emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
> = (context: CommandContext, input: z.infer<SchemaType>) => Promise<Result>;

export interface AgentCoreCommandSpec<
  SchemaType extends z.ZodObject = typeof emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
> {
  schema: SchemaType;
  handler: AgentCoreCommandHandler<SchemaType, CommandContext>;
  setup: (context: CommandContext, parentCommand: Command) => Command;
}
