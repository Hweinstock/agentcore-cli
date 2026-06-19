import { withInputValidation, withLogging } from './middleware';
import type { Command, CommandContext } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

export function register<SchemaType extends z.ZodObject>(
  context: CommandContext,
  command: Command<SchemaType>,
  parentCommand?: CommanderCommand
): CommanderCommand {
  return command.setup(context, parentCommand ?? new CommanderCommand()).action(toCommanderAction(context, command));
}

/**
 * Wrapper around all commands this is where we put common middleware such as schema validation, telemetry, logging, etc.
 */
// TODO: add telemetry for cli.command_run here
function toCommanderAction<SchemaType extends z.ZodObject>(
  context: CommandContext,
  command: Command<SchemaType>
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  const commonMiddleware = [withLogging, withInputValidation, ...(command.middleware ?? [])];

  const commandWithMiddleware = commonMiddleware.reduce((prev, next) => next(prev), command);

  return async (input: Record<string, unknown>, _command: CommanderCommand) => {
    await commandWithMiddleware.handler(context, input as z.infer<SchemaType>);
    return;
  };
}
