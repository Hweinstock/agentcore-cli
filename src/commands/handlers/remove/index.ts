import { register } from '../../command-builder';
import type { Command, CommandHandler } from '../../types';
import { removeGatewayCommand } from './gateway';
import { removeMemoryCommand } from './memory';
import z from 'zod';

const handler: CommandHandler = async context => {
  context.consoleLogger.info(`running root level add command`);
  return context.tuiScreenRenderer.render({ initialPath: '/remove', enterAltScreen: false });
};

export const removeCommand: Command = {
  name: 'remove',
  schema: z.object({}),
  handler,
  setup: (context, parentCommand) => {
    const removeCommand = parentCommand
      .command('remove')
      .description('this is the remove command')
      .showHelpAfterError()
      .showSuggestionAfterError();
    register(context, removeMemoryCommand, removeCommand);
    register(context, removeGatewayCommand, removeCommand);
    return removeCommand;
  },
};
