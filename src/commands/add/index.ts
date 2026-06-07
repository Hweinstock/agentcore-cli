import { ok } from '../../common';
import { buildCommand } from '../command-builder';
import type { AgentCoreCommandSpec } from '../types';
import { addMemoryCommand } from './memory';
import z from 'zod';

const addCommandSpec: AgentCoreCommandSpec = {
  schema: z.object({}),
  handler: async context => {
    context.consoleLogger.info(`running root level add command`);
    return ok();
  },
  setup: (context, parentCommand) => {
    const addCommand = parentCommand
      .command('add')
      .description('this is the add command')
      .showHelpAfterError()
      .showSuggestionAfterError();

    addMemoryCommand.register(context, addCommand);
    return addCommand;
  },
};

export const addCommand = buildCommand(addCommandSpec);
