import { buildCommand } from '../../command-builder';
import type { AgentCoreCommandHandler } from '../../types';
import { removeGatewayCommand } from './gateway';
import { removeMemoryCommand } from './memory';
import z from 'zod';

const handler: AgentCoreCommandHandler = async context => {
  context.consoleLogger.info(`running root level add command`);
  return context.tuiScreenRenderer.render({ initialPath: '/remove', enterAltScreen: false });
};

export const removeCommand = buildCommand({
  name: 'remove',
  schema: z.object({}),
  handler,
  setup: (context, parentCommand) => {
    const removeCommand = parentCommand
      .command('remove')
      .description('this is the remove command')
      .showHelpAfterError()
      .showSuggestionAfterError();
    removeMemoryCommand.register(context, removeCommand);
    removeGatewayCommand.register(context, removeCommand);
    return removeCommand;
  },
});
