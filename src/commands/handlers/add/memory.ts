import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Memory name', required: true },
  strategies: {
    schema: z.string().optional(),
    usage: '--strategies <types>',
    description: 'Comma-separated strategies',
  },
  expiry: { schema: z.string().optional(), usage: '--expiry <days>', description: 'Event expiry duration in days' },
  deliveryType: { schema: z.string().optional(), usage: '--delivery-type <type>', description: 'Delivery target type' },
  dataStreamArn: {
    schema: z.string().optional(),
    usage: '--data-stream-arn <arn>',
    description: 'Kinesis data stream ARN',
  },
  streamContentLevel: {
    schema: z.string().optional(),
    usage: '--stream-content-level <level>',
    description: 'Stream content level',
  },
  indexedKey: {
    schema: z.array(z.string()).optional(),
    usage: '--indexed-key <key:type>',
    description: 'Indexed metadata key',
  },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
} as const satisfies CommandFlags;

export const addMemoryCommand: Command<typeof flags> = {
  name: 'add.memory',
  flags,
  handler: async (context, input) => {
    if (!context.project) return err(new Error('missing project'));
    return context.project.config.add('memories', input.name);
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('memory').description('Add a memory to the project').showHelpAfterError(),
};
