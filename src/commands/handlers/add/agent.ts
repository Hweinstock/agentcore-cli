import { err } from '../../../common';
import { AGENT_FLAGS, COMMON_FLAGS } from '../../flags';
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
  ...AGENT_FLAGS,
  ...COMMON_FLAGS,
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
