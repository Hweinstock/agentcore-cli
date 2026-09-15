import { Router } from "../../../router";
import { renderTui } from "../../../tui";
import type { AppIO } from "../../../io";
import type { Core } from "../../types";
import { createCreateDatasetHandler } from "./create";
import { createGetDatasetHandler } from "./get";
import { createListDatasetsHandler } from "./list";
import { createDeleteDatasetHandler } from "./delete";
import { createPublishDatasetHandler } from "./publish";
import { createUpdateDatasetHandler } from "./update";

export function createDatasetHandler(core: Core, io: AppIO): Router {
  return new Router("dataset", "manage AgentCore evaluation datasets")
    .default(renderTui(core, io))
    .supportedTuiCommands("get", "list")
    .handler(createCreateDatasetHandler(core, io))
    .handler(createGetDatasetHandler(core))
    .handler(createListDatasetsHandler(core))
    .handler(createDeleteDatasetHandler(core))
    .handler(createUpdateDatasetHandler(core, io))
    .handler(createPublishDatasetHandler(core));
}

export { DatasetScreen } from "./screen.tsx";
