import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Name of agent to remove', required: true },
  yes: { schema: z.boolean().optional(), usage: '-y, --yes', description: 'Skip confirmation prompt' },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
} as const satisfies CommandFlags;

export const removeAgentCommand: Command<typeof flags> = {
  name: 'remove.agent',
  flags,
  handler: async (context, input) => {
    if (!context.project) return err(new Error('missing project'));
    return context.project.config.remove('agents', input.name);
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('agent').description('Remove an agent from the project').showHelpAfterError(),
};
