import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupProject, expectOk, parseJson, uniqueName } from "../helpers/project";
import { retry } from "../helpers/retry";
import { CliRunner, compiledCliPath } from "../helpers/run";

const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 15 * 60 * 1000;

type RuntimeCase = {
  name: string;
  template: string;
  protocol: "HTTP" | "MCP" | "A2A" | "AGUI";
  port: number;
  payload: Record<string, unknown>;
  path: string;
  headers?: Record<string, string>;
  cliFlags?: string[];
};

const RUNTIMES: RuntimeCase[] = [
  {
    name: "agent_python_minimal",
    template: "agent-python-minimal",
    protocol: "HTTP",
    port: 18080,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
  },
  {
    name: "strands",
    template: "agent-python-strands",
    protocol: "HTTP",
    port: 18081,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
  },
  {
    name: "strandsc",
    template: "agent-python-strands-container",
    protocol: "HTTP",
    port: 18082,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
  },
  {
    name: "lcagent",
    template: "agent-python-langchain",
    protocol: "HTTP",
    port: 18083,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
  },
  {
    name: "tsstrands",
    template: "agent-typescript-strands",
    protocol: "HTTP",
    port: 18084,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
  },
  {
    name: "vercel",
    template: "agent-typescript-vercel",
    protocol: "HTTP",
    port: 18085,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
  },
  {
    name: "mcpfast",
    template: "mcp-python-fastmcp",
    protocol: "MCP",
    port: 8000,
    path: "/mcp",
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "agentcore-e2e", version: "1" },
      },
    },
    headers: { accept: "application/json, text/event-stream" },
    cliFlags: [
      "--accept",
      "application/json, text/event-stream",
      "--mcp-protocol-version",
      "2025-03-26",
      "--mcp-method",
      "initialize",
    ],
  },
  {
    name: "a2aagent",
    template: "a2a-python-strands",
    protocol: "A2A",
    port: 9000,
    path: "/",
    payload: {
      jsonrpc: "2.0",
      id: "agentcore-e2e",
      method: "message/send",
      params: {
        message: {
          messageId: "agentcore-e2e",
          role: "user",
          parts: [{ kind: "text", text: "Reply with a short greeting." }],
        },
      },
    },
  },
  {
    name: "aguiagent",
    template: "agui-python-strands",
    protocol: "AGUI",
    port: 18088,
    payload: {
      threadId: "agentcore-e2e",
      runId: "agentcore-e2e",
      state: {},
      messages: [{ id: "agentcore-e2e", role: "user", content: "Reply with a short greeting." }],
      tools: [],
      context: [],
      forwardedProps: {},
    },
    path: "/invocations",
  },
];

function parseJsonRpcBody(body: string): {
  jsonrpc: string;
  id: unknown;
  result: unknown;
  error?: unknown;
} {
  const data = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  return JSON.parse(data ?? body) as {
    jsonrpc: string;
    id: unknown;
    result: unknown;
    error?: unknown;
  };
}

function assertProtocolResponse(runtime: RuntimeCase, body: string): void {
  const rpc = parseJsonRpcBody(body);
  expect(rpc.jsonrpc).toBe("2.0");
  expect(rpc.id).toBe(runtime.payload.id);
  expect(rpc.error).toBeUndefined();
  expect(rpc.result).toBeDefined();
  if (!rpc.result || typeof rpc.result !== "object") {
    throw new Error(`${runtime.protocol} response result was not an object`);
  }
  if (runtime.protocol === "MCP") {
    expect(typeof (rpc.result as { protocolVersion?: unknown }).protocolVersion).toBe("string");
  } else {
    expect((rpc.result as { kind?: unknown }).kind).toBe("task");
  }
}

