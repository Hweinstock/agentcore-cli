import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandHandler } from '../../types';
import * as z from 'zod';

const schema = z.object({
  name: z.string(),
  yes: z.boolean().optional(),
  json: z.boolean().optional(),
});

const handler: CommandHandler<typeof schema> = async (context, input) => {
  if (!context.project) return err(new Error('missing project'));

  return context.project.config.remove('agents', input.name);
};

export const removeAgentCommand: Command<typeof schema> = {
  name: 'remove.agent',
  schema,
  handler,
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand
      .command('agent')
      .description('Remove an agent from the project')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Name of resource to remove [non-interactive]')
      .option('-y, --yes', 'Skip confirmation prompt [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]'),
};
