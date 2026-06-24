import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function getCliPath(): string {
  const cliPath = process.env.AGENTCORE_CLI_PATH;
  if (!cliPath) throw new Error('AGENTCORE_CLI_PATH env var must be set');
  return cliPath;
}

export function getTmpDir(): string {
  const dir = process.env.AGENTCORE_TEST_TMPDIR ?? readFileSync(join(__dirname, '..', '.tmp-dir'), 'utf-8').trim();
  if (!dir) throw new Error('AGENTCORE_TEST_TMPDIR not set and .tmp-dir file missing');
  return dir;
}

export function randomProjectName(): string {
  return `test-${randomUUID().slice(0, 8)}`;
}

export function run(args: string[], options?: { cwd?: string; env?: Record<string, string> }): RunResult {
  const result = spawnSync(getCliPath(), args, {
    cwd: options?.cwd ?? getTmpDir(),
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...options?.env },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

/** Create a project with --no-install for fast setup in non-create tests. */
export function createProject(
  projectName: string,
  options?: { runInstall?: boolean; includeAgent?: boolean }
): RunResult {
  const args = ['create', '--project-name', projectName];
  if (!options?.includeAgent) args.push('--no-agent');
  if (!options?.runInstall) args.push('--no-install');
  return run(args);
}
