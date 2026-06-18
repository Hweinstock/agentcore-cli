import type { ProjectManagerContext } from '../types';
import { pythonRunner, typescriptRunner } from './runners';
import type { DevServerRunner } from './types';

export type { DevServerOptions, DevServerRunner } from './types';

export function resolveRunner(context: ProjectManagerContext, language: 'python' | 'typescript'): DevServerRunner {
  if (language === 'python') return pythonRunner(context);
  return typescriptRunner(context);
}
