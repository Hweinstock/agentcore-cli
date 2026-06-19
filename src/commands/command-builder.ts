import { withInputValidation, withLogging, withTelemetry } from './middleware';
import type { Command, CommandContext } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

export function register<SchemaType extends z.ZodObject>(
  context: CommandContext,
  command: Command<SchemaType>,
  options?: {
    parentCommand?: CommanderCommand;
  }
): CommanderCommand {
  const parentCommand = options?.parentCommand ?? new CommanderCommand();
  return command.setup(context, parentCommand).action(toCommanderAction(context, command));
}

/**
 * Wrapper around all commands this is where we put common middleware such as schema validation, telemetry, logging, etc.
 */
// TODO: add telemetry for cli.command_run here
function toCommanderAction<SchemaType extends z.ZodObject>(
  context: CommandContext,
  command: Command<SchemaType>
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  const commonMiddleware = [withLogging, withTelemetry, withInputValidation, ...(command.middleware ?? [])];

  const commandWithMiddleware = commonMiddleware.reduce((prev, next) => next(prev), command);

  return async (input: Record<string, unknown>, _command: CommanderCommand) => {
    const result = await commandWithMiddleware.handler(context, input as z.infer<SchemaType>);

    if (!result.success) throw result.error;
    return;
  };
}
