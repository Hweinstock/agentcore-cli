import { register } from '../../command-builder';
import type { Command } from '../../types';
import { addAgentCommand } from './agent';
import { addGatewayCommand } from './gateway';
import { addMemoryCommand } from './memory';

export const addCommand: Command = {
  name: 'add',
  handler: async context => {
    context.consoleLogger.info(`running root level add command`);
    return context.tuiScreenRenderer.render({ initialPath: '/add', enterAltScreen: false });
  },
  setup: (context, parentCommand) => {
    const cmd = parentCommand
      .command('add')
      .description('this is the add command')
      .showHelpAfterError()
      .showSuggestionAfterError();
    register(context, addAgentCommand, { parentCommand: cmd });
    register(context, addMemoryCommand, { parentCommand: cmd });
    register(context, addGatewayCommand, { parentCommand: cmd });
    return cmd;
  },
};
