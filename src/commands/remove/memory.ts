import { err } from '../../common';
import { NoProjectFoundError } from '../../common/errors';
import { buildCommand } from '../command-builder';
import type { AgentCoreCommandHandler } from '../types';
import * as z from 'zod';

const schema = z.object({
  name: z.string(),
  yes: z.boolean().optional(),
  json: z.boolean().optional(),
});

const handler: AgentCoreCommandHandler<typeof schema> = async (context, input) => {
  context.consoleLogger.info(`run the remove memory command with ${JSON.stringify(input)}`);

  if (!context.projectManager.hasProject()) {
    return err(new NoProjectFoundError());
  }

  return context.projectManager.configAccessor.remove('memories', input.name);
};

export const removeMemoryCommand = buildCommand({
  schema,
  handler,
  setup: (_context, parentCommand) =>
    parentCommand
      .command('memory')
      .description('Remove a memory from the project')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Name of resource to remove [non-interactive]')
      .option('-y, --yes', 'Skip confirmation prompt [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]'),
});
