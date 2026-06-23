import { err } from '../../../common';
import { COMMON_FLAGS, CONFIRMATION_FLAGS } from '../../flags';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Name of memory to remove', required: true },
  ...CONFIRMATION_FLAGS,
  ...COMMON_FLAGS,
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
