import type { Project, ProjectManager } from "../handlers/project/types";
import { ProjectKey, type Middleware } from "../router";

interface WithProjectConfig {
  projectManager: ProjectManager;
  cwd: string;
}

export function withProject(config: WithProjectConfig): Middleware {
  return (h) => ({
    name: () => h.name(),
    description: () => h.description(),
    flags: () => h.flags(),
    arguments: () => h.arguments(),
    children: () => h.children(),
    handle: async (ctx, flags, args) => {
      const project = await config.projectManager.find({ filePath: config.cwd });
      await h.handle(ctx.withValue<Project>(ProjectKey, project), flags, args);
    },
  });
}
