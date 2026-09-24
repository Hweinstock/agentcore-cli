import type { InvokeAgentRuntimeCommandRequest } from "@aws-sdk/client-bedrock-agentcore";
import type { CoreOptions } from "../../core/types";
import type { Core } from "../types";
import { applyExecEvent, finishExec, newExecItem } from "../harness/invoke/transcript";

export type ExecInput = {
  resourceArn: string;
  command: string;
  runtimeSessionId?: string;
  qualifier: string;
  timeout?: number;
};

export type ExecResult = {
  sessionId?: string;
  command: string;
  exitCode?: number;
  status: "running" | "success" | "error";
  output: string;
};

export async function invokeExecCommand({
  core,
  input,
  options,
  signal,
}: {
  core: Core;
  input: ExecInput;
  options: CoreOptions;
  signal?: AbortSignal;
}): Promise<ExecResult> {
  const request: InvokeAgentRuntimeCommandRequest = {
    agentRuntimeArn: input.resourceArn,
    qualifier: input.qualifier,
    runtimeSessionId: input.runtimeSessionId,
    body: { command: input.command, timeout: input.timeout },
  };
  const response = await core.harness.invokeAgentRuntimeCommand(request, options, signal);
  const item = newExecItem(input.command);
  for await (const event of response.stream ?? []) applyExecEvent(item, event);
  finishExec(item);
  return {
    sessionId: input.runtimeSessionId ?? response.runtimeSessionId,
    command: item.command,
    exitCode: item.exitCode,
    status: item.status,
    output: item.output,
  };
}
