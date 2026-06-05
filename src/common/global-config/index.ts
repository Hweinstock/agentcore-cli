import { type JsonDatastore, getJsonDatastore, jsonFileSource } from '../json-datastore';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';

export const GLOBAL_CONFIG_DIR = process.env.AGENTCORE_CONFIG_DIR ?? join(homedir(), '.agentcore');
export const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, 'config.json');

export const globalConfigSchema = z
  .object({
    installationId: z.string().uuid().optional(),
    uvDefaultIndex: z.string().optional(),
    uvIndex: z.string().optional(),
    disableTransactionSearch: z.boolean().optional(),
    transactionSearchIndexPercentage: z.number().int().min(0).max(100).optional(),
    telemetry: z
      .object({
        enabled: z.boolean().optional(),
        endpoint: z.string().optional(),
        audit: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type GlobalConfig = z.infer<typeof globalConfigSchema>;
export type TelemetryConfig = NonNullable<GlobalConfig['telemetry']>;
export type GlobalConfigAccessor = JsonDatastore<GlobalConfig>;

export const getGlobalConfigAccessor = (): GlobalConfigAccessor =>
  getJsonDatastore({ schema: globalConfigSchema, source: jsonFileSource(GLOBAL_CONFIG_FILE) });
