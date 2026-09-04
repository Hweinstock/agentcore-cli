import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { expectOk, Project, uniqueName } from "../helpers/project";
import { retry } from "../helpers/retry";

const REMEMBER = JSON.stringify({ prompt: "Remember that my favorite color is teal." });
const RECALL = JSON.stringify({ prompt: "What is my favorite color? Answer with one word." });
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 15 * 60 * 1000;

const MEMORIES: [name: string, template: string, recalls: boolean][] = [
  ["agent_python_minimal", "agent-python-minimal", false],
  ["agent_python_strands", "agent-python-strands", true],
];

const session = (name: string): string =>
  `e2ememory${name}${Date.now().toString(36)}`.padEnd(40, "x").slice(0, 60);

describe("e2e: project runtime memory configurations", () => {
  let project: Project;

  beforeAll(async () => {
    const [, template] = MEMORIES[0]!;
    project = await Project.create(uniqueName("e2emem"), ["--template", template]);
    for (const [name, tmpl] of MEMORIES.slice(1)) {
      expectOk(
        await project.run(["project", "add", "runtime", "--name", name, "--template", tmpl]),
      );
    }
    expectOk(await project.run(["project", "deploy", "--yes", "--json"]));
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await project?.teardown();
  }, DEPLOY_TIMEOUT_MS);

  test.each(MEMORIES)(
    "%s",
    async (name, _template, recalls) => {
      const sessionId = session(name);
      const remembered = await retry(() =>
        project
          .run([
            "project",
            "invoke",
            "runtime",
            "--name",
            name,
            "--session-id",
            sessionId,
            "--payload",
            REMEMBER,
            "--json",
          ])
          .then(expectOk),
      );
      expect(remembered.stdout.length).toBeGreaterThan(0);
      if (recalls) {
        const recalled = await retry(() =>
          project
            .run([
              "project",
              "invoke",
              "runtime",
              "--name",
              name,
              "--session-id",
              sessionId,
              "--payload",
              RECALL,
              "--json",
            ])
            .then(expectOk),
        );
        expect(recalled.stdout.toLowerCase()).toContain("teal");
      }
    },
    2 * INVOKE_TIMEOUT_MS,
  );
});
