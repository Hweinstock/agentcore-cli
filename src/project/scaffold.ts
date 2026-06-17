import { type Result, ok } from '../common';
import { getProject } from './project';
import type { Project, ProjectManagerContext } from './types';

interface ScaffoldProjectOptions {
  outputDir: string;
}

export async function scaffoldProject(
  context: ProjectManagerContext,
  options: ScaffoldProjectOptions
): Promise<Result<Project>> {
  context.logger.info(`scaffolding project with options=${JSON.stringify(options)}`);
  return ok(getProject(context, options));
}
