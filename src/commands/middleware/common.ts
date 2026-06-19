import { ValidationError, err } from '../../common';
import type { Command } from '../types';
import z from 'zod';

export const withLogging = <S extends z.ZodObject>(command: Command<S>): Command<S> => ({
  ...command,
  handler: async (context, input) => {
    const commandLogger = context.fileLogger.child(command.name);

    commandLogger.info(`running command`);

    const commandResult = await command.handler({ ...context, fileLogger: commandLogger }, input);

    commandLogger.info(`exitting command with result=${JSON.stringify(commandResult)}`);

    return commandResult;
  },
});

export const withInputValidation = <S extends z.ZodObject>(command: Command<S>): Command<S> => ({
  ...command,
  handler: async (context, input) => {
    const inputParseResult = command.schema.safeParse(input);
    // TODO: make this a better user facing error message
    if (!inputParseResult.success) return err(new ValidationError(inputParseResult.error.message));
    return command.handler(context, inputParseResult.data);
  },
});

export const withTelemetry = <S extends z.ZodObject>(command: Command<S>): Command<S> => ({
  ...command,
  handler: (context, input) =>
    context.telemetryClient.withTelemetry('cli.command_run', {}, recorder =>
      command.handler({ ...context, telemetryRecorder: recorder }, input)
    ),
});
