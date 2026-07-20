import type { ProjectManager } from "../../handlers/project/types";
import type { Logger } from "../../logging";

interface CreateProjectManagerConfig {
  logger: Logger;
}

export function createProjectManager(_config: CreateProjectManagerConfig): ProjectManager {
  return {
    find: () => {
      throw new Error(`ProjectManager.find is not implemented yet`);
    },
    create: (_input) => {
      throw new Error(`ProjectManager.create is not implemented yet`);
    },
  };
}
