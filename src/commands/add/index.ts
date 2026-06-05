import { type CommandHandler, toAction } from '..';
import { ok } from '../../common';
import type { AgentCoreCommand } from '../types';
import { addMemoryCommand } from './memory';
import z from 'zod';

const schema = z.object({});

const handler: CommandHandler = async props => {
  props.logger.info(`running root level add command`);
  return ok();
};

export const addCommand: AgentCoreCommand = {
  register: (props, parentCommand) => {
    const addCommand = parentCommand
      .command('add')
      .description('this is the add command')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .action(toAction(props, schema, handler));

    addMemoryCommand.register(props, addCommand);
    return addCommand;
  },
};
