import { ValidationError } from '../common';
import { withLogging, withTelemetry } from './middleware';
import type { Command, CommandContext, CommandFlags, CommandSchema } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

export function buildSchema<F extends CommandFlags>(flags: F): CommandSchema<F> {
  const shape = Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v.schema]));
  return z.object(shape) as CommandSchema<F>;
}

export function register<F extends CommandFlags>(
  context: CommandContext,
  command: Command<F>,
  options?: { parentCommand?: CommanderCommand }
): CommanderCommand {
  const parentCommand = options?.parentCommand ?? new CommanderCommand();
  const cmd = command.setup(context, parentCommand);

  for (const flag of Object.values(command.flags)) {
    if (flag.required) {
      cmd.requiredOption(flag.usage, flag.description);
    } else {
      cmd.option(flag.usage, flag.description);
    }
  }

  return cmd.action(toCommanderAction(context, command));
}

function toCommanderAction<F extends CommandFlags>(
  context: CommandContext,
  command: Command<F>
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  const commonMiddleware = [withLogging, withTelemetry, ...(command.middleware ?? [])];
  const commandWithMiddleware = commonMiddleware.reduce((prev, next) => next(prev), command);

  const schema = buildSchema(command.flags);

  return async (input: Record<string, unknown>) => {
    const parseResult = schema.safeParse(input);
    if (!parseResult.success) throw new ValidationError(parseResult.error.message);

    const result = await commandWithMiddleware.handler(context, parseResult.data);
    if (!result.success) throw result.error;
  };
}
