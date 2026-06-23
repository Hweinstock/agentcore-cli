import { ValidationError } from '../common';
import { withLogging, withTelemetry } from './middleware';
import type { Command, CommandArguments, CommandContext, CommandFlags, CommandSchema } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

export function buildSchema<F extends CommandFlags, A extends CommandArguments>(
  flags: F,
  args: A
): CommandSchema<F, A> {
  const shape = {
    ...Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v.schema])),
    ...Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v.schema])),
  };

  // entries erases type information, so we add it back before returning.
  return z.object(shape) as CommandSchema<F, A>;
}

export function register<F extends CommandFlags, A extends CommandArguments>(
  context: CommandContext,
  command: Command<F, A>,
  options?: { parentCommand?: CommanderCommand }
): CommanderCommand {
  const parentCommand = options?.parentCommand ?? new CommanderCommand();
  const cmd = command.setup(context, parentCommand);

  for (const flag of Object.values(command.flags ?? {})) {
    if (flag.hidden?.()) continue;
    if (flag.required) {
      cmd.requiredOption(flag.usage, flag.description);
    } else {
      cmd.option(flag.usage, flag.description);
    }
  }

  return cmd.action(toCommanderAction(context, command));
}

function toCommanderAction<F extends CommandFlags, A extends CommandArguments>(
  context: CommandContext,
  command: Command<F, A>
): (...args: unknown[]) => Promise<void> {
  const commonMiddleware = [...(command.middleware ?? []), withLogging, withTelemetry];
  const commandWithMiddleware = commonMiddleware.reduce((prev, next) => next(prev), command);

  // TS can't infer that {} is assignable to F in the undefined case, so we must cast.
  const schema = buildSchema(command.flags ?? ({} as F), command.arguments ?? ({} as A));

  return async (...args: unknown[]) => {
    const input = parseCommanderArgs(args, command.arguments ?? []);

    const parseResult = schema.safeParse(input);
    if (!parseResult.success) throw new ValidationError(parseResult.error.message);

    const result = await commandWithMiddleware.handler(context, parseResult.data);
    if (!result.success) throw result.error;
  };
}

/**
 * Combine the commander command arguments into a single typed object.
 *
 * Commander actions are setup like:
 * (arg_1, arg_2, .... arg_3, flags, cmd)
 *
 * see https://github.com/tj/commander.js/blob/master/Readme.md#action-handler for more info;
 * */
function parseCommanderArgs(args: unknown[], commandArgs: CommandArguments): Record<string, unknown> {
  const argKeys = Object.keys(commandArgs);
  const options = args[args.length - 2] as Record<string, unknown>;
  const positional = args.slice(0, argKeys.length);
  const input = { ...options };
  for (let i = 0; i < argKeys.length; i++) {
    input[argKeys[i]!] = positional[i];
  }
  return input;
}
