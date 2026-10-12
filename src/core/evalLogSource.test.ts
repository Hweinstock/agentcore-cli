import { describe, expect, test } from "bun:test";
import {
  GetOnlineEvaluationConfigCommand,
  type BedrockAgentCoreControlClient,
} from "@aws-sdk/client-bedrock-agentcore-control";
import {
  GetBatchEvaluationCommand,
  type BedrockAgentCoreClient,
} from "@aws-sdk/client-bedrock-agentcore";
import { EvalClient } from "./eval";
import type { AwsClients } from "./types";
import type { EvalLogsInput } from "../handlers/eval/types";
import { InputValidationError, MalformedServiceResponseError } from "../errors";

const OPTIONS = { region: "us-west-2", endpointUrl: "https://agentcore.example.test" };
const ID = "evaluation-1";
const SOURCE_GROUP = "/custom/source";
const ONLINE_CONFIG_ID = "config-1";
const ONLINE_CONFIG_ARN = `arn:aws:bedrock-agentcore:us-west-2:123456789012:online-evaluation-config/${ONLINE_CONFIG_ID}`;
const SOURCE_OUTPUT = { cloudWatchConfig: { resultDestination: "SOURCE_LOG_GROUP" } };

type Metadata = Record<string, unknown> | Error;
type MetadataCommand = GetOnlineEvaluationConfigCommand | GetBatchEvaluationCommand;
type SendOptions = { abortSignal?: AbortSignal };

function setup(
  responses: {
    online?: Metadata;
    batch?: Metadata;
    beforeResponse?: (command: MetadataCommand, options?: SendOptions) => Promise<void>;
  } = {},
) {
  const commands: MetadataCommand[] = [];
  const sendOptions: (SendOptions | undefined)[] = [];
  const online = responses.online ?? {
    onlineEvaluationConfigId: ONLINE_CONFIG_ID,
    dataSourceConfig: { cloudWatchLogs: { logGroupNames: [SOURCE_GROUP] } },
  };
  const batch = responses.batch ?? { outputConfig: SOURCE_OUTPUT };
  const unexpectedClient = () => {
    throw new Error("Unexpected AWS client; resolution must not read evaluation result streams.");
  };
  const send = async (command: MetadataCommand, response: Metadata, options?: SendOptions) => {
    commands.push(command);
    sendOptions.push(options);
    await responses.beforeResponse?.(command, options);
    if (response instanceof Error) throw response;
    return response;
  };
  const clients: AwsClients = {
    control: (config) => {
      expect(config).toEqual({ region: OPTIONS.region, endpoint: OPTIONS.endpointUrl });
      return {
        send: (command: GetOnlineEvaluationConfigCommand, options?: SendOptions) =>
          send(command, online, options),
      } as unknown as BedrockAgentCoreControlClient;
    },
    data: (config) => {
      expect(config).toEqual({ region: OPTIONS.region, endpoint: OPTIONS.endpointUrl });
      return {
        send: (command: GetBatchEvaluationCommand, options?: SendOptions) =>
          send(command, batch, options),
      } as unknown as BedrockAgentCoreClient;
    },
    logs: unexpectedClient,
    iam: unexpectedClient,
    xray: unexpectedClient,
    applicationSignals: unexpectedClient,
  };
  return { client: new EvalClient(clients), commands, sendOptions };
}

function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) throw new Error("Metadata lookup did not receive a cancellation signal.");
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

