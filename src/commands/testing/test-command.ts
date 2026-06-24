import { ok } from '../../common';
import { getTestProgramContext } from '../../testing';
import type { Command, CommandContext, CommandFlags } from '../types';

const emptyFlags = {} as const satisfies CommandFlags;

export const getTestCommand = (opts?: {
  handler?: Command<typeof emptyFlags>['handler'];
}): Command<typeof emptyFlags> => ({
  name: 'test-command',
  flags: emptyFlags,
  handler: opts?.handler ?? (() => Promise.resolve(ok())),
  setup: (_ctx, parent) => parent,
});

export function getTestCommandContext(overrides?: Partial<CommandContext>): CommandContext {
  return { ...getTestProgramContext(), ...(overrides ?? {}) };
}
