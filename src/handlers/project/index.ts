import { Router } from "../../router";
import { createCreateProjectHandler } from "./create";
import type { ProjectManager } from "./types";

interface ProjectHandlerConfig {
  projectManager: ProjectManager;
}

export function createProjectHandler(config: ProjectHandlerConfig): Router {
  const project = new Router("project", "manage an AgentCore project");

  project.handler(createCreateProjectHandler({ projectManager: config.projectManager }));

  return project;
}
