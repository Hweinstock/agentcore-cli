import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { expectOk, Project, uniqueName } from "../helpers/project";
import { retry } from "../helpers/retry";
import type { RunResult } from "../helpers/run";

const PROMPT = JSON.stringify({ prompt: "Reply with a short greeting." });
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 15 * 60 * 1000;

// The first runtime is created by `project create`, which names it after the
// template (agent_python_minimal). The rest are added with short names: memory
// resources embed `<project>_<runtime>` in strategy names capped at 48 chars,
// and a name must not equal a template dependency (e.g. mcp, langchain) or uv
// treats the project as depending on itself.
const RUNTIMES: [name: string, template: string, check: "invoke" | "deployed"][] = [
  ["agent_python_minimal", "agent-python-minimal", "invoke"],
  ["strandsa", "agent-python-strands", "invoke"],
  ["strandsc", "agent-python-strands-container", "invoke"],
  ["lcagent", "agent-python-langchain", "invoke"],
  ["tsstrands", "agent-typescript-strands", "deployed"],
  ["vercel", "agent-typescript-vercel", "deployed"],
  ["mcpfast", "mcp-python-fastmcp", "deployed"],
  ["a2aagent", "a2a-python-strands", "deployed"],
  ["aguiagent", "agui-python-strands", "deployed"],
];

describe("e2e: project runtime configurations", () => {
  let project: Project;
  let deployment: RunResult;

  beforeAll(async () => {
    const [, template] = RUNTIMES[0]!;
    project = await Project.create(uniqueName("e2ert"), ["--template", template]);
    for (const [name, tmpl] of RUNTIMES.slice(1)) {
      expectOk(
        await project.run(["project", "add", "runtime", "--name", name, "--template", tmpl]),
      );
    }
    deployment = expectOk(await project.run(["project", "deploy", "--yes", "--json"]));
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await project?.teardown();
  }, DEPLOY_TIMEOUT_MS);

  test.each(RUNTIMES)(
    "%s",
    async (name, _template, check) => {
      if (check === "invoke") {
        const result = await retry(() =>
          project
            .run(["project", "invoke", "runtime", "--name", name, "--payload", PROMPT, "--json"])
            .then(expectOk),
        );
        expect(result.stdout.length).toBeGreaterThan(0);
      } else {
        expect(deployment.stdout.toLowerCase()).toContain(name.toLowerCase());
      }
    },
    INVOKE_TIMEOUT_MS,
  );
});
