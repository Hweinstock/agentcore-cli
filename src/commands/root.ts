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
    const rootCommand = new CommanderCommand();

    register(context, addCommand, rootCommand);
    register(context, createCommand, rootCommand);
    register(context, deployCommand, rootCommand);
    register(context, devCommand, rootCommand);
    register(context, removeCommand, rootCommand);

    return rootCommand;
  },
};
