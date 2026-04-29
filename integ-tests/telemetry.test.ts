import { spawnAndCollect } from '../src/test-utils/cli-runner.js';
import { createTestProject } from '../src/test-utils/index.js';
import type { TestProject } from '../src/test-utils/index.js';
import { globSync } from 'glob';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testConfigDir = mkdtempSync(join(tmpdir(), 'agentcore-integ-'));
const cliPath = join(__dirname, '..', 'dist', 'cli', 'index.mjs');

function run(args: string[]) {
  return spawnAndCollect('node', [cliPath, ...args], tmpdir(), {
    AGENTCORE_SKIP_INSTALL: '1',
    AGENTCORE_CONFIG_DIR: testConfigDir,
  });
}

describe('telemetry e2e', () => {
  afterAll(() => rm(testConfigDir, { recursive: true, force: true }));

  it('disable → status shows Disabled, enable → status shows Enabled', async () => {
    await run(['telemetry', 'disable']);
    let status = await run(['telemetry', 'status']);
    expect(status.stdout).toContain('Disabled');
    expect(status.stdout).toContain('global config');

    await run(['telemetry', 'enable']);
    status = await run(['telemetry', 'status']);
    expect(status.stdout).toContain('Enabled');
    expect(status.stdout).toContain('global config');
  });
});

// ── Audit file tests ───────────────────────────────────────────────────────

interface TelemetryEntry {
  value: number;
  attrs: Record<string, string | number>;
}

function readAuditEntries(configDir: string): TelemetryEntry[] {
  const files = globSync(join(configDir, 'telemetry', '*.json'));
  return files.flatMap(f =>
    readFileSync(f, 'utf-8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as TelemetryEntry)
  );
}

function clearAudit(configDir: string) {
  try {
    rmSync(join(configDir, 'telemetry'), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('telemetry audit: add.* commands', () => {
  let project: TestProject;
  const auditConfigDir = mkdtempSync(join(tmpdir(), 'agentcore-audit-'));

  function runWithAudit(args: string[]) {
    return spawnAndCollect('node', [cliPath, ...args], project.projectPath, {
      AGENTCORE_SKIP_INSTALL: '1',
      AGENTCORE_TELEMETRY_AUDIT: '1',
      AGENTCORE_CONFIG_DIR: auditConfigDir,
    });
  }

  beforeAll(async () => {
    project = await createTestProject({ noAgent: true });
  });

  afterAll(async () => {
    await project.cleanup();
    await rm(auditConfigDir, { recursive: true, force: true });
  });

  beforeEach(() => clearAudit(auditConfigDir));

  it('add.gateway emits correct telemetry', async () => {
    const result = await runWithAudit(['add', 'gateway', '--name', 'testgw', '--authorizer-type', 'NONE', '--json']);
    expect(result.exitCode).toBe(0);

    const entries = readAuditEntries(auditConfigDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attrs).toMatchObject({
      command: 'add.gateway',
      command_group: 'add',
      exit_reason: 'success',
      authorizer_type: 'none',
      has_policy_engine: 'false',
      semantic_search: 'true',
      runtime_count: 0,
    });
  });

  it('add.credential emits correct telemetry', async () => {
    const result = await runWithAudit([
      'add',
      'credential',
      '--name',
      'testcred',
      '--type',
      'api-key',
      '--api-key',
      'secret123',
      '--json',
    ]);
    expect(result.exitCode).toBe(0);

    const entries = readAuditEntries(auditConfigDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attrs).toMatchObject({
      command: 'add.credential',
      exit_reason: 'success',
      credential_type: 'api-key',
    });
  });

  it('add.memory emits correct telemetry', async () => {
    const result = await runWithAudit([
      'add',
      'memory',
      '--name',
      'testmem',
      '--strategies',
      'SEMANTIC,SUMMARIZATION',
      '--expiry',
      '30',
      '--json',
    ]);
    expect(result.exitCode).toBe(0);

    const entries = readAuditEntries(auditConfigDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attrs).toMatchObject({
      command: 'add.memory',
      exit_reason: 'success',
      strategy_count: 2,
      strategy_semantic: 'true',
      strategy_summarization: 'true',
    });
  });

  it('add.policy-engine emits correct telemetry', async () => {
    const result = await runWithAudit(['add', 'policy-engine', '--name', 'testengine', '--json']);
    expect(result.exitCode).toBe(0);

    const entries = readAuditEntries(auditConfigDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attrs).toMatchObject({
      command: 'add.policy-engine',
      exit_reason: 'success',
      attach_gateway_count: 0,
      attach_mode: 'log_only',
    });
  });

  it('records failure telemetry when validation fails', async () => {
    const result = await runWithAudit(['add', 'gateway', '--json']);
    expect(result.exitCode).toBe(1);

    const entries = readAuditEntries(auditConfigDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attrs).toMatchObject({
      command: 'add.gateway',
      exit_reason: 'failure',
    });
  });
});
