import { register } from '../../command-builder';
import type { Command, CommandFlags } from '../../types';
import { removeAgentCommand } from './agent';
import { removeGatewayCommand } from './gateway';
import { removeMemoryCommand } from './memory';

const flags = {} as const satisfies CommandFlags;

export const removeCommand: Command<typeof flags> = {
  name: 'remove',
  flags,
  handler: async context => {
    context.consoleLogger.info(`running root level remove command`);
    return context.tuiScreenRenderer.render({ initialPath: '/remove', enterAltScreen: false });
  },
  setup: (context, parentCommand) => {
    const cmd = parentCommand.command('remove').description('Remove a resource from the project').showHelpAfterError();
    register(context, removeAgentCommand, { parentCommand: cmd });
    register(context, removeMemoryCommand, { parentCommand: cmd });
    register(context, removeGatewayCommand, { parentCommand: cmd });
    return cmd;
  },
};
