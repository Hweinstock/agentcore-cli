import { register } from '../../command-builder';
import type { Command, CommandHandler } from '../../types';
import { addGatewayCommand } from './gateway';
import { addMemoryCommand } from './memory';
import z from 'zod';

const schema = z.object({});

const handler: CommandHandler<typeof schema> = async context => {
  context.consoleLogger.info(`running root level add command`);
  return context.tuiScreenRenderer.render({ initialPath: '/add', enterAltScreen: false });
};

export const addCommand: Command<typeof schema> = {
  name: 'add',
  schema,
  handler,
  setup: (context, parentCommand) => {
    const addCommand = parentCommand
      .command('add')
      .description('this is the add command')
      .showHelpAfterError()
      .showSuggestionAfterError();
    register(context, addMemoryCommand, { parentCommand: addCommand });
    register(context, addGatewayCommand, { parentCommand: addCommand });
    return addCommand;
  },
};
