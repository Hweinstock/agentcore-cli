import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Name of gateway to remove', required: true },
  yes: { schema: z.boolean().optional(), usage: '-y, --yes', description: 'Skip confirmation prompt' },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
} as const satisfies CommandFlags;

export const removeGatewayCommand: Command<typeof flags> = {
  name: 'remove.gateway',
  flags,
  handler: async (context, input) => {
    if (!context.project) return err(new Error('missing project'));
    return context.project.config.remove('gateways', input.name);
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('gateway').description('Remove a gateway from the project').showHelpAfterError(),
};
