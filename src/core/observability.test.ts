import { describe, expect, test } from "bun:test";
import {
  GetQueryResultsCommand,
  StartQueryCommand,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchQueryError, InputValidationError, ResultTruncationError } from "../errors";
import {
  parseTimeString,
  runInsightsQuery,
  runtimeLogGroup,
  sanitizeQueryValue,
} from "./observability";

describe("runtimeLogGroup", () => {
  test("derives the fixed per-runtime path keyed by runtime id and endpoint", () => {
    expect(runtimeLogGroup("my_agent-AbC123XyZ9", "DEFAULT")).toBe(
      "/aws/bedrock-agentcore/runtimes/my_agent-AbC123XyZ9-DEFAULT",
    );
  });
});

describe("sanitizeQueryValue", () => {
  test("strips single quotes so values cannot escape a quoted Insights literal", () => {
    expect(sanitizeQueryValue("abc'| drop '123")).toBe("abc| drop 123");
    expect(sanitizeQueryValue("clean-id")).toBe("clean-id");
  });
});

describe("parseTimeString", () => {
  const NOW = 1_700_000_000_000;
  const now = () => NOW;

  test('parses "now" as the current time', () => {
    expect(parseTimeString("now", now)).toBe(NOW);
  });

  test("parses relative durations for every unit as that long ago", () => {
    expect(parseTimeString("30s", now)).toBe(NOW - 30_000);
    expect(parseTimeString("5m", now)).toBe(NOW - 5 * 60_000);
    expect(parseTimeString("1h", now)).toBe(NOW - 3_600_000);
    expect(parseTimeString("2d", now)).toBe(NOW - 2 * 86_400_000);
  });

  test("parses epoch milliseconds (13+ digits) literally", () => {
    expect(parseTimeString("1709391000000", now)).toBe(1_709_391_000_000);
  });

  test("parses ISO 8601 timestamps", () => {
    expect(parseTimeString("2026-03-02T14:30:00Z", now)).toBe(Date.parse("2026-03-02T14:30:00Z"));
  });

  test("trims surrounding whitespace", () => {
    expect(parseTimeString("  15m ", now)).toBe(NOW - 15 * 60_000);
  });

  test("rejects empty input with a typed error", () => {
    expect(() => parseTimeString("   ", now)).toThrow(InputValidationError);
    expect(() => parseTimeString("", now)).toThrow("Time string cannot be empty");
  });

  test("rejects garbage with a typed error naming the accepted forms", () => {
    expect(() => parseTimeString("yesterday-ish", now)).toThrow(InputValidationError);
    expect(() => parseTimeString("5x", now)).toThrow(
      'Invalid time string: "5x". Use relative durations (5m, 1h, 2d), ISO 8601, epoch ms, or "now".',
    );
  });
});

type Send = (command: unknown) => Promise<unknown>;

function fakeLogs(send: Send): CloudWatchLogsClient {
  return { send } as unknown as CloudWatchLogsClient;
}

function row(field: string, value: string) {
  return [{ field, value }];
}

describe("runInsightsQuery", () => {
  test("starts the query, waits for completion, and drains every result page", async () => {
    // Poll phase sees Complete on the first read; the drain phase then re-reads
    // page one and follows nextToken to page two.
    const logs = fakeLogs(async (command) => {
      if (command instanceof StartQueryCommand) {
        expect(command.input).toEqual({
          logGroupNames: ["/aws/group-a", "/aws/group-b"],
          queryString: "fields @message",
          startTime: 100,
          endTime: 200,
        });
        return { queryId: "q-1" };
      }
      expect(command).toBeInstanceOf(GetQueryResultsCommand);
      const input = (command as GetQueryResultsCommand).input;
      expect(input.queryId).toBe("q-1");
      if (input.nextToken === "page-2") {
        return { status: "Complete", results: [row("@message", "second")] };
      }
      return {
        status: "Complete",
        results: [row("@message", "first")],
        nextToken: "page-2",
      };
    });

    const rows = await runInsightsQuery(
      logs,
      ["/aws/group-a", "/aws/group-b"],
      "fields @message",
      100,
      200,
    );
    expect(rows).toEqual([row("@message", "first"), row("@message", "second")]);
  });

  test("throws a typed error when the query reaches a terminal failure state", async () => {
    const logs = fakeLogs(async (command) => {
      if (command instanceof StartQueryCommand) return { queryId: "q-2" };
      return { status: "Failed" };
    });

    await expect(runInsightsQuery(logs, ["/aws/g"], "q", 0, 1)).rejects.toThrow(
      CloudWatchQueryError,
    );
    await expect(runInsightsQuery(logs, ["/aws/g"], "q", 0, 1)).rejects.toThrow(
      "CloudWatch Logs Insights query failed",
    );
  });

  test("fails loudly with the default truncation error when the row ceiling is hit", async () => {
    const logs = fakeLogs(async (command) => {
      if (command instanceof StartQueryCommand) return { queryId: "q-3" };
      return { status: "Complete", results: [row("@message", "a"), row("@message", "b")] };
    });

    await expect(
      runInsightsQuery(logs, ["/aws/g"], "q", 0, 1, {
        maxRows: 2,
        buildError: (maxRows) => new ResultTruncationError(`hit ceiling ${maxRows}`),
      }),
    ).rejects.toThrow("hit ceiling 2");
  });

  test("lets the caller supply a domain-specific row-ceiling error", async () => {
    const logs = fakeLogs(async (command) => {
      if (command instanceof StartQueryCommand) return { queryId: "q-4" };
      return { status: "Complete", results: [row("@message", "a")] };
    });

    await expect(
      runInsightsQuery(logs, ["/aws/g"], "q", 0, 1, {
        maxRows: 1,
        buildError: () => new InputValidationError("narrow the scope"),
      }),
    ).rejects.toThrow(InputValidationError);
  });
});
