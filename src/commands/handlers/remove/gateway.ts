import { err } from '../../../common';
import { COMMON_FLAGS, CONFIRMATION_FLAGS } from '../../flags';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Name of gateway to remove', required: true },
  ...CONFIRMATION_FLAGS,
  ...COMMON_FLAGS,
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
