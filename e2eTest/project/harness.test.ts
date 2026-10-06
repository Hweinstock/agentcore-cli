import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import z from "zod";
import { E2E_PREFIX, TAGS } from "../constants";
import { CliRunner, parseResult } from "../helpers/run";
import { retry } from "../helpers/retry";
import { TIMEOUT_MS } from "../timeouts";

type HarnessTestCase = {
  name: string;
  addFlags: string[];
  invokeFlags: string[];
  expectedText?: string;
};

const CUSTOM_PROMPT_RESPONSE = "HARNESS_PROMPT_VERIFIED";
const HARNESS_TEST_CASES: HarnessTestCase[] = [
  {
    name: "managed_memory",
    addFlags: [],
    invokeFlags: ["--prompt", "Reply with a short greeting."],
  },
  {
    name: "disabled_memory",
    addFlags: ["--memory", JSON.stringify({ mode: "disabled" })],
    invokeFlags: ["--prompt", "Reply with a short greeting."],
  },
  {
    name: "semantic_memory",
    addFlags: ["--memory", JSON.stringify({ mode: "managed", strategies: ["SEMANTIC"] })],
    invokeFlags: ["--prompt", "Reply with a short greeting."],
  },
  {
    name: "custom_prompt",
    addFlags: [
      "--system-prompt",
      `Reply with exactly ${CUSTOM_PROMPT_RESPONSE} and no other text.`,
    ],
    invokeFlags: ["--prompt", "Respond now."],
    expectedText: CUSTOM_PROMPT_RESPONSE,
  },
];

const ProjectCreatedSchema = z.object({
  project: z.object({ path: z.string() }),
});
const OperationSchema = z.object({ operation: z.string() });
const DeployResponseSchema = z.object({ message: z.string() });
const TranscriptItemSchema = z
  .object({
    kind: z.string(),
    text: z.string().optional(),
  })
  .passthrough();
const HarnessInvokeResponseSchema = z.object({
  sessionId: z.string().min(33).max(100),
  transcript: z.array(TranscriptItemSchema).min(2),
});

/** Given an invoke response, asserts the harness replied with text, and the expected text if any. */
function expectHarnessReply(
  response: z.infer<typeof HarnessInvokeResponseSchema>,
  harness: HarnessTestCase,
): void {
  const responseText = response.transcript
    .filter((item) => item.kind === "text")
    .flatMap((item) => item.text ?? [])
    .join("");

  expect(responseText.trim()).not.toBe("");
  if (harness.expectedText) expect(responseText).toContain(harness.expectedText);
}

const harnessTags = [TAGS.HARNESS, TAGS.CANARY];
describe("add, deploy, and invoke harnesses", { sequential: true, tags: harnessTags }, () => {
  const cli = new CliRunner();
  const projectName = `${E2E_PREFIX}${Date.now().toString(36)}`;
  let projectDir: string;

  beforeAll(async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "agentcore-e2e-"));
    const created = parseResult(
      ProjectCreatedSchema,
      await cli.run(
        ["create", "--name", projectName, "--template", "empty", "--skip-git", "--json"],
        projectRoot,
      ),
    );
    projectDir = created.project.path;
  }, TIMEOUT_MS.PROJECT_CREATE);

  test.each(HARNESS_TEST_CASES)(
    "$name can be added to a project",
    { timeout: TIMEOUT_MS.PROJECT_ADD },
    async (harness) => {
      const added = parseResult(
        OperationSchema,
        await cli.run(
          ["add", "harness", "--name", harness.name, "--json", ...harness.addFlags],
          projectDir,
        ),
      );
      expect(added.operation).toBe("add");
    },
  );

  describe("local invocation", { sequential: true }, () => {
    const harnessPorts = new Map<string, number>();
    let dev: ReturnType<CliRunner["start"]> | undefined;
    let pendingOutput = "";
    let devOutput = "";

    /** Given dev-process output, records the ports announced by running harnesses. */
    const captureDevOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      devOutput += text;
      pendingOutput += text;
      const lines = pendingOutput.split(/\r?\n/);
      pendingOutput = lines.pop() ?? "";
      for (const line of lines) {
        const match = line.match(/Agent '([^']+)' is running on port (\d+)\./);
        if (match?.[1] && match[2]) harnessPorts.set(match[1], Number(match[2]));
      }
    };

    beforeAll(() => {
      dev = cli.start(["dev", "--mode", "headless"], projectDir);
      dev.stdout?.on("data", captureDevOutput);
      dev.stderr?.on("data", captureDevOutput);
    }, TIMEOUT_MS.PROJECT_DEV);

    afterAll(async () => {
      if (!dev || dev.exitCode !== null) return;
      dev.kill("SIGTERM");
      await new Promise<void>((resolve) => dev?.once("close", resolve));
    });

    test.each(HARNESS_TEST_CASES)(
      "$name runs locally",
      { concurrent: true, timeout: TIMEOUT_MS.PROJECT_INVOKE },
      async (harness) => {
        // The container accepts connections before its server is ready, so retry until it answers.
        const response = await retry(async () => {
          if (dev?.exitCode !== null) {
            throw new Error(`agentcore dev is not running. \nstdout/stderr = ${devOutput}`);
          }
          const port = harnessPorts.get(harness.name);
          if (!port) {
            throw new Error(
              `Harness '${harness.name}' is not ready. \nstdout/stderr = ${devOutput}`,
            );
          }
          return parseResult(
            HarnessInvokeResponseSchema,
            await cli.run(
              [
                "invoke",
                "--harness",
                harness.name,
                "--local",
                "--port",
                String(port),
                "--json",
                ...harness.invokeFlags,
              ],
              projectDir,
            ),
          );
        }, TIMEOUT_MS.PROJECT_INVOKE * 0.9);

        expectHarnessReply(response, harness);
      },
    );
  });

  test("deploys all harnesses", { timeout: TIMEOUT_MS.PROJECT_DEPLOY }, async () => {
    const deployment = parseResult(
      DeployResponseSchema,
      await cli.run(["deploy", "--yes", "--json"], projectDir),
    );
    expect(deployment.message).toContain("Deployed project");
  });

  test.each(HARNESS_TEST_CASES)(
    "$name can be invoked after deployed",
    { concurrent: true, timeout: TIMEOUT_MS.PROJECT_INVOKE },
    async (harness) => {
      const response = parseResult(
        HarnessInvokeResponseSchema,
        await cli.run(
          ["invoke", "--harness", harness.name, "--json", ...harness.invokeFlags],
          projectDir,
        ),
      );
      expectHarnessReply(response, harness);
    },
  );

  test(
    "removes all harnesses and deploys the empty project",
    { timeout: TIMEOUT_MS.PROJECT_REMOVE + TIMEOUT_MS.PROJECT_DEPLOY },
    async () => {
      const removed = parseResult(
        OperationSchema,
        await cli.run(["remove", "all", "--yes", "--json"], projectDir),
      );
      expect(removed.operation).toBe("remove");

      const deployment = parseResult(
        DeployResponseSchema,
        await cli.run(["deploy", "--yes", "--json"], projectDir),
      );
      expect(deployment.message).toContain("Removed project");
    },
  );
});
