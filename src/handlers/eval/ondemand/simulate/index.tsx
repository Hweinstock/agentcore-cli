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
import { withUserCancellation } from "../../../../runnable";

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

      const runtimeId = flags["runtime-id"];
      const payloadTemplate = flags["payload-template"];
      const dataset = flags["dataset"];
      const evaluatorIds = flags["evaluator"];

      await withUserCancellation(async (signal) => {
        const opts = coreOptsFromCtx(ctx);

        const replay = await core.eval.invokeDataset(
          {
            runtimeId,
            qualifier: flags["qualifier"],
            payloadTemplate,
            headers: parseRuntimeInvokeHeaders(flags["header"]),
            bearerToken: flags["bearer-token"],
            userId: flags["user-id"],
            dataset,
            datasetVersion: flags["dataset-version"],
            waitIngestionMs: flags["ingestion-wait-ms"],
          },
          opts,
          signal,
        );
        if (replay.invoked === 0) {
          const first = replay.failures[0];
          const detail = first ? `; first error: ${first.exampleId} — ${first.error}` : "";
          throw new InputValidationError(
            `no examples could be invoked (${replay.failed} failed) — nothing to evaluate${detail}`,
          );
        }

        const traces = await core.eval.getTracesForAgent(
          {
            agent: runtimeId,
            endpoint: flags["qualifier"],
            sessionIds: replay.sessions.map((s) => s.sessionId),
          },
          opts,
        );

        const groundTruth = replay.sessions.flatMap(toReferenceInputs);
        const result = await core.eval.evaluate({ traces, evaluatorIds, groundTruth }, opts);

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
      });
    },
  });

function toReferenceInputs(s: InvokedSession): EvaluationReferenceInput[] {
  const gt = s.groundTruth;
  if (!gt) return [];
  const context = { spanContext: { sessionId: s.sessionId } };
  const refs: EvaluationReferenceInput[] = [];
  if (gt.assertions?.length || gt.expectedTrajectory) {
    refs.push({
      context,
      ...(gt.assertions?.length && { assertions: gt.assertions }),
      ...(gt.expectedTrajectory && { expectedTrajectory: gt.expectedTrajectory }),
    });
  }
  for (const turn of gt.turns ?? []) {
    if (turn.expectedResponse) refs.push({ context, expectedResponse: turn.expectedResponse });
  }
  return refs;
}
