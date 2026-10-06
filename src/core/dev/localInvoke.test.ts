import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RuntimeInvokeResponseError } from "../../errors";
import { startHttpServer, type HttpServerHandle } from "../../io";
import { inTempDirectory } from "../../testing";
import { invokeLocalHarness } from "./localInvoke";

const cleanups: Array<() => Promise<void>> = [];
const servers: HttpServerHandle[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("invokeLocalHarness", () => {
  test("overrides harness.yaml defaults with fields set on the request", async () => {
    const { path, cleanup } = await inTempDirectory("agentcore-local-harness-");
    cleanups.push(cleanup);
    await writeFile(
      join(path, "harness.yaml"),
      [
        "model: { bedrockModelConfig: { modelId: yaml-model } }",
        "systemPrompt: [{ text: From yaml. }]",
        "maxIterations: 3",
        "memory: { agentCoreMemoryConfiguration: { arn: memory-arn } }",
      ].join("\n"),
    );
    let body: unknown;
    const server = await startHttpServer((request) => {
      body = JSON.parse(request.body.toString());
      return { status: 200, body: "" };
    });
    servers.push(server);

    await invokeLocalHarness(server.port, path, {
      harnessArn: undefined,
      runtimeSessionId: undefined,
      messages: [{ role: "user", content: [{ text: "hi" }] }],
      model: { bedrockModelConfig: { modelId: "request-model" } },
      maxTokens: undefined,
    });

    expect(body).toEqual({
      operation: "invoke",
      memoryConfig: { agentCoreMemoryConfiguration: { arn: "memory-arn" } },
      invokePayload: {
        model: { bedrockModelConfig: { modelId: "request-model" } },
        systemPrompt: [{ text: "From yaml." }],
        maxIterations: 3,
        messages: [{ role: "user", content: [{ text: "hi" }] }],
      },
    });
  });

  test("rejects an unsuccessful container response", async () => {
    const { path, cleanup } = await inTempDirectory("agentcore-local-harness-");
    cleanups.push(cleanup);
    await writeFile(join(path, "harness.yaml"), "name: support\n");
    const server = await startHttpServer(() => ({ status: 500, body: "boom" }));
    servers.push(server);

    const pending = invokeLocalHarness(server.port, path, {
      harnessArn: undefined,
      runtimeSessionId: undefined,
      messages: [],
    });
    await expect(pending).rejects.toBeInstanceOf(RuntimeInvokeResponseError);
    await expect(pending).rejects.toThrow("HTTP 500: boom");
  });
});
