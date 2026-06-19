import { type JsonDatastore, getJsonDatastore, jsonFileSource } from '../common';
import type { EnvironmentAccessor } from '../env';
import type { Logger } from '../logging';
import path from 'node:path';
import z from 'zod';

// This is a simplified config, intended to represent the agentcore.json schema.
export const projectConfigSchema = z.object({
  agents: z.array(z.string()),
  memories: z.array(z.string()),
  gateways: z.array(z.string()),
  harnesses: z.array(z.string()),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export type ProjectConfigAccessor = JsonDatastore<ProjectConfig>;

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
