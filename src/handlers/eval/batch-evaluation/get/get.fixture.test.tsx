import { expect, test } from "bun:test";
import { join } from "node:path";
import { CoreClient } from "../../../../core";
import {
  createSilentLogger,
  fixtureFactories,
  matchGolden,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../../testing";
import { createRootHandler } from "../../../index";

const FIXTURES = join(import.meta.dir, "__fixtures__");

// Recorded against real batch jobs: a complete arithmetic-agent trace and two
// deliberately incomplete traces whose missing log events cause service errors.
// RECORD=1 refreshes the SDK responses and golden output. These jobs and their
// output streams must still exist; use fresh jobs if their logs have expired.
// Redact account identifiers in recordings before publishing them.
test.each([
  ["success", "cli_logs_success_20261013-ab043c87dc", "COMPLETED", 2, 0, undefined],
  [
    "errors",
    "cli_logs_errors_20261013-0ce8bc1c19",
    "FAILED",
    0,
    2,
    "JobProcessorCustomerException",
  ],
  [
    "missing-events",
    "cli_logs_missing_spans_20261013-c5290ec8b4",
    "FAILED",
    0,
    2,
    "LogEventMissingException",
  ],
  [
    "mixed-custom-output",
    "cli_logs_mixed_retry_20261013-356d56c3e2",
    "COMPLETED_WITH_ERRORS",
    1,
    1,
    "LogEventMissingException",
  ],
  ["errors-metadata-only", "cli_logs_errors_20261013-0ce8bc1c19", "FAILED", 0, 0, undefined],
] as const)(
  "get retains recorded %s output",
  async (name, id, status, scores, errors, errorType) => {
    const metadataOnly = name === "errors-metadata-only";
    const io = testIO();
    const core = new CoreClient({
      ...fixtureFactories(FIXTURES),
      logger: createSilentLogger(),
    });
    const root = createRootHandler(core, {
      io: io.io,
      logger: createSilentLogger(),
      globalConfigAccessor: new TestGlobalConfigAccessor(),
    });

    await root.route([
      "node",
      "agentcore",
      "eval",
      "batch-evaluation",
      "get",
      "--id",
      id,
      "--region",
      "us-east-1",
      "--json",
      ...(metadataOnly ? ["--disable-cw-results"] : []),
    ]);

    expect(io.stderr()).toBe("");
    const detail = JSON.parse(io.stdout());
    expect(detail.batchEvaluationId).toBe(id);
    expect(detail.status).toBe(status);
    if (metadataOnly) {
      expect(detail.results).toBeUndefined();
    } else {
      expect(detail.results).toHaveLength(scores + errors);
      const scored = detail.results.filter(
        (result: { score?: number }) => typeof result.score === "number",
      );
      const failed = detail.results.filter(
        (result: { error?: string }) => result.error !== undefined,
      );
      expect(scored).toHaveLength(scores);
      expect(failed).toHaveLength(errors);
      for (const result of scored) {
        expect(result.evaluatorId).toBe("Builtin.Helpfulness");
        expect(result.error).toBeUndefined();
      }
      for (const result of failed) {
        expect(result.errorType).toBe(errorType);
        expect(result.sessionId).toStartWith("cli-error-session-");
        if (errorType === "LogEventMissingException") {
          expect(result.error).toContain("missing a corresponding log event");
          expect(result.evaluatorId).toBe("Builtin.Helpfulness");
        } else {
          expect(result.error).toContain("No spans were found for the session");
          expect(result.evaluatorId).toBeUndefined();
        }
      }
    }
    matchGolden(FIXTURES, `${name}.golden.json`, io.stdout());
  },
);
