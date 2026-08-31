import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectSpecSchema, type ProjectSpec } from "../../../projectSchemas/project";
import {
  renderScreen,
  waitForText,
  waitFor,
  cleanupScreens,
  TestCoreClient,
} from "../../../testing";

// Behavior tests for the project-remove flow. TestCoreClient carries a real
// FsProjectManager, so the screen resolves and mutates a temp project on disk —
// removals are verified by reading agentcore.json back, not by inspecting calls.

const RUNTIME = {
  name: "checkout",
  build: "CodeZip",
  entrypoint: "main.py",
  codeLocation: "app/checkout",
  runtimeVersion: "PYTHON_3_14",
} as const;
const HARNESS = { name: "support", path: "app/support" } as const;

const originalCwd = process.cwd();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  cleanupScreens();
  process.chdir(originalCwd);
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })));
});

// inProject scaffolds a temp AgentCore project seeded with the given resources
// and chdirs into it, so the screen resolves it from the current directory.
async function inProject(resources: {
  runtimes?: unknown[];
  harnesses?: unknown[];
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agentcore-project-remove-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "agentcore"), { recursive: true });
  const spec = ProjectSpecSchema.parse({
    name: "orders",
    version: 1,
    runtimes: resources.runtimes ?? [],
    harnesses: resources.harnesses ?? [],
  });
  await writeFile(join(root, "agentcore", "agentcore.json"), JSON.stringify(spec));
  process.chdir(root);
  return root;
}

async function readSpec(root: string): Promise<ProjectSpec> {
  return ProjectSpecSchema.parse(
    JSON.parse(await readFile(join(root, "agentcore", "agentcore.json"), "utf8")),
  );
}

describe("project remove screen", () => {
  test("lists the resource types the project holds plus an all option", async () => {
    await inProject({ runtimes: [RUNTIME], harnesses: [HARNESS] });
    const r = renderScreen("/agentcore/project/remove", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    const frame = r.lastFrame()!;
    expect(frame).toContain("runtime");
    expect(frame).toContain("harness");
    expect(frame).toContain("all");
    r.unmount();
  });

  test("empty project shows only the all option", async () => {
    await inProject({});
    const r = renderScreen("/agentcore/project/remove", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "all");
    expect(r.lastFrame()).not.toContain("runtime");
    r.unmount();
  });

  test("selecting a type lists that type's resources", async () => {
    await inProject({ runtimes: [RUNTIME] });
    const r = renderScreen("/agentcore/project/remove", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "runtime");
    await r.press("return");
    await waitForText(r.lastFrame, "choose a runtime to remove");
    expect(r.lastFrame()).toContain("checkout");
    r.unmount();
  });

  test("esc on the resource list returns to the resource-type list", async () => {
    await inProject({ runtimes: [RUNTIME] });
    const r = renderScreen("/agentcore/project/remove/runtime", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "choose a runtime to remove");
    await r.press("escape");
    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    r.unmount();
  });

  test("esc on the resource-type list returns to the project menu", async () => {
    await inProject({ runtimes: [RUNTIME] });
    const r = renderScreen("/agentcore/project/remove", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "choose a resource to remove from project orders");
    await r.press("escape");
    await waitForText(r.lastFrame, "agentcore → project");
    r.unmount();
  });

  test("confirming a removal deletes the resource from the spec", async () => {
    const root = await inProject({ runtimes: [RUNTIME], harnesses: [HARNESS] });
    const r = renderScreen("/agentcore/project/remove/runtime/checkout", {
      core: new TestCoreClient(),
    });

    await waitForText(r.lastFrame, "Remove runtime 'checkout' from project orders?");
    expect(r.lastFrame()).toContain("(y/N)");
    await r.write("y");
    await waitForText(r.lastFrame, "Resource removed");

    const spec = await readSpec(root);
    expect(spec.runtimes.map((runtime) => runtime.name)).toEqual([]);
    expect(spec.harnesses.map((harness) => harness.name)).toEqual(["support"]);
    r.unmount();
  });

  test("enter after success returns to the project menu", async () => {
    await inProject({ runtimes: [RUNTIME] });
    const r = renderScreen("/agentcore/project/remove/runtime/checkout", {
      core: new TestCoreClient(),
    });

    await waitForText(r.lastFrame, "Remove runtime 'checkout' from project orders?");
    await r.write("y");
    await waitForText(r.lastFrame, "Resource removed");
    await r.press("return");
    await waitForText(r.lastFrame, "agentcore → project");
    r.unmount();
  });

  test("declining leaves the resource in place", async () => {
    const root = await inProject({ runtimes: [RUNTIME] });
    const r = renderScreen("/agentcore/project/remove/runtime/checkout", {
      core: new TestCoreClient(),
    });

    await waitForText(r.lastFrame, "Remove runtime 'checkout' from project orders?");
    await r.write("n");
    await waitFor(() => !(r.lastFrame() ?? "").includes("Remove runtime 'checkout'"));

    const spec = await readSpec(root);
    expect(spec.runtimes.map((runtime) => runtime.name)).toEqual(["checkout"]);
    r.unmount();
  });

  test("removing all empties every resource collection", async () => {
    const root = await inProject({ runtimes: [RUNTIME], harnesses: [HARNESS] });
    const r = renderScreen("/agentcore/project/remove/all", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "Remove every resource from project orders?");
    await r.write("y");
    await waitForText(r.lastFrame, "All resources removed");

    const spec = await readSpec(root);
    expect(spec.runtimes).toEqual([]);
    expect(spec.harnesses).toEqual([]);
    r.unmount();
  });

  test("reports a helpful error when no project is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentcore-no-project-"));
    temporaryDirectories.push(root);
    process.chdir(root);
    const r = renderScreen("/agentcore/project/remove", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "No AgentCore project found");
    r.unmount();
  });

  test("surfaces a resolve failure rather than the missing-project message", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentcore-bad-project-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "agentcore"), { recursive: true });
    await writeFile(join(root, "agentcore", "agentcore.json"), "{ not valid json");
    process.chdir(root);
    const r = renderScreen("/agentcore/project/remove", { core: new TestCoreClient() });

    await waitForText(r.lastFrame, "unable to resolve the project");
    expect(r.lastFrame()).not.toContain("No AgentCore project found");
    r.unmount();
  });
});
