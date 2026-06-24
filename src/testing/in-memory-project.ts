import { type Result, getJsonDatastore, inMemorySource, ok } from '../common';
import { projectConfigSchema } from '../project/config-accessor';
import type { AddAgentOptions , Project } from '../project/types';

export interface InMemoryProject extends Project {
  agents: AddAgentOptions[];
  isDeployed: boolean;
  devServerRunning: boolean;
}

export function getInMemoryProject(): InMemoryProject {
  const agents: AddAgentOptions[] = [];
  let isDeployed = false;
  let devServerRunning = false;
  const initial = { agents: [], memories: [], gateways: [], harnesses: [] };
  const config = getJsonDatastore({}, { schema: projectConfigSchema, source: inMemorySource(initial) });

  const project: InMemoryProject = {
    agents,
    get isDeployed() {
      return isDeployed;
    },
    set isDeployed(v) {
      isDeployed = v;
    },
    get devServerRunning() {
      return devServerRunning;
    },
    set devServerRunning(v) {
      devServerRunning = v;
    },
    config,
    addAgent: async (opts: AddAgentOptions): Promise<Result> => {
      agents.push(opts);
      await config.add('agents', opts.agentName);
      return ok();
    },
    deploy: async () => {
      isDeployed = true;
      return ok();
    },
    startDevServer: async () => {
      devServerRunning = true;
      return ok();
    },
    invokeDevServer: async () => ok({ response: '' }),
  };

  return project;
}
