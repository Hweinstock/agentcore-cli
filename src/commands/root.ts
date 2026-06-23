import { register } from './command-builder';
import { addCommand, createCommand, deployCommand, devCommand, removeCommand } from './handlers';
import type { Command, CommandFlags } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';

const flags = {} as const satisfies CommandFlags;

export const rootCommand: Command<typeof flags> = {
  name: 'root',
  flags,
  handler: async context => context.tuiScreenRenderer.render(),
  setup: context => {
    const parentCommand = new CommanderCommand();
    register(context, addCommand, { parentCommand });
    register(context, createCommand, { parentCommand });
    register(context, deployCommand, { parentCommand });
    register(context, devCommand, { parentCommand });
    register(context, removeCommand, { parentCommand });

    return parentCommand;
  },
};
