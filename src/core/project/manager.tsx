import type { ProjectManager } from "../../handlers/project/types";
import type { Logger } from "../../logging";

type CreateProjectManagerConfig = {
  logger: Logger;
};

/**
 * Creates a {@link ProjectManager} that relies on the local file system to manage access to projects.
 */
export function createProjectManager(_config: CreateProjectManagerConfig): ProjectManager {
  return {
    find: (_input) => {
      throw new Error(`ProjectManager.find is not implemented yet`);
    },
    create: (_input) => {
      throw new Error(`ProjectManager.create is not implemented yet`);
    },
  };
}
