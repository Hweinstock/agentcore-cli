import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createRootHandler } from "../../index";
import {
  createSilentLogger,
  initProject,
  inTempDirectory,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../testing";
import type { DeployResult, ProjectEvent } from "../types";
import type { ProjectBackend } from "../../../core/project";

type TestBuildOptions = {
  events?: ProjectEvent[];
  /** Thrown by the fake backend after its events, to exercise failure paths. */
  failure?: Error;
};

/** Stubs the backend so the real FsProjectManager and withProject stay in the path. */
function testBuildCommand(options: TestBuildOptions = {}) {
  const io = testIO();
  const backend: ProjectBackend = {
    async *build() {
      yield* options.events ?? [];
      if (options.failure) throw options.failure;
    },
    deploy(): AsyncGenerator<ProjectEvent, DeployResult> {
      throw new Error("deploy is not under test");
    },
    async resolveDeployedResources() {
      return [];
    },
    async resolveProjectResources() {
      return [];
    },
  };
  const core = new TestCoreClient({ backends: { CDK: backend } });
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor: new TestGlobalConfigAccessor(),
    logger: createSilentLogger(),
  });

  return {
    io,
    run: (args: string[] = []) => root.route(["node", "agentcore", "project", "build", ...args]),
  };
}

async function run(
  args: string[],
  opts?: { core?: TestCoreClient; stdin?: string; platform?: NodeJS.Platform },
) {
  const io = testIO({ stdin: opts?.stdin });
  const core = opts?.core ?? new TestCoreClient();
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor: new TestGlobalConfigAccessor(),
    logger: createSilentLogger(),
    platform: opts?.platform,
  });
  await root.route(["node", "agentcore", "project", ...args]);
  return { io, core };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(() => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

/** Scaffolds a project named 'orders' and cds into it. */
async function inProject(): Promise<void> {
  const { cleanup } = await initProject({ name: "orders" });
  cleanups.push(cleanup);
}

describe("project build handler", () => {
  test("writes step lines and the success line to stderr, nothing to stdout", async () => {
    const subject = testBuildCommand({
      events: [
        { type: "step", message: "Synthesizing CloudFormation templates" },
        { type: "output", line: "synth chatter" },
      ],
    });
    await inProject();

    await subject.run();

    expect(subject.io.stderr()).toContain("Synthesizing CloudFormation templates");
    expect(subject.io.stderr()).toContain("Built project 'orders'");
    // Output lines belong to the debug log outside a TTY, not the plain stream.
    expect(subject.io.stderr()).not.toContain("synth chatter");
    expect(subject.io.stdout()).toBe("");
  });

  test("renders the success message as JSON with --json", async () => {
    const subject = testBuildCommand();
    await inProject();

    await subject.run(["--json"]);

    expect(JSON.parse(subject.io.stdout())).toEqual({ message: "Built project 'orders'" });
  });

  test("renders a build failure as JSON without changing the thrown error", async () => {
    const failure = new Error("cdk synth exploded");
    const subject = testBuildCommand({ failure });
    await inProject();

    await expect(subject.run(["--json"])).rejects.toThrow("cdk synth exploded");

    expect(JSON.parse(subject.io.stdout())).toEqual({ error: "cdk synth exploded" });
    expect(subject.io.stderr()).not.toContain("Built project");
  });

  test("keeps stdout empty on failure without --json", async () => {
    const subject = testBuildCommand({ failure: new Error("cdk synth exploded") });
    await inProject();

    await expect(subject.run()).rejects.toThrow("cdk synth exploded");

    expect(subject.io.stdout()).toBe("");
  });
});

describe("project build", () => {
  async function inBuildableProject(): Promise<string> {
    const { projectRoot, cleanup } = await initProject({ name: "MyAgent" });
    cleanups.push(cleanup);
    // create --skip-install leaves no node_modules, which build requires.
    await mkdir(join(projectRoot, "agentcore", "cdk", "node_modules"), { recursive: true });
    return projectRoot;
  }

  test("synthesizes the CDK app of the enclosing project", async () => {
    const projectRoot = await inBuildableProject();
    const { io, core } = await run(["build"]);

    expect(core.projectCommands).toEqual([
      {
        command: [
          "npm",
          "run",
          "cdk",
          "--",
          "synth",
          "--quiet",
          "--output",
          join(projectRoot, "agentcore", "cdk", "cdk.out"),
        ],
        cwd: join(projectRoot, "agentcore", "cdk"),
      },
    ]);
    expect(io.stderr()).toContain("Synthesizing CloudFormation templates");
    expect(io.stderr()).toContain("Built project 'MyAgent'");
  });

  test("resolves the project from a nested directory", async () => {
    const projectRoot = await inBuildableProject();
    // The default create scaffolds a harness directory named for the project.
    process.chdir(join(projectRoot, "app", "MyAgent"));

    const { core } = await run(["build"]);

    expect(core.projectCommands.map(({ cwd }) => cwd)).toEqual([
      join(projectRoot, "agentcore", "cdk"),
    ]);
  });

  test("fails with actionable guidance outside a project", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(run(["build"])).rejects.toThrow(/No AgentCore project found/);
  });

  test("fails when the CDK dependencies have not been installed", async () => {
    const projectRoot = await inBuildableProject();
    await rm(join(projectRoot, "agentcore", "cdk", "node_modules"), { recursive: true });

    await expect(run(["build"])).rejects.toThrow(/npm install/);
  });
});
