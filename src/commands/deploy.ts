import { err } from '../common';
import { NoProjectFoundError } from '../common/errors';
import { buildCommand } from './command-builder';
import type { AgentCoreCommandHandler } from './types';
import * as z from 'zod';

const schema = z.object({
  target: z.string().optional(),
  yes: z.boolean().optional(),
  verbose: z.boolean().optional(),
  json: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  diff: z.boolean().optional(),
});

const handler: AgentCoreCommandHandler<typeof schema> = async (context, input) => {
  context.consoleLogger.info(`run the deploy command with ${JSON.stringify(input)}`);

  // Always branch to TUI first.
  if (Object.keys(input).filter(k => k !== 'agent').length === 0) {
    return context.tuiScreenRenderer.render({ initialPath: '/deploy' });
  }

  if (!context.projectManager.hasProject()) {
    return err(new NoProjectFoundError());
  }

  const result = await context.projectManager.deploy({ onProgress: _event => {} });

  if (result.success) {
    if (input.json) context.consoleLogger.info(JSON.stringify(result.data));
    else context.consoleLogger.info(`Deployed project ${result.data}`);
  }

  return context.projectManager.deploy({ onProgress: _event => {} });
};

export const deployCommand = buildCommand({
  schema,
  handler,
  setup: (_context, parentCommand) =>
    parentCommand
      .command('deploy')
      .alias('dp')
      .description('this is the deploy command')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--target <target>', 'Deployment target name (default: "default") [non-interactive]')
      .option('-y, --yes', 'Auto-confirm prompts, read credentials from env [non-interactive]')
      .option('-v, --verbose', 'Show resource-level deployment events [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]')
      .option('--dry-run', 'Preview deployment without deploying [non-interactive]')
      .option('--diff', 'Show CDK diff without deploying [non-interactive]'),
});
