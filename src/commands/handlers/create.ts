import type { Command, CommandFlags } from '../types';
import z from 'zod';

const flags = {
  name: { schema: z.string().optional(), usage: '--name <name>', description: 'Resource name' },
  projectName: { schema: z.string().optional(), usage: '--project-name <name>', description: 'Project name' },
  language: {
    schema: z.enum(['python', 'typescript']).optional(),
    usage: '--language <language>',
    description: 'Target language',
  },
  framework: {
    schema: z.enum(['strands', 'vercel', 'langchain_langgraph']).optional(),
    usage: '--framework <framework>',
    description: 'Agent framework',
  },
  protocol: { schema: z.enum(['http', 'mcp']).optional(), usage: '--protocol <protocol>', description: 'Protocol' },
  memory: {
    schema: z.enum(['none', 'longAndShort', 'short']).optional(),
    usage: '--memory <memory>',
    description: 'Memory type',
  },
  buildType: {
    schema: z.enum(['container', 'codezip']).optional(),
    usage: '--build-type <type>',
    description: 'Build type',
  },
  agent: { schema: z.boolean().optional(), usage: '--no-agent', description: 'Skip agent creation' },
  install: { schema: z.boolean().optional(), usage: '--no-install', description: 'Skip npm install' },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
} as const satisfies CommandFlags;

export const createCommand: Command<typeof flags> = {
  name: 'create',
  flags,
  handler: async (context, input) => {
    if (Object.keys(input).filter(k => k !== 'agent').length === 0) {
      return context.tuiScreenRenderer.render({ initialPath: '/create' });
    }

    const projectCreationResult = await context.projectManager.create({
      projectName: input.projectName ?? input.name!,
      noInstall: input.install === false,
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
  },
  setup: (_context, parentCommand) =>
    parentCommand.command('create').description('Create a new AgentCore project').showHelpAfterError(),
};
