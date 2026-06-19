import { register } from './command-builder';
import { addCommand, createCommand, deployCommand, devCommand, removeCommand } from './handlers';
import type { Command, CommandHandler } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

const handler: CommandHandler = async (context, _input) => context.tuiScreenRenderer.render();

export const rootCommand: Command = {
  name: 'root',
  schema: z.object({}),
  handler,
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
