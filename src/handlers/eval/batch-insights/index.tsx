import type { AppIO } from "../../../io";
import { Router } from "../../../router";
import { withTuiOnEmptyFlagsAndArgs } from "../../../middleware";
import { renderTui } from "../../../tui";
import type { Core } from "../../types";
import { createGetBatchInsightsHandler } from "./get";
import { createListBatchInsightsHandler } from "./list";
import { createRunBatchInsightsHandler } from "./run";
import { createStopBatchInsightsHandler } from "./stop";
import { createEvalLogsHandler } from "../logs";

export function createBatchInsightsHandler(core: Core, io: AppIO): Router {
  return new Router("batch-insights", "run and inspect AgentCore batch insights")
    .use(withTuiOnEmptyFlagsAndArgs(core, io))
    .default(renderTui(core, io))
    .supportedTuiCommands("get", "list")
    .handler(createRunBatchInsightsHandler(core, io))
    .handler(createGetBatchInsightsHandler(core))
    .handler(createListBatchInsightsHandler(core))
    .handler(createStopBatchInsightsHandler(core))
    .handler(
      createEvalLogsHandler(core, io, {
        resource: "batch-insights",
        logSource: core.eval.resourceBatchInsightsLogSource.bind(core.eval),
      }),
    );
}

export { BatchInsightsScreen } from "./screen.tsx";
