import { err } from '../../common';
import { NoProjectFoundError } from '../../common/errors';
import { buildCommand } from '../command-builder';
import type { AgentCoreCommandSpec } from '../types';
import * as z from 'zod';

const addMemoryCommandSpec: AgentCoreCommandSpec = {
  schema: z.object({
    name: z.string(),
    strategies: z.string().optional(),
    expiry: z.string().optional(),
    deliveryType: z.string().optional(),
    dataStreamArn: z.string().optional(),
    streamContentLevel: z.string().optional(),
    indexedKey: z.array(z.string()).optional(),
    json: z.boolean().optional(),
  }),
  handler: async (context, input) => {
    context.consoleLogger.info(`run the add memory command with ${JSON.stringify(input)}`);

    if (!context.projectManager.hasProject()) {
      return err(new NoProjectFoundError())
    }

    return context.projectManager.configAccessor.add('memories', input.name ?? '');
  },
  setup: (_context, parentCommand) =>
    parentCommand
      .command('memory')
      .description('this is the add memory command')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Memory name [non-interactive]')
      .option(
        '--strategies <types>',
        'Comma-separated strategies: SEMANTIC, SUMMARIZATION, USER_PREFERENCE, EPISODIC [non-interactive]'
      )
      .option('--expiry <days>', 'Event expiry duration in days (default: 30) [non-interactive]')
      .option('--delivery-type <type>', 'Delivery target type (default: kinesis) [non-interactive]')
      .option('--data-stream-arn <arn>', 'Kinesis data stream ARN for memory record streaming [non-interactive]')
      .option(
        '--stream-content-level <level>',
        'Stream content level: FULL_CONTENT or METADATA_ONLY (default: FULL_CONTENT) [non-interactive]'
      )
      .option(
        '--stream-delivery-resources <json>',
        'Stream delivery config as JSON string (advanced, overrides flat flags) [non-interactive]'
      )
      .option(
        '--indexed-key <key:type>',
        'Indexed metadata key as key:TYPE (repeatable, max 10). TYPE is STRING, STRINGLIST, or NUMBER [non-interactive]',
        (val: string, acc: string[]) => [...acc, val],
        [] as string[]
      )
      .option('--json', 'Output as JSON [non-interactive]'),
};

export const addMemoryCommand = buildCommand(addMemoryCommandSpec);
