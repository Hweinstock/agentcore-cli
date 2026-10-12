import { afterAll, describe, expect, test } from "vitest";
import {
  CloudFormationClient,
  DeleteStackCommand,
  waitUntilStackDeleteComplete,
} from "@aws-sdk/client-cloudformation";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import z from "zod";
import { runProcess } from "../../src/io";
import { E2E_PREFIX, TAGS } from "../constants";
import { CliRunner, parseResult } from "../helpers/run";
import { retry } from "../helpers/retry";
import { TIMEOUT_MS } from "../timeouts";

const V0_VERSION = "0.31.1";
const TARGET_NAME = "dev-us-east";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const MCP_PAYLOAD = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "agentcore-e2e", version: "1" },
  },
};
const McpResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.literal(1),
  result: z.object({ protocolVersion: z.string() }),
});

/** Checks either JSON or the JSON message in a streaming MCP response. */
function expectMcpResponse(body: string): void {
  const data = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  expect(McpResponseSchema.parse(JSON.parse(data ?? body)).result.protocolVersion).toBeTruthy();
}

/** Captures authored project files, excluding dependency, build, and deployment state. */
async function projectFiles(root: string): Promise<Map<string, Buffer>> {
  const generatedDirectories = new Set([
    "node_modules",
    ".venv",
    "__pycache__",
    ".git",
    "cdk.out",
    ".cli",
  ]);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    const name = relative(root, path);
    if (!entry.isFile() || name.split(/[\\/]/).some((part) => generatedDirectories.has(part))) {
      continue;
    }
    files.set(name, await readFile(path));
  }
  return files;
}

