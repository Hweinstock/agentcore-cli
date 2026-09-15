import type { AppIO } from "../../../io";
import { Router } from "../../../router";
import type { Core } from "../../types";
import { createProjectRuntimeLogHandler } from "./runtime";

export function createProjectLogHandler(core: Core, io: AppIO): Router {
  return new Router("log", "inspect logs for resources in the current project").handler(
    createProjectRuntimeLogHandler(core, io),
  );
}
