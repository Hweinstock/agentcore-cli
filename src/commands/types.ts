import type { AnyResult, Result } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { ProjectManager } from '../project';
import type { Project } from '../project/types';
import type { AttributeRecorder, CommandRunAttributes, TelemetryClient } from '../telemetry';
import type { TuiScreenRenderer } from '../ui/';
import type { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

export interface CommandRouterContext {
  fileLogger: Logger;
  consoleLogger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  environmentAccessor: EnvironmentAccessor;
  tuiScreenRenderer: TuiScreenRenderer;
  projectManager: ProjectManager;
}

// These are fields populated by the middleware chain
export interface CommandContext extends CommandRouterContext {
  telemetryRecorder?: AttributeRecorder<CommandRunAttributes>;
  project?: Project;
}

const _emptyZodObject = z.object({});

export type CommandHandler<SchemaType extends z.ZodObject = typeof _emptyZodObject> = (
  context: CommandContext,
  input: z.infer<SchemaType>
) => Promise<AnyResult>;

export interface Command<SchemaType extends z.ZodObject = z.ZodObject> {
  name: string;
  schema: SchemaType;
  handler: CommandHandler<SchemaType>;
  middleware?: CommandMiddleware<SchemaType>[];
  setup: (context: CommandContext, parentCommand: CommanderCommand) => CommanderCommand;
}

export type CommandMiddleware<SchemaType extends z.ZodObject = typeof _emptyZodObject> = (
  command: Command<SchemaType>
) => Command<SchemaType>;

export interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}