describe("v0 project compatibility", { tags: [TAGS.COMPATIBILITY, TAGS.RUNTIME] }, () => {
  const cli = new CliRunner();
  const projectName = `${E2E_PREFIX}v0${Date.now().toString(36)}`;
  let root: string | undefined;
  let dev: ReturnType<CliRunner["start"]> | undefined;
  let attemptedDeploy = false;

  async function stopDev(): Promise<void> {
    const child = dev;
    dev = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const stopped = new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      killTimer.unref();
      child.once("close", () => {
        clearTimeout(killTimer);
        resolve();
      });
    });
    if (process.platform === "win32" && child.pid) {
      await runProcess(["taskkill", "/PID", String(child.pid), "/T", "/F"], {
        cwd: root ?? tmpdir(),
      });
    } else {
      child.kill("SIGTERM");
    }
    await stopped;
  }

  afterAll(async () => {
    try {
      await stopDev();
      if (attemptedDeploy) {
        const cfn = new CloudFormationClient({
          region: REGION,
        });
        const StackName = `AgentCore-${projectName}-${TARGET_NAME}`;
        try {
          await cfn.send(new DeleteStackCommand({ StackName }));
          await waitUntilStackDeleteComplete(
            { client: cfn, maxWaitTime: TIMEOUT_MS.PROJECT_DEPLOY / 1000 },
            { StackName },
          );
        } catch (error) {
          if (!(error instanceof Error && /does not exist/.test(error.message))) throw error;
        }
      }
    } finally {
      if (root) await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
    }
  }, TIMEOUT_MS.PROJECT_DEPLOY);

  test(
    "builds, runs, deploys, and invokes a v0-created project without rewriting its files",
    {
      timeout:
        TIMEOUT_MS.PROJECT_CREATE * 2 + TIMEOUT_MS.PROJECT_DEPLOY + TIMEOUT_MS.PROJECT_INVOKE * 2,
    },
    async () => {
      root = await mkdtemp(join(tmpdir(), "agentcore-e2e-v0-"));
      const prefix = join(root, "v0-cli");
      await runProcess(
        ["npm", "install", "-g", "--prefix", prefix, `@aws/agentcore@${V0_VERSION}`],
        {
          cwd: root,
        },
      );
      const packageDirectory = join(
        prefix,
        ...(process.platform === "win32" ? [] : ["lib"]),
        "node_modules",
        "@aws",
        "agentcore",
      );
      const installed = z
        .object({ version: z.literal(V0_VERSION), bin: z.object({ agentcore: z.string() }) })
        .parse(JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8")));
      const v0 = new CliRunner(["node", join(packageDirectory, installed.bin.agentcore)]);
      const created = parseResult(
        z.object({ projectPath: z.string() }),
        await v0.run(
          [
            "create",
            "--name",
            projectName,
            "--language",
            "Python",
            "--protocol",
            "MCP",
            "--build",
            "CodeZip",
            "--memory",
            "none",
            "--skip-git",
            "--json",
          ],
          root,
        ),
      );
      const projectDir = created.projectPath;
      const identity = await new STSClient({ region: REGION }).send(
        new GetCallerIdentityCommand({}),
      );
      const account = z
        .string()
        .regex(/^\d{12}$/)
        .parse(identity.Account);
      await writeFile(
        join(projectDir, "agentcore", "aws-targets.json"),
        JSON.stringify([{ name: TARGET_NAME, account, region: REGION }]),
      );
      const originalFiles = await projectFiles(projectDir);
      expect(
        JSON.parse(await readFile(join(projectDir, "agentcore", "agentcore.json"), "utf8")).version,
      ).toBe(1);

      let devOutput = "";
      dev = cli.start(["dev", "--mode", "headless", "--no-traces"], projectDir);
      dev.stdout.on("data", (chunk: Buffer) => (devOutput += chunk.toString()));
      dev.stderr.on("data", (chunk: Buffer) => (devOutput += chunk.toString()));
      await retry(async () => {
        if (dev?.exitCode !== null) throw new Error(`dev exited\n${devOutput}`);
        const match = devOutput.match(/Agent '[^']+' is running on port (\d+)\./);
        if (!match?.[1]) throw new Error(`runtime not ready\n${devOutput}`);
        const output: string[] = [];
        await runProcess(
          [
            "curl",
            "--fail-with-body",
            "--silent",
            "--show-error",
            "--max-time",
            "10",
            `http://127.0.0.1:${match[1]}/mcp`,
            "-H",
            "Content-Type: application/json",
            "-H",
            "Accept: application/json, text/event-stream",
            "--data",
            JSON.stringify(MCP_PAYLOAD),
          ],
          { cwd: projectDir, onOutput: (chunk) => output.push(chunk) },
        );
        expectMcpResponse(output.join(""));
      }, TIMEOUT_MS.PROJECT_DEV);
      await stopDev();

      attemptedDeploy = true;
      const deployed = parseResult(
        z.object({ message: z.string() }),
        await cli.run(["deploy", "--target", TARGET_NAME, "--yes", "--json"], projectDir),
      );
      expect(deployed.message).toContain("Deployed project");
      const built = parseResult(
        z.object({ message: z.string() }),
        await cli.run(["build", "--json"], projectDir),
      );
      expect(built.message).toContain("Built project");
      const status = parseResult(
        z.object({
          projectName: z.string(),
          resources: z.array(z.object({ name: z.string(), deploymentState: z.string() })),
        }),
        await cli.run(["status", "--target", TARGET_NAME, "--json"], projectDir),
      );
      expect(status.projectName).toBe(projectName);
      expect(status.resources).toContainEqual({
        name: projectName,
        deploymentState: "deployed",
      });
      await retry(async () => {
        const invoked = parseResult(
          z.object({ body: z.string(), complete: z.literal(true) }),
          await cli.run(
            [
              "invoke",
              "--runtime",
              projectName,
              "--target",
              TARGET_NAME,
              "--payload",
              JSON.stringify(MCP_PAYLOAD),
              "--accept",
              "application/json, text/event-stream",
              "--mcp-protocol-version",
              "2025-03-26",
              "--mcp-method",
              "initialize",
              "--json",
            ],
            projectDir,
          ),
        );
        expectMcpResponse(invoked.body);
      }, TIMEOUT_MS.PROJECT_INVOKE);

      const removed = await cli.run(["remove", "all", "--yes", "--json"], projectDir);
      expect(removed.exitCode).not.toBe(0);
      expect(removed.stdout + removed.stderr).toContain("read-only");
      for (const [file, contents] of originalFiles) {
        expect(await readFile(join(projectDir, file)), `${file} must not change`).toEqual(contents);
      }
    },
  );
});
