import { buildCommand } from '../command-builder';
import type { AgentCoreCommandHandler } from '../types';
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

  const projectLookupResult = await context.projectManager.find({});

  if (!projectLookupResult.success) return projectLookupResult;

  const project = projectLookupResult.data;

  const deployResult = project.deploy({});

  return deployResult;
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
