import z from "zod";
import type { EvaluationReferenceInput } from "@aws-sdk/client-bedrock-agentcore";
import { createHandler, flag } from "../../../../router";
import { InputValidationError } from "../../../../errors";
import { JsonRendererKey } from "../../../../tui";
import type { AppIO } from "../../../../io";
import type { Core } from "../../../types";
import type { InvokedSession } from "../../types";
import { coreOptsFromCtx } from "../../../utils";
import { parseRuntimeInvokeHeaders } from "../../../runtime/invoke/request";

// Composes invokeDataset (replay) → getTracesForAgent (gather) → evaluate (grade,
// synchronous). The on-demand twin of batch-evaluation simulate: no async job, scores
// print inline. Invoke flags mirror `runtime invoke`.
export const createSimulateOnDemandHandler = (core: Core, _io: AppIO) =>
  createHandler({
    name: "simulate",
    description: "replay a dataset against a runtime, then evaluate the sessions client-side",
    flags: [
      flag("runtime-id", "runtime id to invoke per scenario", z.string().optional()),
      flag("qualifier", "runtime endpoint qualifier (default DEFAULT)", z.string().optional()),
      flag(
        "payload-template",
        'JSON payload template; {input} is the scenario input, e.g. {"prompt":"{input}"}',
        z.string().optional(),
      ),
      flag("header", "an ordered application header (repeatable)", z.array(z.string()).optional()),
      flag(
        "bearer-token",
        "CUSTOM_JWT bearer token (for JWT-auth runtimes)",
        z.string().optional(),
      ),
      flag("user-id", "runtime user id", z.string().optional()),
      flag("dataset", "dataset source: local JSONL path or a dataset id", z.string().optional()),
      flag("dataset-version", "dataset version (with a dataset id)", z.string().optional()),
      flag("evaluator", "evaluator id(s) to apply", z.array(z.string()).optional()),
      flag(
        "ingestion-wait-ms",
        "ms to wait for span ingestion before grading (default 180000; 0 to skip)",
        z.coerce.number().int().nonnegative().optional(),
      ),
    ],
    handle: async (ctx, flags) => {
      if (!flags["runtime-id"])
        throw new InputValidationError("required option '--runtime-id' not specified");
      if (!flags["payload-template"]) {
        throw new InputValidationError("required option '--payload-template' not specified");
      }
      if (!flags["dataset"])
        throw new InputValidationError("required option '--dataset' not specified");
      if (!flags["evaluator"]?.length) {
        throw new InputValidationError(
          "required option '--evaluator <evaluator...>' not specified",
        );
      }

      // Ctrl-C aborts the run (invokes, the ingestion wait, the dataset download).
      const controller = new AbortController();
      const interrupt = () => controller.abort();
      process.once("SIGINT", interrupt);
      try {
        const opts = coreOptsFromCtx(ctx);

        // 1. Replay the dataset — reuse invokeDataset verbatim (grader-agnostic).
        const replay = await core.eval.invokeDataset(
          {
            runtimeId: flags["runtime-id"],
            qualifier: flags["qualifier"],
            payloadTemplate: flags["payload-template"],
            headers: parseRuntimeInvokeHeaders(flags["header"]),
            bearerToken: flags["bearer-token"],
            userId: flags["user-id"],
            dataset: flags["dataset"],
            datasetVersion: flags["dataset-version"],
            waitIngestionMs: flags["ingestion-wait-ms"],
          },
          opts,
          controller.signal,
        );
        if (replay.invoked === 0) {
          const first = replay.failures[0];
          const detail = first ? `; first error: ${first.exampleId} — ${first.error}` : "";
          throw new InputValidationError(
            `no examples could be invoked (${replay.failed} failed) — nothing to evaluate${detail}`,
          );
        }

        // 2. Gather the just-created sessions' traces (client-side CloudWatch read).
        const traces = await core.eval.getTracesForAgent(
          {
            agent: flags["runtime-id"],
            endpoint: flags["qualifier"],
            sessionIds: replay.sessions.map((s) => s.sessionId),
          },
          opts,
        );

        // 3. Adapt neutral ground truth → EvaluationReferenceInput[] and grade synchronously.
        const groundTruth = replay.sessions.flatMap(toReferenceInputs);
        const result = await core.eval.evaluate(
          { traces, evaluatorIds: flags["evaluator"], groundTruth },
          opts,
        );

        ctx.require(JsonRendererKey).renderJson({
          ...result,
          examplesInvoked: replay.invoked,
          examplesFailed: replay.failed,
          sessions: replay.sessions.map((s) => ({
            exampleId: s.exampleId,
            sessionId: s.sessionId,
          })),
          failures: replay.failures,
        });
      } finally {
        process.off("SIGINT", interrupt);
      }
    },
  });

// Adapt one invoked session's neutral InlineGroundTruth to the Evaluate API's
// EvaluationReferenceInput, correlated by sessionId. assertions ({text}[]) and
// expectedTrajectory ({toolNames}) map 1:1. Per-turn expectedResponse is trace-level and
// needs a turn→trace id we don't have here, so it is omitted (batch simulate covers it).
function toReferenceInputs(s: InvokedSession): EvaluationReferenceInput[] {
  const gt = s.groundTruth;
  if (!gt?.assertions?.length && !gt?.expectedTrajectory) return [];
  return [
    {
      context: { spanContext: { sessionId: s.sessionId } },
      ...(gt.assertions?.length && { assertions: gt.assertions }),
      ...(gt.expectedTrajectory && { expectedTrajectory: gt.expectedTrajectory }),
    },
  ];
}
