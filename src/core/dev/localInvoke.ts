import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  RuntimeClientError,
  type InvokeHarnessRequest,
  type InvokeHarnessResponse,
  type InvokeHarnessStreamOutput,
} from "@aws-sdk/client-bedrock-agentcore";
import {
  InputValidationError,
  InvalidEnvironmentError,
  RuntimeInvokeResponseError,
} from "../../errors";
import { readTextFile, readYamlFile } from "../../io";
import type { ProtocolMode } from "../../projectSchemas/constants";
import { abortable } from "../abortable";
import type { RuntimeInvokeResponse } from "../invokeRuntime";
import { sseData } from "./inspector/respond";

/** The harness.yaml fields an InvokeHarness request can override. */
const HARNESS_INVOKE_FIELDS = [
  "model",
  "systemPrompt",
  "tools",
  "skills",
  "allowedTools",
  "maxIterations",
  "maxTokens",
  "timeoutSeconds",
] as const;

export type LocalRuntimeInvokeRequest = {
  port: number;
  /** The `agentcore dev` flag that selects this server, for the hint when it is unreachable. */
  devSelector?: "--agent" | "--harness";
  protocol: ProtocolMode;
  payload: Uint8Array;
  contentType?: string;
  accept?: string;
  runtimeSessionId?: string;
  runtimeUserId?: string;
  applicationHeaders?: [string, string][];
  mcpSessionId?: string;
  mcpProtocolVersion?: string;
  mcpMethod?: string;
  mcpName?: string;
  traceId?: string;
  traceParent?: string;
  traceState?: string;
  baggage?: string;
};

async function* emptyBody(): AsyncGenerator<Uint8Array> {}

function invocationPath(protocol: ProtocolMode): string {
  if (protocol === "MCP") return "/mcp";
  if (protocol === "A2A") return "/";
  return "/invocations";
}

export async function invokeLocalRuntime(
  request: LocalRuntimeInvokeRequest,
  signal?: AbortSignal,
): Promise<RuntimeInvokeResponse> {
  const runtimeSessionId = request.runtimeSessionId ?? randomUUID();
  let headers: Headers;
  try {
    headers = new Headers(request.applicationHeaders);
    for (const [name, value] of [
      ["Content-Type", request.contentType ?? "application/json"],
      [
        "Accept",
        request.accept ??
          (request.protocol === "MCP"
            ? "application/json, text/event-stream"
            : "text/event-stream"),
      ],
      ["Mcp-Session-Id", request.mcpSessionId],
      ["Mcp-Protocol-Version", request.mcpProtocolVersion],
      ["Mcp-Method", request.mcpMethod],
      ["Mcp-Name", request.mcpName],
      ["X-Amzn-Bedrock-AgentCore-Runtime-Session-Id", runtimeSessionId],
      ["X-Amzn-Bedrock-AgentCore-Runtime-User-Id", request.runtimeUserId ?? "default"],
      ["X-Amzn-Trace-Id", request.traceId],
      ["traceparent", request.traceParent],
      ["tracestate", request.traceState],
      ["baggage", request.baggage],
    ] as const) {
      if (value !== undefined) headers.set(name, value);
    }
  } catch {
    throw new InputValidationError("Invalid local Runtime request header");
  }

  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${request.port}${invocationPath(request.protocol)}`, {
      method: "POST",
      redirect: "manual",
      headers,
      body: request.payload as RequestInit["body"],
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new InvalidEnvironmentError(
      `Could not reach local dev server on port ${request.port} (${detail}). Start it with: ` +
        `agentcore dev --mode headless ${request.devSelector ?? "--agent"} <name> --port ${request.port}`,
      { cause: error },
    );
  }

  const body = (response.body as AsyncIterable<Uint8Array> | null) ?? emptyBody();
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") ?? "",
    runtimeSessionId:
      response.headers.get("x-amzn-bedrock-agentcore-runtime-session-id") ?? runtimeSessionId,
    mcpSessionId: response.headers.get("mcp-session-id") ?? undefined,
    mcpProtocolVersion: response.headers.get("mcp-protocol-version") ?? undefined,
    traceId: response.headers.get("x-amzn-trace-id") ?? undefined,
    traceParent: response.headers.get("traceparent") ?? undefined,
    traceState: response.headers.get("tracestate") ?? undefined,
    baggage: response.headers.get("baggage") ?? undefined,
    body: signal ? abortable(body, signal) : body,
  };
}

/**
 * Invoke a local harness container. Its harness.yaml (and system-prompt.md) configure the turn as
 * they would the deployed harness, and fields set on `request` override them as in InvokeHarness.
 */
export async function invokeLocalHarness(
  port: number,
  harnessDirectory: string,
  {
    harnessArn: _harnessArn,
    qualifier: _qualifier,
    runtimeSessionId,
    ...request
  }: InvokeHarnessRequest,
  signal?: AbortSignal,
): Promise<InvokeHarnessResponse> {
  const config = (await readYamlFile(join(harnessDirectory, "harness.yaml"))) as Record<
    string,
    unknown
  > & { memory?: { agentCoreMemoryConfiguration?: { arn?: string } } };
  const promptPath = join(harnessDirectory, "system-prompt.md");
  const memory = config.memory?.agentCoreMemoryConfiguration;
  const body = {
    operation: "invoke",
    truncation: config.truncation,
    memoryConfig: memory?.arn ? { agentCoreMemoryConfiguration: memory } : undefined,
    invokePayload: {
      ...(existsSync(promptPath) && { systemPrompt: [{ text: await readTextFile(promptPath) }] }),
      ...definedFields(Object.fromEntries(HARNESS_INVOKE_FIELDS.map((key) => [key, config[key]]))),
      ...definedFields(request),
    },
  };
  const response = await invokeLocalRuntime(
    {
      port,
      protocol: "HTTP",
      devSelector: "--harness",
      payload: new TextEncoder().encode(JSON.stringify(body)),
      runtimeSessionId,
    },
    signal,
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) chunks.push(chunk);
    const detail = Buffer.concat(chunks).toString();
    throw new RuntimeInvokeResponseError(`HTTP ${response.statusCode}: ${detail}`);
  }
  return { stream: harnessEvents(response.body) };
}

function definedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/** The container streams `{ event }` frames, or `{ error }` when it rejects the request. */
async function* harnessEvents(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<InvokeHarnessStreamOutput> {
  for await (const data of sseData(body)) {
    const frame = JSON.parse(data) as { event?: InvokeHarnessStreamOutput; error?: string };
    yield frame.event ?? {
      runtimeClientError: new RuntimeClientError({ message: frame.error ?? data, $metadata: {} }),
    };
  }
}
