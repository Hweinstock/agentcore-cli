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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = Result<any>;

export type AgentCoreCommandHandler<
  SchemaType extends z.ZodObject = typeof _emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
  OutputType extends AnyResult = AnyResult,
> = (context: CommandContext, input: z.infer<SchemaType>) => Promise<OutputType>;

export interface AgentCoreCommandSpec<
  SchemaType extends z.ZodObject = typeof _emptyZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
  OutputType extends AnyResult = AnyResult,
> {
  schema: SchemaType;
  handler: AgentCoreCommandHandler<SchemaType, CommandContext, OutputType>;
  setup: (context: CommandContext, parentCommand: Command) => Command;
}

export interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}
