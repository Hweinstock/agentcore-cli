import { register } from '../../command-builder';
import type { Command, CommandFlags } from '../../types';
import { addAgentCommand } from './agent';
import { addGatewayCommand } from './gateway';
import { addMemoryCommand } from './memory';

const flags = {} as const satisfies CommandFlags;

export const addCommand: Command<typeof flags> = {
  name: 'add',
  flags,
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
