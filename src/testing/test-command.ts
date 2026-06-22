import type { Command } from '../commands/types';
import { ok } from '../common';
import z from 'zod';

export const getTestCommand = (opts?: { schema?: z.ZodObject; handler?: Command['handler'] }): Command => ({
  name: 'test-command',
  schema: opts?.schema ?? z.object({}),
  handler: opts?.handler ?? (() => Promise.resolve(ok())),
  setup: (_ctx, parent) => parent,
});
