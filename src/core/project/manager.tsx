import type {
  CreateProjectInput,
  FindProjectInput,
  Project,
  ProjectManager,
} from "../../handlers/project/types";
import type { Logger } from "../../logging";

type ProjectManagerConfig = {
  logger: Logger;
};

/**
 * An implementation of {@link ProjectManager} that relies on the local file system to manage access to projects.
 */
export class FsProjectManager implements ProjectManager {
  constructor(_config: ProjectManagerConfig) {}

  public find(_input: FindProjectInput): Promise<Project> {
    throw new Error(`ProjectManager.find is not implemented yet`);
  }

  public create(_input: CreateProjectInput): Promise<Project> {
    throw new Error(`ProjectManager.create is not implemented yet`);
  }
}
