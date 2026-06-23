import { err } from '../../common';
import { withProject } from '../middleware';
import type { Command, CommandFlags } from '../types';
import z from 'zod';

const flags = {
  target: { schema: z.string().optional(), usage: '--target <target>', description: 'Deployment target name' },
  yes: { schema: z.boolean().optional(), usage: '-y, --yes', description: 'Auto-confirm prompts' },
  verbose: { schema: z.boolean().optional(), usage: '-v, --verbose', description: 'Show resource-level events' },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
  dryRun: { schema: z.boolean().optional(), usage: '--dry-run', description: 'Preview without deploying' },
  diff: { schema: z.boolean().optional(), usage: '--diff', description: 'Show CDK diff without deploying' },
} as const satisfies CommandFlags;

export const deployCommand: Command<typeof flags> = {
  name: 'deploy',
  flags,
  handler: async (context, input) => {
    context.consoleLogger.info(`run the deploy command with ${JSON.stringify(input)}`);

    if (Object.keys(input).filter(k => k !== 'agent').length === 0) {
      return context.tuiScreenRenderer.render({ initialPath: '/deploy' });
    }

    if (!context.project) return err(new Error('missing project'));
    return context.project.deploy({});
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('deploy').alias('dp').description('Deploy the project').showHelpAfterError(),
};
