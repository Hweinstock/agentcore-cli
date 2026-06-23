import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Name of memory to remove', required: true },
  yes: { schema: z.boolean().optional(), usage: '-y, --yes', description: 'Skip confirmation prompt' },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
} as const satisfies CommandFlags;

export const removeMemoryCommand: Command<typeof flags> = {
  name: 'remove.memory',
  flags,
  handler: async (context, input) => {
    if (!context.project) return err(new Error('missing project'));
    return context.project.config.remove('memories', input.name);
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('memory').description('Remove a memory from the project').showHelpAfterError(),
};
