import type { CommandContext } from '../commands/types';
import { getTestProgramContext } from './program-context';

export function getTestCommandContext(overrides?: Partial<CommandContext>): CommandContext {
  return { ...getTestProgramContext(), ...(overrides ?? {}) };
}
