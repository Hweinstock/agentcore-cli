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
import type { BaseCommandContext, CommandHandler } from './types';
import { getProjectBuilder } from '@/project';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}

export function getCommandRouter(context: {
  logger: Logger;
  globalConfigAccessor: GlobalConfigAccessor;
  telemetryClient: TelemetryClient;
}): CommandRouter {
  const rootCommand = new CommanderCommand();

  // TODO: define root command for entering the TUI.

  const projectBuilder = getProjectBuilder(context);

  addCommand.register(context, rootCommand);
  createCommand.register({ ...context, projectBuilder }, rootCommand);

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

export function toAction<
  SchemaType extends z.ZodObject,
  OutputType extends Result,
  CommandContext extends BaseCommandContext = BaseCommandContext,
>(
  props: CommandContext,
  schema: SchemaType,
  handler: CommandHandler<z.infer<SchemaType>, CommandContext, OutputType>
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  return async (input, _command) => {
    const parseResult = schema.safeParse(input);
    if (!parseResult.success) throw new ValidationError(parseResult.error.message);
    const handlerResult = await handler(props, parseResult.data);
    if (!handlerResult.success) throw handlerResult.error;
  };
}
