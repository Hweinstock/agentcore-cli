import { ValidationError, err } from '../../common';
import { withProject } from '../middleware';
import type { Command, CommandFlags } from '../types';
import z from 'zod';

const flags = {
  prompt: {
    schema: z.string().optional(),
    usage: '--prompt <prompt>',
    description: 'Send a prompt to a running dev server',
  },
  runtime: { schema: z.string().optional(), usage: '-r, --runtime <name>', description: 'Agent to run or invoke' },
  port: { schema: z.number().optional(), usage: '-p, --port <port>', description: 'Port for dev server' },
  stream: { schema: z.boolean().optional(), usage: '-s, --stream', description: 'Stream response when invoking' },
  logs: { schema: z.boolean().optional(), usage: '-l, --logs', description: 'Run dev server with logs to stdout' },
} as const satisfies CommandFlags;

export const devCommand: Command<typeof flags> = {
  name: 'dev',
  flags,
  handler: async (context, input) => {
    context.consoleLogger.info(`running dev handler`);

    if (!context.project) return err(new Error('missing project'));
    const project = context.project;

    const agentsResult = await project.config.all();
    if (!agentsResult.success) return agentsResult;
    const agents = agentsResult.data.config.agents;

    if (agents.length === 0) return err(new ValidationError('no agents in project'));

    const agentName = input.runtime ?? (agents.length === 1 ? agents[0] : undefined);
    if (!agentName) return err(new ValidationError('multiple agents found, specify --runtime'));
    if (!agents.includes(agentName)) return err(new ValidationError(`agent "${agentName}" not found`));

    const port = input.port ?? 8000;

    if (input.prompt) {
      const invokeResult = await project.invokeDevServer({ port, prompt: input.prompt, stream: input.stream ?? false });
      if (!invokeResult.success) return invokeResult;
      if (!input.stream) {
        context.consoleLogger.info(invokeResult.data.response);
      }
      return invokeResult;
    }

    return project.startDevServer({ agentName, port });
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('dev').description('Start local development server').showHelpAfterError(),
};
