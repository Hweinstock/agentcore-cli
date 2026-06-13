import type { Result } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { FileLogger, Logger } from '../logging';
import type { ProjectManager } from '../project';
import type { TelemetryClient } from '../telemetry';
import type { TuiScreenRenderer } from '../ui/';
import type { Command } from '@commander-js/extra-typings';
import z from 'zod';

export interface BaseCommandContext {
  fileLogger: FileLogger;
  consoleLogger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  environmentAccessor: EnvironmentAccessor;
  tuiScreenRenderer: TuiScreenRenderer;
  projectManager: ProjectManager;
}

export interface AgentCoreCommand<CommandContext extends BaseCommandContext = BaseCommandContext> {
  register: (context: CommandContext, parentCommand?: Command) => Command;
}

const _emptyZodObject = z.object({});

export type AgentCoreCommandHandler<
  SchemaType extends z.ZodObject = typeof _emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
> = (context: CommandContext, input: z.infer<SchemaType>) => Promise<Result>;

export interface AgentCoreCommandSpec<
  SchemaType extends z.ZodObject = typeof _emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
> {
  schema: SchemaType;
  handler: AgentCoreCommandHandler<SchemaType, CommandContext>;
  setup: (context: CommandContext, parentCommand: Command) => Command;
}

export interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}
