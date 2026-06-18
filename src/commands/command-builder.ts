import { type Result, ValidationError } from '../common';
import type { AgentCoreCommand, BaseCommandContext } from './types';
import { Command, Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

interface AgentCoreCommandSpec<
  SchemaType extends z.ZodObject = z.ZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
> {
  name: string;
  schema: SchemaType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (context: CommandContext, input: z.infer<SchemaType>) => Promise<Result<any>>;
  setup: (context: CommandContext, parentCommand: Command) => Command;
}

/**
 * Factory function for converting CommandSpec into a Command we can register with Commander.
 */
export function buildCommand<SchemaType extends z.ZodObject, CommandContext extends BaseCommandContext>(
  commandSpec: AgentCoreCommandSpec<SchemaType, CommandContext>
): AgentCoreCommand<CommandContext> {
  return {
    register: (context: CommandContext, parentCommand?: CommanderCommand): CommanderCommand =>
      commandSpec.setup(context, parentCommand ?? new Command()).action(toCommanderAction(context, commandSpec)),
  };
}

/**
 * Wrapper around all commands this is where we put common middleware such as schema validation, telemetry, logging, etc.
 */
// TODO: add telemetry for cli.command_run here
function toCommanderAction<
  SchemaType extends z.ZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
>(
  context: CommandContext,
  options: AgentCoreCommandSpec<SchemaType, CommandContext>
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  return async (input, _command) => {
    const commandLogger = context.fileLogger.child(options.name);
    const commandContext = { logger: commandLogger, ...context };

    const parseResult = options.schema.safeParse(input);
    // TODO: convert this to a nice user facing error msg;
    if (!parseResult.success) throw new ValidationError(parseResult.error.message);
    const handlerResult = await options.handler(commandContext, parseResult.data);
    if (!handlerResult.success) throw handlerResult.error;
  };
}
