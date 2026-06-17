import { type JsonDatastore, getJsonDatastore, jsonFileSource } from '../common';
import type { Logger } from '../logging';
import z from 'zod';

const agentCoreJsonPath = `./agentcore/agentcore.json`;
// This is a simplified config, intended to represent the agentcore.json schema.
export const projectConfigSchema = z.object({
  agents: z.array(z.string()),
  memories: z.array(z.string()),
  gateways: z.array(z.string()),
  harnesses: z.array(z.string()),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

// The datastore already exposes list helpers (`add`/`remove`) over array-valued
// paths, so the accessor is just a typed `JsonDatastore<ProjectConfig>`.
export type ProjectConfigAccessor = JsonDatastore<ProjectConfig>;

export const getProjectConfigAccessor = (context?: { logger?: Logger }): ProjectConfigAccessor =>
  getJsonDatastore(context ?? {}, { schema: projectConfigSchema, source: jsonFileSource(agentCoreJsonPath) });
