import { type CommandHandler, toAction } from '..';
import { getProjectBuilder } from '../../project';
import type { AgentCoreCommand } from '../types';
import * as z from 'zod';

const schema = z.object({
  name: z.string().optional(),
  projectName: z.string().optional(),
  language: z.string().optional(),
  framework: z.string().optional(),
  agent: z.boolean().optional(),
  json: z.boolean().optional(),
});

const handler: CommandHandler<z.infer<typeof schema>> = async (props, input) => {
  const result = getProjectBuilder(props).build({
    name: input.name,
    projectName: input.projectName,
    language: input.language,
    framework: input.framework,
    agent: input.agent,
  });
  if (result.success) {
    if (input.json) props.logger.info(JSON.stringify(result.data));
    else props.logger.info(`Created project ${result.data?.name}`);
  }
  return result;
};

export const createCommand: AgentCoreCommand = {
  register: (props, parentCommand) => {
    return parentCommand
      .command('create')
      .description('this is the create command')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Resource name [non-interactive]')
      .option('--project-name <name>', 'Project name [non-interactive]')
      .option('--language <language>', 'Target language: Python or TypeScript [non-interactive]')
      .option('--framework <framework>', 'Agent framework [non-interactive]')
      .option('--no-agent', 'Skip agent creation [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]')
      .action(toAction(props, schema, handler));
  },
};
