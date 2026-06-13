import { buildCommand } from './command-builder';
import { addCommand, createCommand, deployCommand, removeCommand } from './handlers';
import type { AgentCoreCommandHandler } from './types';
import { Command } from '@commander-js/extra-typings';
import z from 'zod';

const schema = z.object({});

const handler: AgentCoreCommandHandler<typeof schema> = async (context, _input) => context.tuiScreenRenderer.render();

export const rootCommand = buildCommand({
  schema,
  handler,
  setup: context => {
    const rootCommand = new Command();

    addCommand.register(context, rootCommand);
    createCommand.register(context, rootCommand);
    deployCommand.register(context, rootCommand);
    removeCommand.register(context, rootCommand);

    return rootCommand;
  },
});
