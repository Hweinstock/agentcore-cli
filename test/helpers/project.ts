import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type RunResult } from "./run";

export const uniqueName = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 42);

export function expectOk(result: RunResult): RunResult {
  if (result.exitCode !== 0) {
    throw new Error(
      `exited ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  return result;
}

export class Project {
  private constructor(
    readonly name: string,
    readonly root: string,
    readonly dir: string,
  ) {}

  static async create(name: string, createArgs: string[]): Promise<Project> {
    const root = await mkdtemp(join(tmpdir(), "agentcore-e2e-"));
    expectOk(await run(["project", "create", "--name", name, "--skip-git", ...createArgs], root));
    return new Project(name, root, join(root, name));
  }

  run(args: string[]): Promise<RunResult> {
    return run(args, this.dir);
  }

  async teardown(): Promise<void> {
    try {
      await this.run(["project", "remove", "all", "--yes"]);
      await this.run(["project", "deploy", "--yes", "--json"]);
    } catch {
      // Best-effort; the pre-run stale-stack sweep is the backstop.
    } finally {
      await rm(this.root, { recursive: true, force: true });
    }
  }
}
