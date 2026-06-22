import { type Result, getJsonDatastore, inMemorySource, ok } from '../common';
import { projectConfigSchema } from '../project/config-accessor';
import type { AddAgentOptions } from '../project/project';
import type { Project } from '../project/types';

export function getInMemoryProject(): Project {
  const agents: AddAgentOptions[] = [];
  const initial = { agents: [], memories: [], gateways: [], harnesses: [] };
  const config = getJsonDatastore({}, { schema: projectConfigSchema, source: inMemorySource(initial) });

  return {
    config,
    addAgent: async (opts: AddAgentOptions): Promise<Result> => {
      agents.push(opts);
      await config.add('agents', opts.agentName);
      return ok();
    },
    deploy: async () => ok(),
    startDevServer: async () => ok(),
    invokeDevServer: async () => ok({ response: '' }),
  };
}
