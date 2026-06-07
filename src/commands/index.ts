import { type Result, err, ok } from '../common';
import { addCommand } from './add';
import { toCommanderAction } from './command-builder';
import { createCommand } from './create';
import type { BaseCommandContext } from './types';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import z from 'zod';

interface CommandRouter {
  route: (args: string[]) => Promise<Result>;
}

function getRootCommand(context: BaseCommandContext): CommanderCommand {
  const rootCommand = new CommanderCommand().action(
    toCommanderAction(context, z.object({}), () => context.tuiScreenRenderer.render())
  );

  addCommand.register(context, rootCommand);
  createCommand.register(context, rootCommand);

  return rootCommand;
}

export function getCommandRouter(context: BaseCommandContext): CommandRouter {
  const rootCommand = getRootCommand(context);

  return {
    route: async args => {
      try {
        await rootCommand.parseAsync(args);
        return ok();
      } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}
