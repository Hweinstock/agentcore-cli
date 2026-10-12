import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeserializationError } from "../../errors";
import type { ProjectEvent } from "../../handlers/project/types";
import type { AwsDeploymentTarget } from "../../projectSchemas/aws-targets";
import { createSilentLogger, TestIdentityClient } from "../../testing";
import type { ProjectBackend } from "./backends/types";
import { FsProjectManager } from "./manager";

const BASE_TARGET: AwsDeploymentTarget = {
  name: "dev-us-east",
  account: "111122223333",
  region: "us-east-1",
};
const TARGETS = ["dev-us-east", "Dev", "dev"].map((name) => ({ ...BASE_TARGET, name }));
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function projectWithTargets(targets: unknown, version = 1) {
  const rootPath = await mkdtemp(join(tmpdir(), "agentcore-legacy-targets-"));
  directories.push(rootPath);
  const projectPath = join(rootPath, "agentcore", "agentcore.json");
  const targetsPath = join(rootPath, "agentcore", "aws-targets.json");
  const projectContents = JSON.stringify({ name: "example", version });
  const targetContents = JSON.stringify(targets, undefined, 2);
  await mkdir(join(rootPath, "agentcore"));
  await Promise.all([
    writeFile(projectPath, projectContents),
    writeFile(targetsPath, targetContents),
  ]);
  const calls = {
    deploy: [] as AwsDeploymentTarget[],
    resolveProject: [] as AwsDeploymentTarget[],
    resolveDeployed: [] as AwsDeploymentTarget[],
  };
  const backend: ProjectBackend = {
    async *build() {},
    async *deploy(_project, { target }) {
      calls.deploy.push(target);
      yield { type: "step", message: `Deploying ${target.name}` };
      return { outputs: { target: target.name } };
    },
    async resolveProjectResources(_project, { target }) {
      calls.resolveProject.push(target);
      return [];
    },
    async resolveDeployedResources(_project, { target }) {
      calls.resolveDeployed.push(target);
      return [];
    },
  };
  const manager = new FsProjectManager({
    logger: createSilentLogger(),
    identity: new TestIdentityClient(),
    enableTransactionSearch: async () => {},
    backends: { CDK: backend },
    resolveAccount: async () => "444455556666",
  });
  const project = await manager.resolve({ filePath: rootPath });
  if (!project) throw new Error("project could not be resolved");
  return {
    manager,
    project,
    calls,
    targetsPath,
    targetContents,
    projectPath,
    projectContents,
  };
}

async function drain<T>(operation: AsyncGenerator<ProjectEvent, T>): Promise<T> {
  while (true) {
    const result = await operation.next();
    if (result.done) return result.value;
  }
}

describe("legacy project deployment targets", () => {
  test("reads, selects, resolves, and deploys original v0 names without rewriting the files", async () => {
    const subject = await projectWithTargets(TARGETS);
    const { manager, project } = subject;
    expect(project.isV0).toBe(true);
    expect(await manager.listTargets(project)).toEqual(TARGETS);
    expect(await manager.resolveTarget(project, { target: "DEV" })).toBeUndefined();

    for (const target of TARGETS) {
      expect(await manager.resolveTarget(project, { target: target.name })).toEqual(target);
      expect(await manager.resolveProjectResources(project, { target: target.name })).toEqual({
        resources: [],
        target,
      });
      expect(await manager.resolveDeployedResources(project, { target: target.name })).toEqual({
        resources: [],
        target,
      });
      expect(
        await drain(
          manager.deploy(project, {
            target: target.name,
            region: "us-east-1",
            confirmTeardown: async () => false,
          }),
        ),
      ).toEqual({ outputs: { target: target.name } });
    }

    expect(subject.calls).toEqual({
      deploy: TARGETS,
      resolveProject: TARGETS,
      resolveDeployed: TARGETS,
    });
    expect(await readFile(subject.targetsPath, "utf8")).toBe(subject.targetContents);
    expect(await readFile(subject.projectPath, "utf8")).toBe(subject.projectContents);
  });

  test("adds a default target while preserving legacy target names and metadata", async () => {
    const originalTargets = [
      { ...BASE_TARGET, futureMetadata: { preserved: true } },
      ...TARGETS.slice(1),
      { ...BASE_TARGET, name: "Default" },
    ];
    const subject = await projectWithTargets(originalTargets);
    const defaultTarget: AwsDeploymentTarget = {
      name: "default",
      account: "444455556666",
      region: "us-east-1",
    };

    await drain(
      subject.manager.deploy(subject.project, {
        target: "default",
        region: "us-east-1",
        confirmTeardown: async () => false,
      }),
    );

    expect(subject.calls.deploy).toEqual([defaultTarget]);
    expect(JSON.parse(await readFile(subject.targetsPath, "utf8"))).toEqual([
      ...originalTargets,
      defaultTarget,
    ]);
    expect(await subject.manager.resolveTarget(subject.project, { target: "Default" })).toEqual({
      ...BASE_TARGET,
      name: "Default",
    });
    expect(await subject.manager.resolveTarget(subject.project, { target: "default" })).toEqual(
      defaultTarget,
    );
    expect(await readFile(subject.projectPath, "utf8")).toBe(subject.projectContents);
  });

  test.each([{ targets: [TARGETS[0]] }, { targets: TARGETS.slice(1) }])(
    "retains modern validation for $targets",
    async ({ targets }) => {
      const { manager, project } = await projectWithTargets(targets, 2);
      await expect(manager.listTargets(project)).rejects.toBeInstanceOf(DeserializationError);
    },
  );
});
