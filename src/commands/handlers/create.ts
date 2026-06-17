import { buildCommand } from '../command-builder';
import type { AgentCoreCommandHandler } from '../types';
import * as z from 'zod';

const schema = z
  .object({
    name: z.string().optional(),
    projectName: z.string().optional(),
    language: z.string().optional(),
    framework: z.string().optional(),
    agent: z.boolean().optional(),
    json: z.boolean().optional(),
  })
  .refine(data => data.projectName ?? data.name);

const handler: AgentCoreCommandHandler<typeof schema> = async (context, input) => {
  // Always branch to TUI first.
  if (Object.keys(input).filter(k => k !== 'agent').length === 0) {
    return context.tuiScreenRenderer.render({ initialPath: '/create' });
  }

  const projectCreationResult = await context.projectManager.create({
    projectName: input.projectName ?? input.name!,
    onProgress: e => context.consoleLogger.info(JSON.stringify(e)),
  });

  if (!projectCreationResult.success) return projectCreationResult;

  const project = projectCreationResult.data;

  if (input.agent) {
    const addAgentResult = await project.addAgent({});
    if (!addAgentResult.success) return addAgentResult;
    return addAgentResult;
  }

  return projectCreationResult;
};

export const createCommand = buildCommand({
  schema,
  handler,
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
});
