import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliRunner, type RunResult } from "../helpers/run";

const DEV_TIMEOUT_MS = 15 * 60 * 1000;
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const LOCAL_STARTUP_WAIT_MS = 15_000;

type RuntimeCase = {
  name: string;
  template: string;
  protocol: "HTTP" | "MCP" | "A2A" | "AGUI";
  port: number;
  payload: Record<string, unknown>;
  path: string;
  memory?: string;
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
    memory: "strandsMemory",
  },
  {
    name: "strandsc",
    template: "agent-python-strands-container",
    protocol: "HTTP",
    port: 18082,
    payload: { prompt: "Reply with a short greeting." },
    path: "/invocations",
    memory: "strandscMemory",
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
    memory: "tsstrandsMemory",
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
    memory: "a2aagentMemory",
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
    path: "/invocations",
    memory: "aguiagentMemory",
    payload: {
      threadId: "agentcore-e2e",
      runId: "agentcore-e2e",
      state: {},
      messages: [{ id: "agentcore-e2e", role: "user", content: "Reply with a short greeting." }],
      tools: [],
      context: [],
      forwardedProps: {},
    },
  },
];

function json<T>(result: RunResult): T {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout) as T;
}

function assertProtocolResponse(runtime: RuntimeCase, body: string): void {
  const data = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  const response = JSON.parse(data ?? body) as {
    jsonrpc: string;
    id: unknown;
    result: unknown;
    error?: unknown;
  };

  expect(response.jsonrpc).toBe("2.0");
  expect(response.id).toBe(runtime.payload.id);
  expect(response.error).toBeUndefined();
  expect(response.result).toBeDefined();
  expect(typeof response.result).toBe("object");
  if (runtime.protocol === "MCP") {
    expect(typeof (response.result as { protocolVersion?: unknown }).protocolVersion).toBe(
      "string",
    );
  }
  if (runtime.protocol === "A2A") {
    expect((response.result as { kind?: unknown }).kind).toBe("task");
  }
}

describe.serial("e2e: project runtime configurations", () => {
  const cli = new CliRunner();
  const projectName = `e2ert${Date.now().toString(36)}`;
  let projectDir: string;

  beforeAll(async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "agentcore-e2e-"));
    const created = json<{ project: { path: string } }>(
      await cli.run(
        ["project", "create", "--name", projectName, "--template", "empty", "--skip-git", "--json"],
        projectRoot,
      ),
    );
    projectDir = created.project.path;
  }, DEV_TIMEOUT_MS);

  test.serial.each(RUNTIMES)(
    "$name adds its runtime",
    async (runtime) => {
      const added = json<{ operation: string }>(
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
      expect(added.operation).toBe("add");
    },
    DEV_TIMEOUT_MS,
  );

  test.serial.each(RUNTIMES)(
    "$name runs locally",
    async (runtime) => {
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
      dev.stdout?.resume();
      dev.stderr?.resume();

      try {
        await Bun.sleep(LOCAL_STARTUP_WAIT_MS);
        const sessionId = `e2elocal${runtime.name}${Date.now().toString(36)}`
          .replace(/[^a-z0-9]/gi, "")
          .padEnd(40, "x")
          .slice(0, 60);

        if (runtime.protocol === "HTTP" || runtime.protocol === "AGUI") {
          const response = json<{ body: string; bodyEncoding: string; complete: boolean }>(
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
          expect(typeof response.body).toBe("string");
          expect(typeof response.bodyEncoding).toBe("string");
          expect(response.complete).toBe(true);
        } else {
          const response = await fetch(`http://127.0.0.1:${runtime.port}${runtime.path}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-amzn-bedrock-agentcore-runtime-session-id": sessionId,
              ...runtime.headers,
            },
            body: JSON.stringify(runtime.payload),
          });
          expect(response.ok).toBe(true);
          assertProtocolResponse(runtime, await response.text());
        }
      } finally {
        if (dev.exitCode === null) {
          dev.kill("SIGTERM");
          await new Promise<void>((resolve) => dev.once("close", resolve));
        }
      }
    },
    DEV_TIMEOUT_MS,
  );

  test.serial(
    "deploys all runtimes",
    async () => {
      const deployment = json<{ message: string }>(
        await cli.run(["project", "deploy", "--yes", "--json"], projectDir),
      );
      expect(deployment.message).toContain("Deployed project");
    },
    DEPLOY_TIMEOUT_MS,
  );

  test.serial.each(RUNTIMES)(
    "$name invokes remotely",
    async (runtime) => {
      const sessionId = `e2eremote${runtime.name}${Date.now().toString(36)}`
        .replace(/[^a-z0-9]/gi, "")
        .padEnd(40, "x")
        .slice(0, 60);
      const response = json<{ body: string; bodyEncoding: string; complete: boolean }>(
        await cli.run(
          [
            "project",
            "invoke",
            "runtime",
            "--name",
            runtime.name,
            "--session-id",
            sessionId,
            "--payload",
            JSON.stringify(runtime.payload),
            "--json",
            ...(runtime.cliFlags ?? []),
          ],
          projectDir,
        ),
      );

      expect(typeof response.body).toBe("string");
      expect(typeof response.bodyEncoding).toBe("string");
      expect(response.complete).toBe(true);
      if (runtime.protocol === "MCP" || runtime.protocol === "A2A") {
        assertProtocolResponse(runtime, response.body);
      }
    },
    DEV_TIMEOUT_MS,
  );

  test.serial.each(RUNTIMES)(
    "$name removes its runtime",
    async (runtime) => {
      const removed = json<{ operation: string }>(
        await cli.run(
          ["project", "remove", "runtime", "--name", runtime.name, "--json"],
          projectDir,
        ),
      );
      expect(removed.operation).toBe("remove");
      if (runtime.memory) {
        const memory = json<{ operation: string }>(
          await cli.run(
            ["project", "remove", "memory", "--name", runtime.memory, "--json"],
            projectDir,
          ),
        );
        expect(memory.operation).toBe("remove");
      }
    },
    DEV_TIMEOUT_MS,
  );

  test.serial(
    "deploys the empty project",
    async () => {
      json<Record<string, unknown>>(
        await cli.run(["project", "deploy", "--yes", "--json"], projectDir),
      );
    },
    DEPLOY_TIMEOUT_MS,
  );
});
