import type { Command, CommandFlags } from '../commands/types';
import { ok } from '../common';

const emptyFlags = {} as const satisfies CommandFlags;

export const getTestCommand = (opts?: {
  handler?: Command<typeof emptyFlags>['handler'];
}): Command<typeof emptyFlags> => ({
  name: 'test-command',
  flags: emptyFlags,
  handler: opts?.handler ?? (() => Promise.resolve(ok())),
  setup: (_ctx, parent) => parent,
});
