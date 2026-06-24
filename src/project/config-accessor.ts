import { getJsonDatastore, jsonFileSource } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { Logger } from '../logging';
import { type ProjectConfig, type ProjectConfigAccessor, projectConfigSchema } from './types';
import path from 'node:path';

export const getProjectConfigAccessor = (
  context: { logger: Logger; env: EnvironmentAccessor },
  sourceDir?: string
): ProjectConfigAccessor =>
  getJsonDatastore(context ?? {}, {
    schema: projectConfigSchema,
    source: jsonFileSource(path.join(sourceDir ?? context.env.process.cwd(), 'agentcore', 'agentcore.json')),
  });

export function getDefaultProjectConfig(): ProjectConfig {
  return projectConfigSchema.parse({
    agents: [],
    memories: [],
    gateways: [],
    harnesses: [],
  });
}
