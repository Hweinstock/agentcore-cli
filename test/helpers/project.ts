import type { CliRunner, RunResult } from "./run";

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

export function parseJson<T>(result: RunResult): T {
  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(`invalid JSON output: ${result.stdout}`, { cause: error });
  }
}

export async function cleanupProject(
  cli: CliRunner,
  projectDir: string | undefined,
): Promise<void> {
  if (!projectDir) return;
  const failures: string[] = [];
  let removed = false;
  try {
    expectOk(await cli.run(["project", "remove", "all", "--yes", "--json"], projectDir));
    removed = true;
  } catch (error) {
    failures.push(`remove: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (removed) {
    try {
      expectOk(await cli.run(["project", "deploy", "--yes", "--json"], projectDir));
    } catch (error) {
      failures.push(`deploy: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) console.warn(`[e2e] project teardown failed\n${failures.join("\n")}`);
}
