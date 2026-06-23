import { register } from './command-builder';
import { addCommand, configCommand, createCommand, deployCommand, devCommand, removeCommand } from './handlers';
import type { Command } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';

export const rootCommand: Command = {
  name: 'root',
  handler: async context => context.tuiScreenRenderer.render(),
  setup: context => {
    const parentCommand = new CommanderCommand();
    register(context, addCommand, { parentCommand });
    register(context, configCommand, { parentCommand });
    register(context, createCommand, { parentCommand });
    register(context, deployCommand, { parentCommand });
    register(context, devCommand, { parentCommand });
    register(context, removeCommand, { parentCommand });

    return parentCommand;
  },
};
