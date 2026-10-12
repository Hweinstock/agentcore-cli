import type { CoreEvalClient, EvalLogsInput } from "../handlers/eval/types";
import { InputValidationError, MalformedServiceResponseError } from "../errors";
import { serviceIdFromArn } from "./arn";
import type { LogSource } from "./observability/types";
import type { CoreOptions } from "./types";

type EvalLogClient = Pick<
  CoreEvalClient,
  "getOnlineEvaluationConfig" | "getOnlineInsight" | "getBatchEvaluation" | "getBatchInsights"
>;

export async function resolveEvalLogSource({
  client,
  input,
  options,
  signal,
}: {
  client: EvalLogClient;
  input: EvalLogsInput;
  options: CoreOptions;
  signal?: AbortSignal;
}): Promise<LogSource> {
  const config = await (async () => {
    switch (input.resource) {
      case "online-eval":
        return client.getOnlineEvaluationConfig(input.id, options, signal);
      case "online-insight":
        return client.getOnlineInsight(input.id, options, signal);
      case "batch-evaluation":
        return (
          await client.getBatchEvaluation(input.id, options, {
            includeResults: false,
            ...(signal ? { signal } : {}),
          })
        ).detail;
      case "batch-insights":
        return client.getBatchInsights(input.id, options, signal);
    }
  })();

  const cloudWatchConfig = config.outputConfig?.cloudWatchConfig;
  if (cloudWatchConfig?.logGroupName) {
    return { logGroupName: cloudWatchConfig.logGroupName };
  }
  if (config.outputConfig && !cloudWatchConfig) {
    throw new InputValidationError(
      `${input.resource} "${input.id}" has an unsupported output destination; ` +
        "logs require a CloudWatch output configuration.",
    );
  }
  if (cloudWatchConfig?.resultDestination !== "SOURCE_LOG_GROUP") {
    const isOnline = input.resource === "online-eval" || input.resource === "online-insight";
    const onlineConfigId =
      "onlineEvaluationConfigId" in config ? config.onlineEvaluationConfigId : undefined;
    return {
      logGroupName: isOnline
        ? `/aws/bedrock-agentcore/evaluations/results/${onlineConfigId ?? serviceIdFromArn(input.id)}`
        : "/aws/bedrock-agentcore/evaluations/batch-evaluations/results/default",
    };
  }

  let dataSourceConfig = config.dataSourceConfig;
  if (dataSourceConfig && "onlineEvaluationConfigSource" in dataSourceConfig) {
    const configArn = dataSourceConfig.onlineEvaluationConfigSource?.onlineEvaluationConfigArn;
    if (!configArn) {
      throw new MalformedServiceResponseError(
        `${input.resource} "${input.id}" returned an online evaluation source without a config ARN.`,
      );
    }
    dataSourceConfig = (
      await client.getOnlineEvaluationConfig(serviceIdFromArn(configArn), options, signal)
    ).dataSourceConfig;
  }

  const source = dataSourceConfig?.cloudWatchLogs;
  if (source?.logGroupNamePrefixes?.length) {
    throw new InputValidationError(
      `${input.resource} "${input.id}" writes results to source log groups selected by prefix. ` +
        "Read the matching groups directly in CloudWatch Logs, or configure one explicit source log group.",
    );
  }
  if ((source?.logGroupNames?.length ?? 0) > 1) {
    throw new InputValidationError(
      `${input.resource} "${input.id}" writes results to multiple source log groups. ` +
        "Read each group directly in CloudWatch Logs, or configure one explicit source log group.",
    );
  }
  const logGroupName = source?.logGroupNames?.[0];
  if (!logGroupName) {
    throw new MalformedServiceResponseError(
      `${input.resource} "${input.id}" writes results to a source log group but returned no log group name.`,
    );
  }
  return { logGroupName };
}
