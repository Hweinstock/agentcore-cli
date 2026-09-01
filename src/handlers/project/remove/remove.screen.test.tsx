import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectSpecSchema, type ProjectSpec } from "../../../projectSchemas/project";
import { ProjectKey } from "../../../router";
import { resolveRuntimeTemplateShortcut } from "../shortcuts";
import type { AddResourceInput, Project } from "../types";
import {
  renderScreen,
  waitForText,
  waitFor,
  cleanupScreens,
  TestCoreClient,
} from "../../../testing";

// TestCoreClient carries a real FsProjectManager, so the project is scaffolded
// with the real create/add flow and removals are verified by reading
// agentcore.json back — no hand-authored specs, no mocks.

const originalCwd = process.cwd();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  cleanupScreens();
  process.chdir(originalCwd);
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })));
});

async function drain<T>(generator: AsyncGenerator<unknown, T>): Promise<T> {
  while (true) {
    const next = await generator.next();
    if (next.done) return next.value;
  }
}

// createProject scaffolds a real project (one runtime, "hello_world") in a temp
// directory. Pass resources to add through the real addResource flow.
async function createProject(
  core: TestCoreClient,
  resources: AddResourceInput[] = [],
): Promise<{ project: Project; specPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "agentcore-project-remove-"));
  temporaryDirectories.push(root);
  process.chdir(root);
  let project = await drain(
    core.projectManager.create({
      name: "orders",
      skipInstall: true,
      skipGit: true,
      scaffoldRuntimeInput: resolveRuntimeTemplateShortcut("hello-world-python"),
    }),
  );
  for (const resource of resources) {
    project = await drain(core.projectManager.addResource(project, resource));
  }
  return { project, specPath: join(project.rootPath, "agentcore", "agentcore.json") };
}

const POLICY: AddResourceInput[] = [
  { resourceType: "policy-engine", resourceConfig: { name: "guard" } },
  {
    resourceType: "policy",
    engineName: "guard",
    resourceConfig: { name: "denyAll", statement: "permit(principal, action, resource);" },
  },
];

function render(path: string, core: TestCoreClient, project: Project) {
  return renderScreen(path, { core, withContext: (ctx) => ctx.withValue(ProjectKey, project) });
}

async function readSpec(specPath: string): Promise<ProjectSpec> {
  return ProjectSpecSchema.parse(JSON.parse(await readFile(specPath, "utf8")));
}

describe("project remove screen", () => {
  test("lists the resource types the project holds plus an all option", async () => {
    const core = new TestCoreClient();
    const { project } = await createProject(core, POLICY);
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    const frame = r.lastFrame()!;
    expect(frame).toContain("runtime");
    expect(frame).toContain("policy-engine");
    expect(frame).toContain("policy");
    expect(frame).toContain("all");
    r.unmount();
  });

  test("the all row counts the sum of every resource", async () => {
    const core = new TestCoreClient();
    const { project } = await createProject(core, POLICY);
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "all");
    // 1 runtime + 1 policy-engine + 1 policy = 3
    expect(r.lastFrame()).toMatch(/all\s+3/);
    r.unmount();
  });

  test("selecting a type lists that type's resources", async () => {
    const core = new TestCoreClient();
    const { project } = await createProject(core);
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "runtime");
    await r.press("return");
    await waitForText(r.lastFrame, "choose a runtime to remove");
    expect(r.lastFrame()).toContain("hello_world");
    r.unmount();
  });

  test("esc on the resource list returns to the resource-type list", async () => {
    const core = new TestCoreClient();
    const { project } = await createProject(core);
    const r = render("/agentcore/project/remove/runtime", core, project);

    await waitForText(r.lastFrame, "choose a runtime to remove");
    await r.press("escape");
    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    r.unmount();
  });

  test("esc on the resource-type list returns to the project menu", async () => {
    const core = new TestCoreClient();
    const { project } = await createProject(core);
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    await r.press("escape");
    await waitForText(r.lastFrame, "agentcore → project");
    r.unmount();
  });

  test("confirming a removal deletes the resource from the spec", async () => {
    const core = new TestCoreClient();
    const { project, specPath } = await createProject(core);
    const r = render("/agentcore/project/remove/runtime/0", core, project);

    await waitForText(r.lastFrame, "Remove runtime 'hello_world' from project orders?");
    expect(r.lastFrame()).toContain("(y/N)");
    await r.write("y");
    await waitForText(r.lastFrame, "Resource removed");

    expect((await readSpec(specPath)).runtimes).toEqual([]);
    r.unmount();
  });

  test("enter after success returns to the project menu", async () => {
    const core = new TestCoreClient();
    const { project } = await createProject(core);
    const r = render("/agentcore/project/remove/runtime/0", core, project);

    await waitForText(r.lastFrame, "Remove runtime 'hello_world' from project orders?");
    await r.write("y");
    await waitForText(r.lastFrame, "Resource removed");
    await r.press("return");
    await waitForText(r.lastFrame, "agentcore → project");
    r.unmount();
  });

  test("declining leaves the resource in place", async () => {
    const core = new TestCoreClient();
    const { project, specPath } = await createProject(core);
    const r = render("/agentcore/project/remove/runtime/0", core, project);

    await waitForText(r.lastFrame, "Remove runtime 'hello_world' from project orders?");
    await r.write("n");
    await waitFor(() => !(r.lastFrame() ?? "").includes("Remove runtime 'hello_world'"));

    expect((await readSpec(specPath)).runtimes.map((runtime) => runtime.name)).toEqual([
      "hello_world",
    ]);
    r.unmount();
  });

  test("lists a nested resource with its parent and removes it", async () => {
    const core = new TestCoreClient();
    const { project, specPath } = await createProject(core, POLICY);
    const list = render("/agentcore/project/remove/policy", core, project);

    await waitForText(list.lastFrame, "choose a policy to remove");
    const frame = list.lastFrame()!;
    expect(frame).toContain("engine"); // parent column header
    expect(frame).toContain("guard"); // parent value
    expect(frame).toContain("denyAll"); // policy name
    list.unmount();

    const confirm = render("/agentcore/project/remove/policy/0", core, project);
    await waitForText(confirm.lastFrame, "Remove policy 'denyAll' from project orders?");
    expect(confirm.lastFrame()).toContain("guard"); // parent shown in the summary
    await confirm.write("y");
    await waitForText(confirm.lastFrame, "Resource removed");

    expect((await readSpec(specPath)).policyEngines[0]!.policies).toEqual([]);
    confirm.unmount();
  });

  test("removing all empties every resource collection", async () => {
    const core = new TestCoreClient();
    const { project, specPath } = await createProject(core, POLICY);
    const r = render("/agentcore/project/remove/all", core, project);

    await waitForText(r.lastFrame, "Remove every resource from project orders?");
    await r.write("y");
    await waitForText(r.lastFrame, "All resources removed");

    const spec = await readSpec(specPath);
    expect(spec.runtimes).toEqual([]);
    expect(spec.policyEngines).toEqual([]);
    r.unmount();
  });
});
