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
  const dir = process.env.AGENTCORE_TEST_TMPDIR ?? readFileSync(join(__dirname, '.tmp-dir'), 'utf-8').trim();
  if (!dir) throw new Error('AGENTCORE_TEST_TMPDIR not set and .tmp-dir file missing');
  return dir;
}

export function randomProjectName(): string {
  return `test-${randomUUID().slice(0, 8)}`;
}

export function run(args: string[], options?: { cwd?: string }): RunResult {
  const result = spawnSync(getCliPath(), args, {
    cwd: options?.cwd ?? getTmpDir(),
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}
