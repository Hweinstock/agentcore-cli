import { err } from '../../../common';
import { NoProjectFoundError } from '../../../common/errors';
import { buildCommand } from '../../command-builder';
import type { AgentCoreCommandHandler } from '../../types';
import * as z from 'zod';

const schema = z.object({
  name: z.string(),
  yes: z.boolean().optional(),
  json: z.boolean().optional(),
});

const handler: AgentCoreCommandHandler<typeof schema> = async (context, input) => {
  context.consoleLogger.info(`run the remove gateway command with ${JSON.stringify(input)}`);

  const projectResult = await context.projectManager.find({});
  if (!projectResult.success) {
    return err(new NoProjectFoundError());
  }

  return projectResult.data.config.remove('gateways', input.name);
};

export const removeGatewayCommand = buildCommand({
  schema,
  handler,
  setup: (_context, parentCommand) =>
    parentCommand
      .command('gateway')
      .description('Remove a gateway from the project')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Name of resource to remove [non-interactive]')
      .option('-y, --yes', 'Skip confirmation prompt [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]'),
});
