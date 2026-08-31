import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectSpecSchema, type ProjectSpec } from "../../../projectSchemas/project";
import { ProjectKey } from "../../../router";
import type { Project } from "../types";
import {
  renderScreen,
  waitForText,
  waitFor,
  cleanupScreens,
  TestCoreClient,
} from "../../../testing";

// Behavior tests for the project-remove flow. TestCoreClient carries a real
// FsProjectManager, so removals are verified by reading agentcore.json back
// (no mocks). The project is pinned on the context exactly as the withProject
// middleware does in production.

const RUNTIME = {
  name: "checkout",
  build: "CodeZip",
  entrypoint: "main.py",
  codeLocation: "app/checkout",
  runtimeVersion: "PYTHON_3_14",
} as const;
const HARNESS = { name: "support", path: "app/support" } as const;
const POLICY_ENGINE = {
  name: "guard",
  policies: [{ name: "denyAll", statement: "permit(principal, action, resource);" }],
} as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  cleanupScreens();
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })));
});

async function setup(spec: Record<string, unknown>): Promise<{
  core: TestCoreClient;
  project: Project;
  specPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "agentcore-project-remove-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "agentcore"), { recursive: true });
  const specPath = join(root, "agentcore", "agentcore.json");
  await writeFile(
    specPath,
    JSON.stringify(ProjectSpecSchema.parse({ name: "orders", version: 1, ...spec })),
  );
  const core = new TestCoreClient();
  const project = await core.projectManager.resolve({ filePath: root });
  if (!project) throw new Error("failed to resolve the test project");
  return { core, project, specPath };
}

function render(path: string, core: TestCoreClient, project: Project) {
  return renderScreen(path, { core, withContext: (ctx) => ctx.withValue(ProjectKey, project) });
}

async function readSpec(specPath: string): Promise<ProjectSpec> {
  return ProjectSpecSchema.parse(JSON.parse(await readFile(specPath, "utf8")));
}

describe("project remove screen", () => {
  test("lists the resource types the project holds plus an all option", async () => {
    const { core, project } = await setup({
      runtimes: [RUNTIME],
      harnesses: [HARNESS],
      policyEngines: [POLICY_ENGINE],
    });
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    const frame = r.lastFrame()!;
    expect(frame).toContain("runtime");
    expect(frame).toContain("harness");
    expect(frame).toContain("policy");
    expect(frame).toContain("all");
    r.unmount();
  });

  test("empty project shows only the all option", async () => {
    const { core, project } = await setup({});
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "all");
    expect(r.lastFrame()).not.toContain("runtime");
    r.unmount();
  });

  test("selecting a type lists that type's resources", async () => {
    const { core, project } = await setup({ runtimes: [RUNTIME] });
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "runtime");
    await r.press("return");
    await waitForText(r.lastFrame, "choose a runtime to remove");
    expect(r.lastFrame()).toContain("checkout");
    r.unmount();
  });

  test("esc on the resource list returns to the resource-type list", async () => {
    const { core, project } = await setup({ runtimes: [RUNTIME] });
    const r = render("/agentcore/project/remove/runtime", core, project);

    await waitForText(r.lastFrame, "choose a runtime to remove");
    await r.press("escape");
    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    r.unmount();
  });

  test("esc on the resource-type list returns to the project menu", async () => {
    const { core, project } = await setup({ runtimes: [RUNTIME] });
    const r = render("/agentcore/project/remove", core, project);

    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    await r.press("escape");
    await waitForText(r.lastFrame, "agentcore → project");
    r.unmount();
  });

  test("confirming a removal deletes the resource from the spec", async () => {
    const { core, project, specPath } = await setup({ runtimes: [RUNTIME], harnesses: [HARNESS] });
    const r = render("/agentcore/project/remove/runtime/0", core, project);

    await waitForText(r.lastFrame, "Remove runtime 'checkout' from project orders?");
    expect(r.lastFrame()).toContain("(y/N)");
    await r.write("y");
    await waitForText(r.lastFrame, "Resource removed");

    const spec = await readSpec(specPath);
    expect(spec.runtimes.map((runtime) => runtime.name)).toEqual([]);
    expect(spec.harnesses.map((harness) => harness.name)).toEqual(["support"]);
    r.unmount();
  });

  test("enter after success returns to the project menu", async () => {
    const { core, project } = await setup({ runtimes: [RUNTIME] });
    const r = render("/agentcore/project/remove/runtime/0", core, project);

    await waitForText(r.lastFrame, "Remove runtime 'checkout' from project orders?");
    await r.write("y");
    await waitForText(r.lastFrame, "Resource removed");
    await r.press("return");
    await waitForText(r.lastFrame, "agentcore → project");
    r.unmount();
  });

  test("declining leaves the resource in place", async () => {
    const { core, project, specPath } = await setup({ runtimes: [RUNTIME] });
    const r = render("/agentcore/project/remove/runtime/0", core, project);

    await waitForText(r.lastFrame, "Remove runtime 'checkout' from project orders?");
    await r.write("n");
    await waitFor(() => !(r.lastFrame() ?? "").includes("Remove runtime 'checkout'"));

    const spec = await readSpec(specPath);
    expect(spec.runtimes.map((runtime) => runtime.name)).toEqual(["checkout"]);
    r.unmount();
  });

  test("lists a nested resource with its parent and removes it", async () => {
    const { core, project, specPath } = await setup({ policyEngines: [POLICY_ENGINE] });
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

    const spec = await readSpec(specPath);
    expect(spec.policyEngines[0]!.policies).toEqual([]);
    confirm.unmount();
  });

  test("removing all empties every resource collection", async () => {
    const { core, project, specPath } = await setup({
      runtimes: [RUNTIME],
      harnesses: [HARNESS],
      policyEngines: [POLICY_ENGINE],
    });
    const r = render("/agentcore/project/remove/all", core, project);

    await waitForText(r.lastFrame, "Remove every resource from project orders?");
    await r.write("y");
    await waitForText(r.lastFrame, "All resources removed");

    const spec = await readSpec(specPath);
    expect(spec.runtimes).toEqual([]);
    expect(spec.harnesses).toEqual([]);
    expect(spec.policyEngines).toEqual([]);
    r.unmount();
  });
});
