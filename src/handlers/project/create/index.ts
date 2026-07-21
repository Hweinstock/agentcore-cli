import z from "zod";
import { createHandler, flag } from "../../../router";
import { PROJECT_TEMPLATES, type ProjectManager } from "../types";

type CreateProjectHandlerConfig = {
  projectManager: ProjectManager;
};

export const createCreateProjectHandler = (config: CreateProjectHandlerConfig) =>
  createHandler({
    name: "create",
    description: "create a new AgentCore project",
    flags: [
      flag(
        "template",
        "project template to scaffold from",
        z.enum(PROJECT_TEMPLATES).default(PROJECT_TEMPLATES.BAREBONES),
      ),
    ],
    handle: async (_ctx, flags) => {
      await config.projectManager.create({
        template: flags.template,
      });
    },
  });
