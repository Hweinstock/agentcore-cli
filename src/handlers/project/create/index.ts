import z from "zod";
import { createHandler, flag } from "../../../router";
import type { ProjectManager } from "../types";

export const PROJECT_TEMPLATES = ["placeholder"] as const;

interface CreateProjectHandlerConfig {
  projectManager: ProjectManager;
}

export const createCreateProjectHandler = (config: CreateProjectHandlerConfig) =>
  createHandler({
    name: "create",
    description: "create a new AgentCore project",
    flags: [
      flag(
        "template",
        "project template to scaffold from",
        z.enum(PROJECT_TEMPLATES).default("placeholder"),
      ),
    ],
    handle: async (_ctx, flags) => {
      await config.projectManager.create({
        template: flags.template,
      });
    },
  });
