import type { Result } from '../common';
import type { ProgramContext } from '../program-context';
import type { Project } from '../project';
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

export interface ArgumentDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  schema: S;
  description: string;
  required?: boolean;
}

export type CommandFlags = Record<string, FlagDefinition>;

type EmptyCommandFlags = Record<never, FlagDefinition>;

export type CommandArguments = ArgumentDefinition[];

export type CommandSchema<
  F extends CommandFlags = EmptyCommandFlags,
  A extends CommandArguments = never[],
> = z.ZodObject<{ [K in keyof F]: F[K]['schema'] } & { [E in A[number] as E['name']]: E['schema'] }>;

export type CommandHandler<SchemaType extends z.ZodObject = typeof _emptyZodObject> = (
  context: CommandContext,
  input: z.infer<SchemaType>
) => Promise<Result<unknown>>;

export interface Command<F extends CommandFlags = EmptyCommandFlags, A extends CommandArguments = never[]> {
  name: string;
  flags?: F;
  arguments?: A;
  handler: CommandHandler<CommandSchema<F, A>>;
  middleware?: CommandMiddleware<F, A>[];
  setup: (context: CommandContext, parentCommand: CommanderCommand) => CommanderCommand;
}

export type CommandMiddleware<F extends CommandFlags = EmptyCommandFlags, A extends CommandArguments = never[]> = (
  command: Command<F, A>
) => Command<F, A>;

export interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}
