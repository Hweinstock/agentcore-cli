import { buildCommand } from './command-builder';
import { addCommand, createCommand, deployCommand, devCommand, removeCommand } from './handlers';
import type { AgentCoreCommandHandler } from './types';
import { Command } from '@commander-js/extra-typings';
import z from 'zod';

const handler: AgentCoreCommandHandler = async (context, _input) => context.tuiScreenRenderer.render();

export const rootCommand = buildCommand({
  name: 'root',
  schema: z.object({}),
  handler,
  setup: context => {
    const rootCommand = new Command();

    addCommand.register(context, rootCommand);
    createCommand.register(context, rootCommand);
    deployCommand.register(context, rootCommand);
    removeCommand.register(context, rootCommand);
    devCommand.register(context, rootCommand);

    return rootCommand;
  },
});
