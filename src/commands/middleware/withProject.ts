import { NoProjectFoundError, err } from '../../common';
import type { Command, CommandFlags } from '../types';

export const withProject = <F extends CommandFlags>(command: Command<F>): Command<F> => ({
  ...command,
  handler: async (context, input) => {
    const findProjectResult = await context.projectManager.find();
    if (!findProjectResult.success) return err(new NoProjectFoundError('no agentcore project found'));
    return command.handler({ ...context, project: findProjectResult.data }, input);
  },
});
