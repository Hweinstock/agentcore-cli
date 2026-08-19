import type { AppIO } from "../../../io";
import type { ProjectManager } from "../types";

export type RemoveProjectResourceConfig = {
  projectManager: ProjectManager;
  io: AppIO;
};
