import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupProject, expectOk, parseJson, uniqueName } from "../helpers/project";
import { retry } from "../helpers/retry";
import { CliRunner, compiledCliPath } from "../helpers/run";

const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 15 * 60 * 1000;

const ADDED: [name: string, flags: string[]][] = [
  ["added", []],
  ["tuned", ["--max-iterations", "5"]],
];

describe("e2e: project harness configurations", () => {
  const cli = new CliRunner(compiledCliPath());
  const projectName = uniqueName("e2ehn");
  const harnesses = [projectName, ...ADDED.map(([name]) => name)];
  let projectRoot: string | undefined;
  let projectDir: string | undefined;

  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "agentcore-e2e-"));
    const created = expectOk(
      await cli.run(
        ["project", "create", "--name", projectName, "--skip-git", "--json"],
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

    for (const [name, flags] of ADDED) {
      expectOk(
        await cli.run(
          ["project", "add", "harness", "--name", name, ...flags, "--json"],
          projectDir,
        ),
      );
    }
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

  test.each(harnesses)(
    "%s",
    async (name) => {
      const result = parseJson<{ sessionId: string; transcript: unknown[] }>(
        await retry(async () =>
          expectOk(
            await cli.run(
              [
                "project",
                "invoke",
                "harness",
                "--name",
                name,
                "--prompt",
                "Reply with a short greeting.",
                "--json",
              ],
              projectDir,
            ),
          ),
        ),
      );
      expect(typeof result.sessionId).toBe("string");
      expect(Array.isArray(result.transcript)).toBe(true);
      expect(result.transcript.length).toBeGreaterThan(1);
      const kinds = result.transcript.flatMap((item) =>
        item && typeof item === "object" && "kind" in item
          ? [String((item as { kind: unknown }).kind)]
          : [],
      );
      expect(kinds).toContain("text");
      expect(kinds).not.toContain("error");
    },
    INVOKE_TIMEOUT_MS,
  );
});
