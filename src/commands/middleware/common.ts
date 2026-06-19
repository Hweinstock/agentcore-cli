import { ValidationError, err } from '../../common';
import type { Command } from '../types';
import z from 'zod';

export const withLogging = <S extends z.ZodObject>(command: Command<S>): Command<S> => ({
  ...command,
  handler: (context, input) =>
    command.handler({ ...context, fileLogger: context.fileLogger.child(command.name) }, input),
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
