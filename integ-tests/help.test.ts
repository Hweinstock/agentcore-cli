import { createAuditContext } from '../src/test-utils/audit.js';
import { spawnAndCollect } from '../src/test-utils/cli-runner.js';
import { runCLI } from '../src/test-utils/index.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const COMMANDS = [
  'create',
  'deploy',
  'dev',
  'invoke',
  'status',
  'validate',
  'add',
  'attach',
  'remove',
  'edit',
  'package',
  'update',
];

describe('CLI help', () => {
  describe('main help', () => {
    it('shows all commands', async () => {
      const result = await runCLI(['--help'], process.cwd());

      expect(result.exitCode).toBe(0);
      expect(result.stdout.includes('Usage:'), 'Should show usage').toBeTruthy();
      expect(result.stdout.includes('Commands:'), 'Should list commands').toBeTruthy();
    });
  });

  describe('command help', () => {
    for (const cmd of COMMANDS) {
      it(`${cmd} --help exits 0`, async () => {
        const result = await runCLI([cmd, '--help'], process.cwd());

        expect(result.exitCode, `${cmd} --help failed: ${result.stderr}`).toBe(0);
        expect(result.stdout.includes('Usage:'), `${cmd} should show usage`).toBeTruthy();
      });
    }
  });
});

describe('help modes telemetry', () => {
  const audit = createAuditContext();
  const cliPath = join(__dirname, '..', 'dist', 'cli', 'index.mjs');

  afterAll(() => audit.cleanup());

  function run(args: string[], extraEnv: Record<string, string> = {}) {
    return spawnAndCollect('node', [cliPath, ...args], process.cwd(), {
      AGENTCORE_SKIP_INSTALL: '1',
      ...audit.env,
      ...extraEnv,
    });
  }

  it('writes JSONL audit file when audit is enabled via env var', async () => {
    const result = await run(['help', 'modes']);
    expect(result.exitCode).toBe(0);

    const entries = audit.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attrs).toMatchObject({
      'service.name': 'agentcore-cli',
      'agentcore-cli.mode': 'cli',
      command_group: 'help',
      command: 'help.modes',
      exit_reason: 'success',
    });
    expect(entries[0]!.attrs['agentcore-cli.session_id']).toBeDefined();
    expect(entries[0]!.attrs['os.type']).toBeDefined();
    expect(entries[0]!.value).toBeGreaterThanOrEqual(0);
  });

  it('does not write audit file when audit is not enabled', async () => {
    audit.clear();

    const noAuditCliPath = join(__dirname, '..', 'dist', 'cli', 'index.mjs');
    const result = await spawnAndCollect('node', [noAuditCliPath, 'help', 'modes'], process.cwd(), {
      AGENTCORE_SKIP_INSTALL: '1',
      AGENTCORE_CONFIG_DIR: audit.dir,
    });
    expect(result.exitCode).toBe(0);

    const telemetryDir = join(audit.dir, 'telemetry');
    try {
      const files = readdirSync(telemetryDir);
      expect(files).toHaveLength(0);
    } catch {
      // telemetry dir doesn't exist — correct
    }
  });
});