describe("evaluation log source resolution", () => {
  test.each([
    { onlineEvaluationConfigId: ONLINE_CONFIG_ID, expectedId: ONLINE_CONFIG_ID },
    { onlineEvaluationConfigId: undefined, expectedId: ID },
  ])("uses the online config ID or requested ID for the default group", async (testCase) => {
    const { client } = setup({
      online: { onlineEvaluationConfigId: testCase.onlineEvaluationConfigId },
    });

    await expect(
      client.resolveLogSource({ resource: "online-eval", id: ID }, OPTIONS),
    ).resolves.toEqual({
      logGroupName: `/aws/bedrock-agentcore/evaluations/results/${testCase.expectedId}`,
    });
  });

  test.each([ONLINE_CONFIG_ARN, ONLINE_CONFIG_ID])(
    "resolves a batch source reference %s to the online config's input group",
    async (reference) => {
      const { client, commands } = setup({
        online: {
          onlineEvaluationConfigId: ONLINE_CONFIG_ID,
          dataSourceConfig: { cloudWatchLogs: { logGroupNames: [SOURCE_GROUP] } },
          outputConfig: { cloudWatchConfig: { logGroupName: "/custom/online-results" } },
        },
        batch: {
          status: "COMPLETED",
          outputConfig: SOURCE_OUTPUT,
          dataSourceConfig: {
            onlineEvaluationConfigSource: { onlineEvaluationConfigArn: reference },
          },
        },
      });

      await expect(
        client.resolveLogSource({ resource: "batch-evaluation", id: ID }, OPTIONS),
      ).resolves.toEqual({ logGroupName: SOURCE_GROUP });
      expect(commands).toHaveLength(2);
      expect(commands[0]).toBeInstanceOf(GetBatchEvaluationCommand);
      expect(commands[0]?.input).toEqual({ batchEvaluationId: ID });
      expect(commands[1]).toBeInstanceOf(GetOnlineEvaluationConfigCommand);
      expect(commands[1]?.input).toEqual({ onlineEvaluationConfigId: ONLINE_CONFIG_ID });
    },
  );

  describe.each(["online-eval", "batch-evaluation"] as const)(
    "%s output configurations",
    (resource) => {
      const resolve = (metadata: Metadata) => {
        const { client } = setup({ online: metadata, batch: metadata });
        return client.resolveLogSource({ resource, id: ID }, OPTIONS);
      };

      test("uses the default for a dedicated destination without an explicit group", async () => {
        await expect(
          resolve({
            outputConfig: { cloudWatchConfig: { resultDestination: "DEDICATED_LOG_GROUP" } },
          }),
        ).resolves.toEqual({
          logGroupName:
            resource === "online-eval"
              ? `/aws/bedrock-agentcore/evaluations/results/${ID}`
              : "/aws/bedrock-agentcore/evaluations/batch-evaluations/results/default",
        });
      });

      test.each([
        { source: { logGroupNames: ["/one", "/two"] }, message: "multiple source log groups" },
        { source: { logGroupNamePrefixes: ["/prefix/"] }, message: "selected by prefix" },
      ])("rejects ambiguous source groups: $message", async ({ source, message }) => {
        const result = resolve({
          outputConfig: SOURCE_OUTPUT,
          dataSourceConfig: { cloudWatchLogs: source },
        });

        await expect(result).rejects.toBeInstanceOf(InputValidationError);
        await expect(result).rejects.toThrow(message);
        await expect(result).rejects.toThrow("configure one explicit source log group");
      });

      test.each([
        undefined,
        { cloudWatchLogs: { logGroupNames: [] } },
        { cloudWatchLogs: { logGroupNames: [""] } },
        { $unknown: ["futureSource", {}] },
      ])(
        "rejects a source destination without a usable source group: %j",
        async (dataSourceConfig) => {
          await expect(
            resolve({ outputConfig: SOURCE_OUTPUT, dataSourceConfig }),
          ).rejects.toBeInstanceOf(MalformedServiceResponseError);
        },
      );

      test("rejects an unknown output destination instead of assuming the default group", async () => {
        const result = resolve({ outputConfig: { $unknown: ["futureOutput", {}] } });

        await expect(result).rejects.toBeInstanceOf(InputValidationError);
        await expect(result).rejects.toThrow("logs require a CloudWatch output configuration");
      });
    },
  );

  test("rejects a batch source reference that has no ARN", async () => {
    const { client, commands } = setup({
      batch: {
        outputConfig: SOURCE_OUTPUT,
        dataSourceConfig: { onlineEvaluationConfigSource: {} },
      },
    });

    await expect(
      client.resolveLogSource({ resource: "batch-evaluation", id: ID }, OPTIONS),
    ).rejects.toBeInstanceOf(MalformedServiceResponseError);
    expect(commands).toHaveLength(1);
  });

  test.each([
    "online-eval",
    "online-insight",
    "batch-evaluation",
    "batch-insights",
  ] satisfies EvalLogsInput["resource"][])(
    "propagates %s metadata lookup failures",
    async (resource) => {
      const error = new Error("Metadata lookup failed");
      const { client } = setup({ online: error, batch: error });

      await expect(client.resolveLogSource({ resource, id: ID }, OPTIONS)).rejects.toBe(error);
    },
  );

  test("propagates failures looking up a batch job's online config source", async () => {
    const error = new Error("Source lookup failed");
    const { client } = setup({
      online: error,
      batch: {
        outputConfig: SOURCE_OUTPUT,
        dataSourceConfig: {
          onlineEvaluationConfigSource: { onlineEvaluationConfigArn: ONLINE_CONFIG_ARN },
        },
      },
    });

    await expect(
      client.resolveLogSource({ resource: "batch-evaluation", id: ID }, OPTIONS),
    ).rejects.toBe(error);
  });

  describe.each([
    "online-eval",
    "online-insight",
    "batch-evaluation",
    "batch-insights",
  ] satisfies EvalLogsInput["resource"][])("%s cancellation", (resource) => {
    test("passes the signal to metadata lookup without changing SDK request input", async () => {
      const controller = new AbortController();
      const metadata = {
        insights: [{ insightId: "Builtin.Insight.FailureAnalysis" }],
        outputConfig: { cloudWatchConfig: { logGroupName: "/custom/results" } },
      };
      const { client, commands, sendOptions } = setup({ online: metadata, batch: metadata });

      await expect(
        client.resolveLogSource({ resource, id: ID }, OPTIONS, controller.signal),
      ).resolves.toEqual({ logGroupName: "/custom/results" });
      expect(sendOptions).toEqual([{ abortSignal: controller.signal }]);
      expect(commands[0]?.input).toEqual(
        resource.startsWith("online")
          ? { onlineEvaluationConfigId: ID }
          : { batchEvaluationId: ID },
      );
    });

    test("omits SDK cancellation options when no signal is supplied", async () => {
      const metadata = {
        insights: [{ insightId: "Builtin.Insight.FailureAnalysis" }],
        outputConfig: { cloudWatchConfig: { logGroupName: "/custom/results" } },
      };
      const { client, sendOptions } = setup({ online: metadata, batch: metadata });

      await client.resolveLogSource({ resource, id: ID }, OPTIONS);

      expect(sendOptions).toEqual([undefined]);
    });

    test("cancels an in-flight metadata lookup", async () => {
      const controller = new AbortController();
      const reason = new DOMException("Cancelled lookup", "AbortError");
      const { client } = setup({
        beforeResponse: (_command, options) => waitForAbort(options?.abortSignal),
      });
      const pending = client.resolveLogSource({ resource, id: ID }, OPTIONS, controller.signal);

      controller.abort(reason);

      await expect(pending).rejects.toBe(reason);
    });
  });

  test.each(["batch-evaluation", "batch-insights"] as const)(
    "cancels %s during the nested online config source lookup",
    async (resource) => {
      const controller = new AbortController();
      const reason = new DOMException("Cancelled source lookup", "AbortError");
      let sourceLookupStarted = () => {};
      const started = new Promise<void>((resolve) => {
        sourceLookupStarted = resolve;
      });
      const { client, sendOptions } = setup({
        batch: {
          insights: [{ insightId: "Builtin.Insight.FailureAnalysis" }],
          outputConfig: SOURCE_OUTPUT,
          dataSourceConfig: {
            onlineEvaluationConfigSource: { onlineEvaluationConfigArn: ONLINE_CONFIG_ARN },
          },
        },
        beforeResponse: async (command, options) => {
          if (command instanceof GetOnlineEvaluationConfigCommand) {
            sourceLookupStarted();
            await waitForAbort(options?.abortSignal);
          }
        },
      });
      const pending = client.resolveLogSource({ resource, id: ID }, OPTIONS, controller.signal);
      await started;

      controller.abort(reason);

      await expect(pending).rejects.toBe(reason);
      expect(sendOptions).toEqual([
        { abortSignal: controller.signal },
        { abortSignal: controller.signal },
      ]);
    },
  );
});
