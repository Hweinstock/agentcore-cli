import { buildCommand } from './command-builder';
import type { AgentCoreCommandSpec } from './types';
import * as z from 'zod';

const createCommandSpec: AgentCoreCommandSpec = {
  schema: z.object({
    name: z.string().optional(),
    projectName: z.string().optional(),
    language: z.string().optional(),
    framework: z.string().optional(),
    agent: z.boolean().optional(),
    json: z.boolean().optional(),
  }),
  handler: async (context, input) => {
    // Always branch to TUI first.
    if (Object.keys(input).filter(k => k !== 'agent').length === 0) {
      return context.tuiScreenRenderer.render({ initialPath: '/create' });
    }

    // Now we know we're in CLI so we can wrap the rest in CLI telemetry. (code paths isolated)
    const result = await context.projectManager.build({
      name: input.name,
      projectName: input.projectName,
      language: input.language,
      framework: input.framework,
      agent: input.agent,
      onProgress: _event => {},
    });
    if (result.success) {
      if (input.json) context.consoleLogger.info(JSON.stringify(result.data));
      else context.consoleLogger.info(`Created project ${result.data?.name}`);
    }
    return result;
  },
  setup: (_context, parentCommand) =>
    parentCommand
      .command('create')
      .description('this is the create command')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Resource name [non-interactive]')
      .option('--project-name <name>', 'Project name [non-interactive]')
      .option('--language <language>', 'Target language: Python or TypeScript [non-interactive]')
      .option('--framework <framework>', 'Agent framework [non-interactive]')
      .option('--no-agent', 'Skip agent creation [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]'),
};

export const createCommand = buildCommand(createCommandSpec);
