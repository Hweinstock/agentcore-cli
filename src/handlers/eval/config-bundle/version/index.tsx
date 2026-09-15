import { Router } from "../../../../router";
import { renderTui } from "../../../../tui";
import type { AppIO } from "../../../../io";
import type { Core } from "../../../types";
import { createListConfigBundleVersionsHandler } from "./list";

export function createConfigBundleVersionHandler(core: Core, io: AppIO): Router {
  return new Router("version", "inspect immutable configuration bundle versions")
    .default(renderTui(core, io))
    .supportedTuiCommands("list")
    .handler(createListConfigBundleVersionsHandler(core));
}
