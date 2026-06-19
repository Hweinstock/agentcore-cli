import { NoProjectFoundError, err } from '../../common';
import type { Command } from '../types';
import type z from 'zod';

export const withProject = <S extends z.ZodObject>(command: Command<S>): Command<S> => ({
  ...command,
  handler: async (context, input) => {
    const findProjectResult = await context.projectManager.find();
    if (!findProjectResult.success) return err(new NoProjectFoundError('no agentcore project found'));
    return command.handler({ ...context, project: findProjectResult.data }, input);
  },
});
