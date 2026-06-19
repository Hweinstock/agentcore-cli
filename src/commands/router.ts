import { err, ok } from '../common';
import type { ProgramConfig } from '../program-config';
import { register } from './command-builder';
import { rootCommand } from './root';
import type { CommandRouter } from './types';

export function getCommandRouter(context: ProgramConfig): CommandRouter {
  const commanderEntryPoint = register(context, rootCommand);
  return {
    route: async args => {
      try {
        await commanderEntryPoint.parseAsync(args);
        return ok();
      } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}
