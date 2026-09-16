import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupProject, expectOk, parseJson, uniqueName } from "../helpers/project";
import { retry } from "../helpers/retry";
import { CliRunner, compiledCliPath } from "../helpers/run";

const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 15 * 60 * 1000;

const MEMORIES = [
  { name: "agent_python_minimal", template: "agent-python-minimal", recalls: false },
  { name: "strands", template: "agent-python-strands", recalls: true },
];

describe("e2e: project runtime memory configurations", () => {
  const cli = new CliRunner(compiledCliPath());
  const projectName = uniqueName("e2emem");
  let projectRoot: string | undefined;
  let projectDir: string | undefined;

  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "agentcore-e2e-"));
    const created = expectOk(
      await cli.run(
        [
          "project",
          "create",
          "--name",
          projectName,
          "--template",
          "agent-python-minimal",
          "--skip-git",
          "--json",
        ],
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

    expectOk(
      await cli.run(
        [
          "project",
          "add",
          "runtime",
          "--name",
          "strands",
          "--template",
          "agent-python-strands",
          "--json",
        ],
        projectDir,
      ),
    );
    const deployment = parseJson<{ message: string; outputs: Record<string, string> }>(
      expectOk(await cli.run(["project", "deploy", "--yes", "--json"], projectDir)),
    );
    expect(deployment.message).toContain("Deployed project");
    expect(typeof deployment.outputs).toBe("object");
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    try {
      await cleanupProject(cli, projectDir);
    } finally {
      if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
    }
  }, DEPLOY_TIMEOUT_MS);

  test.each(MEMORIES)(
    "%s",
    async ({ name, recalls }) => {
      const sessionId = `e2ememory${name}${Date.now().toString(36)}`.padEnd(40, "x").slice(0, 60);
      const remembered = parseJson<{ body: string; bodyEncoding: string; complete: boolean }>(
        await retry(async () =>
          expectOk(
            await cli.run(
              [
                "project",
                "invoke",
                "runtime",
                "--name",
                name,
                "--session-id",
                sessionId,
                "--payload",
                JSON.stringify({ prompt: "Remember that my favorite color is teal." }),
                "--json",
              ],
              projectDir,
            ),
          ),
        ),
      );
      expect(typeof remembered.body).toBe("string");
      expect(typeof remembered.bodyEncoding).toBe("string");
      expect(remembered.complete).toBe(true);
      if (recalls) {
        const recalled = parseJson<{ body: string; bodyEncoding: string; complete: boolean }>(
          await retry(async () =>
            expectOk(
              await cli.run(
                [
                  "project",
                  "invoke",
                  "runtime",
                  "--name",
                  name,
                  "--session-id",
                  sessionId,
                  "--payload",
                  JSON.stringify({ prompt: "What is my favorite color? Answer with one word." }),
                  "--json",
                ],
                projectDir,
              ),
            ),
          ),
        );
        expect(typeof recalled.body).toBe("string");
        expect(typeof recalled.bodyEncoding).toBe("string");
        expect(recalled.complete).toBe(true);
        expect(recalled.body.toLowerCase()).toContain("teal");
      }
    },
    2 * INVOKE_TIMEOUT_MS,
  );
});
