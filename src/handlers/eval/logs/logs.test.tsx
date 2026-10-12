import { describe, expect, test } from "bun:test";
import type { BedrockAgentCoreControlClient } from "@aws-sdk/client-bedrock-agentcore-control";
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
import type { EvalLogsInput } from "../types";

const SINCE = 1_709_391_000_000;
const ID = "config-AbC123XyZ9";
const RESOURCES: EvalLogsInput["resource"][] = [
  "online-eval",
  "online-insight",
  "batch-evaluation",
  "batch-insights",
];
const EVENTS = [
  { timestamp: SINCE + 1_000, message: "first result", logStreamName: "run-a" },
  { timestamp: SINCE + 2_000, message: "second result", logStreamName: "run-b" },
];
const SOURCE_GROUP = "/custom/source";

function setup(
  metadata: Record<string, unknown> = {},
  readMetadata?: (signal?: AbortSignal) => Promise<Record<string, unknown>>,
) {
  const commands: { name: string; input: unknown }[] = [];
  const response = {
    onlineEvaluationConfigId: ID,
    batchEvaluationId: ID,
    status: "COMPLETED",
    insights: [{ insightId: "Builtin.Insight.FailureAnalysis" }],
    dataSourceConfig: { cloudWatchLogs: { logGroupNames: [SOURCE_GROUP] } },
    ...metadata,
  };
  const sendMetadata = async (
    command: { constructor: { name: string }; input: unknown },
    options?: { abortSignal?: AbortSignal },
  ) => {
    commands.push({ name: command.constructor.name, input: command.input });
    if (readMetadata) return readMetadata(options?.abortSignal);
    if (command.constructor.name === "GetOnlineEvaluationConfigCommand") {
      const { batchEvaluationId: _, ...config } = response;
      return config;
    }
    const { onlineEvaluationConfigId: _, ...job } = response;
    return job;
  };
  const unusedClient = () => {
    throw new Error("Unexpected AWS client");
  };
  const core = new CoreClient({
    createControlClient: () => ({ send: sendMetadata }) as unknown as BedrockAgentCoreControlClient,
    createDataClient: () => ({ send: sendMetadata }) as unknown as BedrockAgentCoreClient,
    createLogsClient: () =>
      ({
        send: async (command: unknown) => {
          if (command instanceof FilterLogEventsCommand) {
            commands.push({ name: command.constructor.name, input: command.input });
            return command.input.nextToken
              ? { events: [EVENTS[1]] }
              : { events: [EVENTS[0]], nextToken: "page-2" };
          }
          if (command instanceof DescribeLogGroupsCommand) {
            commands.push({ name: command.constructor.name, input: command.input });
            return {
              logGroups: [
                {
                  logGroupName: command.input.logGroupNamePrefix,
                  logGroupArn: "arn:aws:logs:us-west-2:123456789012:log-group:test",
                },
              ],
            };
          }
          if (command instanceof StartLiveTailCommand) {
            commands.push({ name: command.constructor.name, input: command.input });
            return {
              responseStream: (async function* () {
                yield { sessionUpdate: { sessionResults: EVENTS } };
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
    commands,
    io,
    route: (resource: EvalLogsInput["resource"], flags: readonly string[]) =>
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

describe.each(RESOURCES)("eval %s logs", (resource) => {
  const defaultGroup = resource.startsWith("online")
    ? `/aws/bedrock-agentcore/evaluations/results/${ID}`
    : "/aws/bedrock-agentcore/evaluations/batch-evaluations/results/default";
  const searchFlags = ["--id", ID, "--since", `${SINCE}`, "--until", `${SINCE + 60_000}`];

  test.each([
    { destination: "default", outputConfig: undefined, expectedGroup: defaultGroup },
    {
      destination: "custom",
      outputConfig: {
        cloudWatchConfig: { logGroupName: "/custom/results", logStreamName: "run-a" },
      },
      expectedGroup: "/custom/results",
    },
    {
      destination: "source",
      outputConfig: { cloudWatchConfig: { resultDestination: "SOURCE_LOG_GROUP" } },
      expectedGroup: SOURCE_GROUP,
    },
  ])("searches the entire $destination group across pages and streams", async (testCase) => {
    const { commands, io, route } = setup({ outputConfig: testCase.outputConfig });

    await route(resource, [...searchFlags, "--json"]);

    expect(
      io
        .stdout()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual(
      EVENTS.map((event) => ({ ...event, timestamp: new Date(event.timestamp).toISOString() })),
    );
    const searches = commands.filter((command) => command.name === "FilterLogEventsCommand");
    expect(searches.map((command) => command.input)).toEqual([
      { logGroupName: testCase.expectedGroup, startTime: SINCE, endTime: SINCE + 60_000 },
      {
        logGroupName: testCase.expectedGroup,
        startTime: SINCE,
        endTime: SINCE + 60_000,
        nextToken: "page-2",
      },
    ]);
    expect(commands[0]?.name).toBe(
      resource.startsWith("online")
        ? "GetOnlineEvaluationConfigCommand"
        : "GetBatchEvaluationCommand",
    );
    expect(io.stderr()).toBe("");
  });

  test("streams the configured group by default with a stderr announcement", async () => {
    const { commands, io, route } = setup({
      outputConfig: { cloudWatchConfig: { logGroupName: "/custom/results" } },
    });

    await route(resource, ["--id", ID, "--query", "ERROR"]);

    expect(io.stdout()).toBe(
      "2024-03-02T14:50:01.000Z  first result\n2024-03-02T14:50:02.000Z  second result",
    );
    expect(io.stderr()).toBe(`Streaming logs for ${resource} ${ID}... (Ctrl+C to stop)`);
    expect(commands.find((command) => command.name === "DescribeLogGroupsCommand")?.input).toEqual({
      logGroupNamePrefix: "/custom/results",
    });
    expect(commands.find((command) => command.name === "StartLiveTailCommand")?.input).toEqual({
      logGroupIdentifiers: ["arn:aws:logs:us-west-2:123456789012:log-group:test"],
      logEventFilterPattern: "ERROR",
    });
  });

  test("Ctrl+C cancels metadata lookup without waiting for a service response", async () => {
    let receivedSignal: AbortSignal | undefined;
    let releaseMetadata = () => {};
    let metadataStarted = () => {};
    const started = new Promise<void>((resolve) => {
      metadataStarted = resolve;
    });
    const { commands, io, route } = setup({}, (signal) => {
      receivedSignal = signal;
      metadataStarted();
      return new Promise((resolve, reject) => {
        releaseMetadata = () => resolve({});
        signal?.addEventListener("abort", () => reject(new Error("transport aborted")), {
          once: true,
        });
      });
    });
    const pending = route(resource, ["--id", ID, "--since", "1h"]);

    try {
      await started;
      expect(receivedSignal).toBeDefined();
      process.emit("SIGINT", "SIGINT");
      await expect(pending).rejects.toBeInstanceOf(UserCancellationError);
      expect(receivedSignal?.aborted).toBe(true);
    } finally {
      releaseMetadata();
      await pending.catch(() => {});
    }
    expect(commands).toHaveLength(1);
    expect(io.stdout()).toBe("");
    expect(io.stderr()).toBe("");
  });

  test.each([
    { flags: [], message: "required option '--id' not specified" },
    { flags: ["--id", ""], message: "Invalid value for option '--id'" },
    {
      flags: ["--id", ID, "--tail", "--since", "1h"],
      message: "--tail cannot be combined with --since or --until",
    },
  ])("validates flags before fetching metadata: $message", async ({ flags, message }) => {
    const { commands, route } = setup();

    await expect(route(resource, flags)).rejects.toThrow(message);
    expect(commands).toHaveLength(0);
  });
});

test.each(["online-insight", "batch-insights"] as const)(
  "rejects a resource without insights through %s logs",
  async (resource) => {
    const { commands, route } = setup({ insights: [] });

    await expect(route(resource, ["--id", ID, "--since", "1h"])).rejects.toBeInstanceOf(
      InputValidationError,
    );
    expect(commands).toHaveLength(1);
  },
);
