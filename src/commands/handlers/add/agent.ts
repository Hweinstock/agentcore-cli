import { err } from '../../../common';
import { withProject } from '../../middleware/withProject';
import type { Command, CommandHandler } from '../../types';
import * as z from 'zod';

const schema = z.object({
  name: z.string(),
  language: z.enum(['python', 'typescript']).optional(),
  framework: z.enum(['strands', 'vercel', 'langchain_langgraph']).optional(),
  protocol: z.enum(['http', 'mcp']).optional(),
  memory: z.enum(['none', 'longAndShort', 'short']).optional(),
  buildType: z.enum(['container', 'codezip']).optional(),
});

const handler: CommandHandler<typeof schema> = async (context, input) => {
  if (!context.project) return err(new Error('missing project'));

  return context.project.addAgent({
    agentName: input.name,
    language: input.language ?? 'python',
    framework: input.framework ?? 'strands',
    protocol: input.protocol ?? 'http',
    memory: input.memory ?? 'none',
    buildType: input.buildType ?? 'codezip',
  });
};

export const addAgentCommand: Command<typeof schema> = {
  name: 'add.agent',
  schema,
  handler,
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand
      .command('agent')
      .description('Add an agent to the project')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .requiredOption('--name <name>', 'Agent name')
      .option('--language <language>', 'Language: python or typescript (default: python)')
      .option('--framework <framework>', 'Framework: strands, vercel, or langchain_langgraph (default: strands)')
      .option('--protocol <protocol>', 'Protocol: http or mcp (default: http)')
      .option('--memory <memory>', 'Memory: none, longAndShort, or short (default: none)')
      .option('--build-type <type>', 'Build type: container or codezip (default: codezip)'),
};
