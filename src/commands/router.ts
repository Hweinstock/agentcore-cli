import { err, ok } from '../common';
import { rootCommand } from './root';
import type { BaseCommandContext, CommandRouter } from './types';

export function getCommandRouter(context: BaseCommandContext): CommandRouter {
  const command = rootCommand.register(context);
  return {
    route: async args => {
      try {
        await command.parseAsync(args);
        return ok();
      } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}
