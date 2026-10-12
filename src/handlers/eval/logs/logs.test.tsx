import { describe, expect, test } from "bun:test";
import {
  type BedrockAgentCoreControlClient,
  type GetOnlineEvaluationConfigCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import type { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import {
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
  StartLiveTailCommand,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { CoreClient } from "../../../core";
import { InputValidationError, UserCancellationError } from "../../../errors";
import { createSilentLogger, TestGlobalConfigAccessor, testIO } from "../../../testing";
import { createRootHandler } from "../../index";

type Resource = "online-eval" | "online-insight" | "batch-evaluation" | "batch-insights";
const SINCE = 1_709_391_000_000;
const ID = "config-AbC123XyZ9";
const ONLINE_GROUP = `/aws/bedrock-agentcore/evaluations/results/${ID}`;
const BATCH_GROUP = "/aws/bedrock-agentcore/evaluations/batch-evaluations/results/default";
const SOURCE_GROUP = "/custom/source";
const EVENTS = [
  { timestamp: SINCE + 1_000, message: "first result", logStreamName: "run-a" },
  { timestamp: SINCE + 2_000, message: "second result", logStreamName: "run-b" },
];
const SOURCE_OUTPUT = { cloudWatchConfig: { resultDestination: "SOURCE_LOG_GROUP" } };
const CUSTOM_OUTPUT = {
  cloudWatchConfig: { logGroupName: "/custom/results", logStreamName: "run-a" },
};
const CUSTOM_CONFIG = { outputConfig: CUSTOM_OUTPUT };
const JSON_EVENTS = EVENTS.map((event) => ({
  ...event,
  timestamp: new Date(event.timestamp).toISOString(),
}));

function setup(
  options: {
    online?: Record<string, unknown>;
    batch?: Record<string, unknown>;
    logGroup?: string;
    onlineId?: string;
    readLogs?: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
  } = {},
) {
  const logGroup = options.logGroup ?? ONLINE_GROUP;
  const onlineId = options.onlineId ?? ID;
  const insights = [{ insightId: "Builtin.Insight.FailureAnalysis" }];
  const logGroupArn = `arn:aws:logs:us-west-2:123456789012:log-group:${logGroup}`;
  const unusedClient = () => {
    throw new Error("Unexpected AWS client");
  };
  const core = new CoreClient({
    createControlClient: () =>
      ({
        send: async (command: GetOnlineEvaluationConfigCommand) => {
          if (command.input.onlineEvaluationConfigId !== onlineId) {
            throw new Error("Online evaluation configuration not found");
          }
          return {
            onlineEvaluationConfigId: onlineId,
            insights,
            dataSourceConfig: { cloudWatchLogs: { logGroupNames: [SOURCE_GROUP] } },
            ...options.online,
          };
        },
      }) as unknown as BedrockAgentCoreControlClient,
    createDataClient: () =>
      ({
        send: async () => ({
          batchEvaluationId: ID,
          status: "COMPLETED",
          insights,
          ...options.batch,
        }),
      }) as unknown as BedrockAgentCoreClient,
    createLogsClient: () =>
      ({
        send: async (command: unknown, sendOptions?: { abortSignal?: AbortSignal }) => {
          if (command instanceof FilterLogEventsCommand) {
            if (options.readLogs) return options.readLogs(sendOptions?.abortSignal);
            const events = (command.input.logGroupName === logGroup ? EVENTS : []).filter(
              (event) =>
                !command.input.logStreamNames ||
                command.input.logStreamNames.includes(event.logStreamName),
            );
            const offset = Number(command.input.nextToken ?? 0);
            return {
              events: events.slice(offset, offset + 1),
              nextToken: offset + 1 < events.length ? `${offset + 1}` : undefined,
            };
          }
          if (command instanceof DescribeLogGroupsCommand) {
            return {
              logGroups: [{ logGroupName: logGroup, logGroupArn }],
            };
          }
          if (command instanceof StartLiveTailCommand) {
            return {
              responseStream: (async function* () {
                if (command.input.logGroupIdentifiers?.includes(logGroupArn)) {
                  yield { sessionUpdate: { sessionResults: EVENTS } };
                }
              })(),
            };
          }
          throw new Error("Unexpected CloudWatch command");
        },
      }) as unknown as CloudWatchLogsClient,
    createIamClient: unusedClient,
    createXrayClient: unusedClient,
    createApplicationSignalsClient: unusedClient,
    logger: createSilentLogger(),
  });
  const io = testIO();
  const root = createRootHandler(core, {
    io: io.io,
    logger: createSilentLogger(),
    globalConfigAccessor: new TestGlobalConfigAccessor(),
  });

  return {
    io,
    route: (resource: Resource, flags: readonly string[]) =>
      root.route([
        "node",
        "agentcore",
        "eval",
        resource,
        "logs",
        ...flags,
        "--region",
        "us-west-2",
      ]),
  };
}

describe("evaluation logs", () => {
  test.each([
    ["online-eval", "default", { logGroup: ONLINE_GROUP }],
    ["online-insight", "default", { logGroup: ONLINE_GROUP }],
    ["batch-evaluation", "default", { logGroup: BATCH_GROUP }],
    ["batch-insights", "default", { logGroup: BATCH_GROUP }],
    ["online-eval", "custom", { logGroup: "/custom/results", online: CUSTOM_CONFIG }],
    ["batch-evaluation", "custom", { logGroup: "/custom/results", batch: CUSTOM_CONFIG }],
    ["online-eval", "source", { logGroup: SOURCE_GROUP, online: { outputConfig: SOURCE_OUTPUT } }],
    [
      "batch-evaluation",
      "referenced online source",
      {
        logGroup: SOURCE_GROUP,
        onlineId: "source-config",
        online: CUSTOM_CONFIG,
        batch: {
          outputConfig: SOURCE_OUTPUT,
          dataSourceConfig: {
            onlineEvaluationConfigSource: {
              onlineEvaluationConfigArn:
                "arn:aws:bedrock-agentcore:us-west-2:123456789012:online-evaluation-config/source-config",
            },
          },
        },
      },
    ],
  ] as const)("%s %s includes all pages and streams", async (resource, _destination, options) => {
    const { io, route } = setup(options);

    await route(resource, ["--id", ID, "--since", `${SINCE}`, "--json"]);

    expect(
      io
        .stdout()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual(JSON_EVENTS);
    expect(io.stderr()).toBe("");
  });

  test("tails by default and announces the stream on stderr", async () => {
    const { io, route } = setup();

    await route("online-eval", ["--id", ID]);

    expect(io.stdout()).toBe(
      "2024-03-02T14:50:01.000Z  first result\n2024-03-02T14:50:02.000Z  second result",
    );
    expect(io.stderr()).toBe(`Streaming logs for online-eval ${ID}... (Ctrl+C to stop)`);
  });

  test("Ctrl+C cancels a pending log search", async () => {
    const started = Promise.withResolvers<void>();
    const search = Promise.withResolvers<Record<string, unknown>>();
    const { io, route } = setup({
      readLogs: (signal) => {
        signal?.addEventListener("abort", () => search.reject(new Error("transport aborted")));
        started.resolve();
        return search.promise;
      },
    });
    const pending = route("online-eval", ["--id", ID, "--since", "1h"]);

    try {
      await started.promise;
      process.emit("SIGINT", "SIGINT");
      await expect(pending).rejects.toBeInstanceOf(UserCancellationError);
    } finally {
      search.resolve({});
      await pending.catch(() => {});
    }
    expect(io.stdout()).toBe("");
    expect(io.stderr()).toBe("");
  });

  test("requires an explicit resource ID", async () => {
    const { route } = setup();

    await expect(route("online-eval", ["--since", "1h"])).rejects.toThrow(
      "required option '--id' not specified",
    );
  });

  test.each(["online-insight", "batch-insights"] as const)(
    "%s rejects a resource without insights",
    async (resource) => {
      const { route } = setup({ online: { insights: [] }, batch: { insights: [] } });

      await expect(route(resource, ["--id", ID, "--since", "1h"])).rejects.toBeInstanceOf(
        InputValidationError,
      );
    },
  );

  test("explains how to read results when the source has multiple groups", async () => {
    const { route } = setup({
      online: {
        outputConfig: SOURCE_OUTPUT,
        dataSourceConfig: { cloudWatchLogs: { logGroupNames: ["/one", "/two"] } },
      },
    });

    await expect(route("online-eval", ["--id", ID, "--since", "1h"])).rejects.toThrow(
      "configure one explicit source log group",
    );
  });
});