describe("e2e: project runtime configurations", () => {
  const cli = new CliRunner(compiledCliPath());
  const projectName = uniqueName("e2ert");
  let projectRoot: string | undefined;
  let projectDir: string | undefined;

  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "agentcore-e2e-"));
    const created = expectOk(
      await cli.run(
        ["project", "create", "--name", projectName, "--template", "empty", "--skip-git", "--json"],
        projectRoot,
      ),
    );
    const createOutput = parseJson<{ operation: string; project: { name: string; path: string } }>(
      created,
    );
    projectDir = createOutput.project.path;
    expect(createOutput.operation).toBe("create");
    expect(createOutput.project.name).toBe(projectName);
    expect(typeof projectDir).toBe("string");

    for (const runtime of RUNTIMES) {
      expectOk(
        await cli.run(
          [
            "project",
            "add",
            "runtime",
            "--name",
            runtime.name,
            "--template",
            runtime.template,
            "--json",
          ],
          projectDir,
        ),
      );
    }

    const deployment = parseJson<{ message: string; outputs: Record<string, string> }>(
      expectOk(await cli.run(["project", "deploy", "--yes", "--json"], projectDir)),
    );
    expect(deployment.message).toContain("Deployed project");
    expect(typeof deployment.outputs).toBe("object");
    for (const runtime of RUNTIMES) {
      const outputNames = Object.keys(deployment.outputs)
        .join(" ")
        .toLowerCase()
        .replaceAll("_", "");
      expect(outputNames).toContain(runtime.name.toLowerCase().replaceAll("_", ""));
    }
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    try {
      await cleanupProject(cli, projectDir);
    } finally {
      if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
    }
  }, DEPLOY_TIMEOUT_MS);

  test.each(RUNTIMES)(
    "$name",
    async (runtime) => {
      const sessionId = `e2eruntimelocal${runtime.name}${Date.now().toString(36)}`
        .replace(/[^a-z0-9]/gi, "")
        .padEnd(40, "x")
        .slice(0, 60);
      const deployedSessionId = `e2eruntimedeployed${runtime.name}${Date.now().toString(36)}`
        .replace(/[^a-z0-9]/gi, "")
        .padEnd(40, "x")
        .slice(0, 60);
      const dev = cli.start(
        [
          "project",
          "dev",
          "--mode",
          "headless",
          "--agent",
          runtime.name,
          "--port",
          String(runtime.port),
        ],
        projectDir,
      );
      dev.stdout.resume();
      dev.stderr.resume();

      try {
        console.log(`[e2e] ${runtime.name}: local invoke`);
        const local = await retry(
          async () => {
            if (runtime.protocol === "HTTP" || runtime.protocol === "AGUI") {
              return expectOk(
                await cli.run(
                  [
                    "project",
                    "invoke",
                    "runtime",
                    "--local",
                    "--port",
                    String(runtime.port),
                    "--session-id",
                    sessionId,
                    "--payload",
                    JSON.stringify(runtime.payload),
                    "--json",
                  ],
                  projectDir,
                ),
              );
            }

            const response = await fetch(`http://127.0.0.1:${runtime.port}${runtime.path}`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-amzn-bedrock-agentcore-runtime-session-id": sessionId,
                ...runtime.headers,
              },
              body: JSON.stringify(runtime.payload),
            });
            const body = await response.text();
            if (!response.ok) {
              throw new Error(`local ${runtime.protocol} response ${response.status}: ${body}`);
            }
            return { status: response.status, body };
          },
          5,
          5_000,
        );
        if ("stdout" in local) {
          const response = parseJson<{
            body: string;
            bodyEncoding: string;
            complete: boolean;
          }>(local);
          expect(typeof response.body).toBe("string");
          expect(typeof response.bodyEncoding).toBe("string");
          expect(response.complete).toBe(true);
        } else {
          expect(local.status).toBeGreaterThanOrEqual(200);
          expect(local.status).toBeLessThan(300);
          assertProtocolResponse(runtime, local.body);
        }

        console.log(`[e2e] ${runtime.name}: deployed invoke`);
        const deployed = parseJson<{
          body: string;
          bodyEncoding: string;
          complete: boolean;
        }>(
          await retry(
            async () =>
              expectOk(
                await cli.run(
                  [
                    "project",
                    "invoke",
                    "runtime",
                    "--name",
                    runtime.name,
                    "--session-id",
                    deployedSessionId,
                    "--payload",
                    JSON.stringify(runtime.payload),
                    "--json",
                    ...(runtime.cliFlags ?? []),
                  ],
                  projectDir,
                ),
              ),
            3,
            15_000,
          ),
        );
        expect(typeof deployed.body).toBe("string");
        expect(typeof deployed.bodyEncoding).toBe("string");
        expect(deployed.complete).toBe(true);
        if (runtime.protocol === "MCP" || runtime.protocol === "A2A") {
          assertProtocolResponse(runtime, deployed.body);
        }
      } finally {
        if (dev.exitCode === null) {
          dev.kill("SIGTERM");
          await new Promise<void>((resolve) => dev.once("close", () => resolve()));
        }
      }
    },
    INVOKE_TIMEOUT_MS,
  );
});
