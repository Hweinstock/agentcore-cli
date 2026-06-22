import type { AnyResult, Result } from '../common';
import type { ProgramContext } from '../program-context';
import type { Project } from '../project/types';
import type { AttributeRecorder, CommandRunAttributes } from '../telemetry';
import type { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

// These are fields populated by the middleware chain
export interface CommandContext extends ProgramContext {
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
