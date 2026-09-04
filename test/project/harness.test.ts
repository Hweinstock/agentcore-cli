import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { expectOk, Project, uniqueName } from "../helpers/project";
import { retry } from "../helpers/retry";

const PROMPT = "Reply with a short greeting.";
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 15 * 60 * 1000;

const projectName = uniqueName("e2ehn");

const ADDED: [name: string, flags: string[]][] = [
  ["added", []],
  ["tuned", ["--max-iterations", "5"]],
];

const HARNESSES = [projectName, ...ADDED.map(([name]) => name)];

describe("e2e: project harness configurations", () => {
  let project: Project;

  beforeAll(async () => {
    project = await Project.create(projectName, []);
    for (const [name, flags] of ADDED) {
      expectOk(await project.run(["project", "add", "harness", "--name", name, ...flags]));
    }
    expectOk(await project.run(["project", "deploy", "--yes", "--json"]));
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await project?.teardown();
  }, DEPLOY_TIMEOUT_MS);

  test.each(HARNESSES)(
    "%s",
    async (name) => {
      const result = await retry(() =>
        project
          .run(["project", "invoke", "harness", "--name", name, "--prompt", PROMPT, "--json"])
          .then(expectOk),
      );
      expect(result.stdout.length).toBeGreaterThan(0);
    },
    INVOKE_TIMEOUT_MS,
  );
});
