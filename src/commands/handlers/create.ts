import type { Command, CommandHandler } from '../types';
import * as z from 'zod';

const schema = z
  .object({
    name: z.string().optional(),
    projectName: z.string().optional(),
    language: z.enum(['python', 'typescript']).optional(),
    framework: z.enum(['strands', 'vercel', 'langchain_langgraph']).optional(),
    protocol: z.enum(['http', 'mcp']).optional(),
    memory: z.enum(['none', 'longAndShort', 'short']).optional(),
    buildType: z.enum(['container', 'codezip']).optional(),
    agent: z.boolean().optional(),
    json: z.boolean().optional(),
  })
  .refine(data => data.projectName ?? data.name);

const handler: CommandHandler<typeof schema> = async (context, input) => {
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
    const addAgentResult = await project.addAgent({
      agentName: input.name ?? input.projectName!,
      language: input.language ?? 'python',
      framework: input.framework ?? 'strands',
      protocol: input.protocol ?? 'http',
      memory: input.memory ?? 'none',
      buildType: input.buildType ?? 'codezip',
    });
    if (!addAgentResult.success) return addAgentResult;
    return addAgentResult;
  }

  return projectCreationResult;
};

export const createCommand: Command<typeof schema> = {
  name: 'create',
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
};
