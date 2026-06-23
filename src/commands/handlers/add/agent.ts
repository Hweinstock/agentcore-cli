import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: {
    schema: z.string(),
    usage: '--name <name>',
    description: 'Agent name',
    required: true,
  },
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
  protocol: {
    schema: z.enum(['http', 'mcp']).optional(),
    usage: '--protocol <protocol>',
    description: 'Protocol',
  },
  memory: {
    schema: z.enum(['none', 'longAndShort', 'short']).optional(),
    usage: '--memory <memory>',
    description: 'Memory type',
  },
  buildType: {
    schema: z.enum(['container', 'codezip']).optional(),
    usage: '--build-type <buildType>',
    description: 'Build type',
  },
  debug: {
    schema: z.boolean().optional(),
    usage: '--debug',
    description: 'Enable debug logging',
  },
} as const satisfies CommandFlags;

export const addAgentCommand: Command<typeof flags> = {
  name: 'add.agent',
  flags,
  handler: async (context, input) => {
    if (input.debug) {
      context.fileLogger.info('debug mode');
    }
    if (!context.project) return err(new Error('missing project'));

    return context.project.addAgent({
      agentName: input.name,
      language: input.language ?? 'python',
      framework: input.framework ?? 'strands',
      protocol: input.protocol ?? 'http',
      memory: input.memory ?? 'none',
      buildType: input.buildType ?? 'codezip',
    });
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('agent').description('Add an agent to the project').showHelpAfterError(),
};
