import z from "zod";
import type { AppIO } from "../../../io";
import { flag } from "../../../router";
import { createLogsHandler } from "../../observability/logs";
import type { Core } from "../../types";
import { coreOptsFromCtx } from "../../utils";
import type { CoreEvalClient } from "../types";

export const createEvalLogsHandler = (
  core: Core,
  io: AppIO,
  {
    resource,
    logSource,
  }: {
    resource: string;
    logSource: CoreEvalClient["resourceBatchEvaluationLogSource"];
  },
) =>
  createLogsHandler(io, {
    name: "logs",
    description: `stream or search ${resource} logs`,
    flags: [flag("id", `the ID of the ${resource} resource`, z.string().min(1))] as const,
    read: async (ctx, flags, request, signal) => {
      const options = coreOptsFromCtx(ctx);
      const source = await logSource(flags.id, options, signal);

      if (request.mode === "search") {
        return {
          events: core.observability.searchLogs(source, request.query, options, signal),
        };
      }

      return {
        events: core.observability.tailLogs(source, request.query, options, signal),
        announcement: `Streaming logs for ${resource} ${flags.id}... (Ctrl+C to stop)`,
      };
    },
  });
