import {
  GetQueryResultsCommand,
  StartQueryCommand,
  type CloudWatchLogsClient,
  type ResultField,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CloudWatchQueryError,
  InputValidationError,
  ResultTruncationError,
  type AgentCoreCLIError,
} from "../errors";

// Shared CloudWatch observability helpers. AgentCore Runtimes write their logs
// and OTel telemetry to per-runtime CloudWatch log groups; both the eval flows
// (session discovery, batch results) and the runtime observability commands
// (`runtime logs` / `runtime traces`) read them, so the derivations and the
// Logs Insights query runner live here rather than privately in one feature.

/** The default runtime endpoint qualifier used when none is specified. */
export const DEFAULT_ENDPOINT_QUALIFIER = "DEFAULT";

// CloudWatch Logs Insights hard ceiling: a query returns at most 100k rows.
export const INSIGHTS_MAX_ROWS = 100_000;

/**
 * CloudWatch log group path for an AgentCore runtime endpoint. AgentCore always
 * writes a runtime endpoint's logs and traces to this fixed path, keyed by the
 * runtime *id* (mirrors the old CLI's src/cli/aws/cloudwatch.ts derivation).
 */
export function runtimeLogGroup(runtimeId: string, endpoint: string): string {
  return `/aws/bedrock-agentcore/runtimes/${runtimeId}-${endpoint}`;
}

/**
 * Strips single quotes so an interpolated id can't break out of the quoted
 * Insights filter literal it is embedded in (matches the old CLI).
 */
export function sanitizeQueryValue(value: string): string {
  return value.replace(/'/g, "");
}

/**
 * Row-ceiling policy for {@link runInsightsQuery}: when a query drains `maxRows`
 * or more rows the result may be truncated, so the runner fails loudly with the
 * caller's error rather than returning a silently partial result. Callers with
 * a domain-specific remedy (e.g. eval's "narrow --session-ids") supply their
 * own `buildError`.
 */
export interface InsightsRowLimit {
  maxRows: number;
  buildError: (maxRows: number) => AgentCoreCLIError;
}

const DEFAULT_ROW_LIMIT: InsightsRowLimit = {
  maxRows: INSIGHTS_MAX_ROWS,
  buildError: (maxRows) =>
    new ResultTruncationError(
      `CloudWatch Logs Insights returned too many rows (>= ${maxRows}); narrow the time window`,
    ),
};

/**
 * Starts a CloudWatch Logs Insights query, waits for it to finish, then drains
 * all result pages. GetQueryResults returns <=10k rows per call, so a large
 * result spans multiple pages (nextToken); dropping any would silently return a
 * partial result. Fails fast when the row ceiling is hit — see
 * {@link InsightsRowLimit}.
 */
export async function runInsightsQuery(
  logs: CloudWatchLogsClient,
  logGroupNames: string[],
  queryString: string,
  startSec: number,
  endSec: number,
  rowLimit: InsightsRowLimit = DEFAULT_ROW_LIMIT,
): Promise<ResultField[][]> {
  const started = await logs.send(
    new StartQueryCommand({ logGroupNames, queryString, startTime: startSec, endTime: endSec }),
  );
  const queryId = started.queryId;

  // Phase 1: wait for completion. A large scan can take minutes, so the deadline is
  // generous; each poll costs one cheap GetQueryResults call.
  let status = "Running";
  for (let i = 0; i < 300 && status !== "Complete"; i++) {
    const result = await logs.send(new GetQueryResultsCommand({ queryId }));
    status = result.status ?? "Unknown";
    if (status === "Failed" || status === "Cancelled" || status === "Timeout") {
      throw new CloudWatchQueryError(`CloudWatch Logs Insights query ${status.toLowerCase()}`, {
        meta: { queryId, status },
      });
    }
    if (status !== "Complete") await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (status !== "Complete") {
    throw new CloudWatchQueryError("CloudWatch Logs Insights query did not finish in time", {
      meta: { queryId, status },
    });
  }

  // Phase 2: drain pages. Terminates on nextToken; total is bounded by the
  // query's own `| limit`.
  const rows: ResultField[][] = [];
  let nextToken: string | undefined;
  do {
    const result = await logs.send(new GetQueryResultsCommand({ queryId, nextToken }));
    rows.push(...(result.results ?? []));
    nextToken = result.nextToken;
  } while (nextToken);

  if (rows.length >= rowLimit.maxRows) {
    throw rowLimit.buildError(rowLimit.maxRows);
  }
  return rows;
}

const RELATIVE_DURATION_RE = /^(\d+)([smhd])$/;

const UNIT_TO_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a user-facing time string into epoch milliseconds.
 *
 * Supported forms (mirrors the old CLI's src/lib/utils/time-parser.ts):
 * - "now"
 * - Relative durations, meaning that long *ago*: "30s", "5m", "1h", "2d"
 * - Epoch milliseconds: "1709391000000" (13+ digits)
 * - Anything Date.parse accepts, e.g. ISO 8601: "2026-03-02T14:30:00Z"
 *
 * The reference clock is injectable for tests.
 */
export function parseTimeString(input: string, now: () => number = Date.now): number {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new InputValidationError("Time string cannot be empty");
  }

  if (trimmed === "now") {
    return now();
  }

  const match = RELATIVE_DURATION_RE.exec(trimmed);
  if (match) {
    const value = parseInt(match[1]!, 10);
    const ms = UNIT_TO_MS[match[2]!]!;
    return now() - value * ms;
  }

  // Epoch milliseconds: all digits, at least 13 of them — shorter all-digit
  // strings fall through to Date parsing below, like the old CLI.
  if (/^\d{13,}$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }

  throw new InputValidationError(
    `Invalid time string: "${input}". Use relative durations (5m, 1h, 2d), ISO 8601, epoch ms, or "now".`,
  );
}
