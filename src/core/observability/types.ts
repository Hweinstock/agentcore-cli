import type { InsightsRowLimit } from "./insights";

/** Explicit CloudWatch Logs location selected by a primitive handler. */
export type LogSource = {
  logGroupName: string;
};

/** CloudWatch log event normalized at the AWS client boundary. */
export type CloudWatchLogEvent = {
  timestamp: Date;
  message: string;
  ingestionTime?: Date;
  logStreamName?: string;
};

export type LogSearchQuery = {
  startTimeMs: number;
  endTimeMs: number;
  filterPattern?: string;
  limit?: number;
};

export type LogTailQuery = {
  filterPattern?: string;
};

export type InsightsQuery = {
  queryString: string;
  startTimeMs: number;
  endTimeMs: number;
  rowLimit?: InsightsRowLimit;
};

export type InsightsQueryRow = Record<string, string>;
