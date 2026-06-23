import type { Result } from '../common';
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

export interface FlagDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: S;
  required?: boolean;
  usage: string;
  description: string;
  hidden?: () => boolean;
}

export type CommandFlags = Record<string, FlagDefinition>;

export type CommandSchema<F extends CommandFlags> = z.ZodObject<{ [K in keyof F]: F[K]['schema'] }>;

export type CommandHandler<SchemaType extends z.ZodObject = typeof _emptyZodObject> = (
  context: CommandContext,
  input: z.infer<SchemaType>
) => Promise<Result<unknown>>;

export interface Command<F extends CommandFlags> {
  name: string;
  flags: F;
  handler: CommandHandler<CommandSchema<F>>;
  middleware?: CommandMiddleware<F>[];
  setup: (context: CommandContext, parentCommand: CommanderCommand) => CommanderCommand;
}

export type CommandMiddleware<F extends CommandFlags> = (command: Command<F>) => Command<F>;

export interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}
