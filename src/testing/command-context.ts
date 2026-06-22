import type { CommandContext } from '../commands/types';
import { buildProgramContext } from './program-context';

export function getTestCommandContext(overrides?: Partial<CommandContext>): CommandContext {
  return { ...buildProgramContext(), ...(overrides ?? {}) };
}
