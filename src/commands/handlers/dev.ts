import { ValidationError, err } from '../../common';
import { buildCommand } from '../command-builder';
import type { AgentCoreCommandHandler } from '../types';
import * as z from 'zod';

const schema = z.object({
  prompt: z.string().optional(),
  runtime: z.string().optional(),
  port: z.number().optional(),
  stream: z.boolean().optional(),
  logs: z.boolean().optional(),
});

const handler: AgentCoreCommandHandler<typeof schema> = async (context, input) => {
  context.consoleLogger.info(`running dev handler`);
  const projectResult = await context.projectManager.find({});
  context.consoleLogger.info(`findResult=${JSON.stringify(projectResult)}`);
  if (!projectResult.success) return projectResult;
  const project = projectResult.data;

  const agentsResult = await project.config.all();
  if (!agentsResult.success) return agentsResult;
  const agents = agentsResult.data.config.agents;

  if (agents.length === 0) return err(new ValidationError('no agents in project'));

  const agentName = input.runtime ?? (agents.length === 1 ? agents[0] : undefined);
  if (!agentName) return err(new ValidationError('multiple agents found, specify --runtime'));
  if (!agents.includes(agentName)) return err(new ValidationError(`agent "${agentName}" not found`));

  const port = input.port ?? 8000;

  // Invoke mode: send prompt to an already-running server
  if (input.prompt) {
    const invokeResult = await project.invokeDevServer({ port, prompt: input.prompt, stream: input.stream ?? false });
    if (!invokeResult.success) return invokeResult;
    if (!input.stream) {
      context.consoleLogger.info(invokeResult.data.response);
    }
    return invokeResult;
  }

  // Server mode: start the dev server and block
  return project.startDevServer({ agentName, port });
};

export const devCommand = buildCommand({
  name: 'dev',
  schema,
  handler,
  setup: (_context, parentCommand) =>
    parentCommand
      .command('dev')
      .description('Start local development server')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--prompt <prompt>', 'Send a prompt to a running dev server')
      .option('-r, --runtime <name>', 'Agent to run or invoke')
      .option('-p, --port <port>', 'Port for dev server')
      .option('-s, --stream', 'Stream response when invoking')
      .option('-l, --logs', 'Run dev server with logs to stdout'),
});
