import { type Result, ValidationError } from '../common';
import type { AgentCoreCommand, AgentCoreCommandSpec, BaseCommandContext } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

/**
 * Factory function for converting CommandSpec type into Command type.
 */
export function buildCommand<SchemaType extends z.ZodObject, CommandContext extends BaseCommandContext>(
  commandSpec: AgentCoreCommandSpec<SchemaType, CommandContext>
): AgentCoreCommand<CommandContext> {
  return {
    register: (context: CommandContext, parentCommand: CommanderCommand): CommanderCommand =>
      commandSpec
        .setup(context, parentCommand)
        .action(toCommanderAction(context, commandSpec.handler, commandSpec.schema)),
  };
}

export function toCommanderAction<
  SchemaType extends z.ZodObject,
  CommandContext extends BaseCommandContext = BaseCommandContext,
>(
  context: CommandContext,
  handler: (context: CommandContext, input: z.infer<SchemaType>) => Promise<Result> | Result,
  schema: SchemaType
): (input: Record<string, unknown>, command: CommanderCommand) => Promise<void> {
  return async (input, _command) => {
    const parseResult = schema.safeParse(input);
    if (!parseResult.success) throw new ValidationError(parseResult.error.message);
    const handlerResult = await handler(context, parseResult.data);
    if (!handlerResult.success) throw handlerResult.error;
  };
}
