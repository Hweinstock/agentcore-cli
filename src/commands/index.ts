import {
  type GlobalConfigAccessor,
  type Logger,
  type Result,
  type TelemetryClient,
  ValidationError,
  err,
  ok,
} from '../common';
import { addCommand } from './add';
import { createCommand } from './create';
import type { CommandOptions } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

interface CommandExecutor {
  route: (args: string[]) => Promise<Result>;
}

export function getCommandExecutor(props: {
  logger: Logger;
  globalConfigAccessor: GlobalConfigAccessor;
  telemetryClient: TelemetryClient;
}): CommandExecutor {
  const rootCommand = new CommanderCommand();

  addCommand.register(props, rootCommand);
  createCommand.register(props, rootCommand);

  return {
    route: async args => {
      try {
        await rootCommand.parseAsync(args);
        return ok();
      } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}

export type CommandHandler<InputType = {}, OutputType extends Result = Result> = (
  props: CommandOptions,
  input: InputType
) => Promise<OutputType>;

export function toAction<SchemaType extends z.ZodObject, OutputType extends Result>(
  props: CommandOptions,
  schema: SchemaType,
  handler: CommandHandler<z.infer<SchemaType>, OutputType>
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  return async (input, _command) => {
    const parseResult = schema.safeParse(input);
    if (!parseResult.success) throw new ValidationError(parseResult.error.message);
    const handlerResult = await handler(props, parseResult.data);
    if (!handlerResult.success) throw handlerResult.error;
  };
}
