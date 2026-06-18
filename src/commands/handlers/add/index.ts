import { buildCommand } from '../../command-builder';
import type { AgentCoreCommandHandler } from '../../types';
import { addGatewayCommand } from './gateway';
import { addMemoryCommand } from './memory';
import z from 'zod';

const schema = z.object({});

const handler: AgentCoreCommandHandler<typeof schema> = async context => {
  context.consoleLogger.info(`running root level add command`);
  return context.tuiScreenRenderer.render({ initialPath: '/add', enterAltScreen: false });
};

export const addCommand = buildCommand({
  name: 'add',
  schema,
  handler,
  setup: (context, parentCommand) => {
    const addCommand = parentCommand
      .command('add')
      .description('this is the add command')
      .showHelpAfterError()
      .showSuggestionAfterError();
    addMemoryCommand.register(context, addCommand);
    addGatewayCommand.register(context, addCommand);
    return addCommand;
  },
});
