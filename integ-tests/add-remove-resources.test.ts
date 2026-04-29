import { createTestProject, readProjectConfig, runCLI } from '../src/test-utils/index.js';
import type { TestProject } from '../src/test-utils/index.js';
import { globSync } from 'glob';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const auditDir = mkdtempSync(join(tmpdir(), 'agentcore-audit-'));
const auditEnv = { AGENTCORE_TELEMETRY_AUDIT: '1', AGENTCORE_CONFIG_DIR: auditDir };

interface TelemetryEntry {
  value: number;
  attrs: Record<string, string | number>;
}

function readAuditEntries(): TelemetryEntry[] {
  return globSync(join(auditDir, 'telemetry', '*.json')).flatMap(f =>
    readFileSync(f, 'utf-8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as TelemetryEntry)
  );
}

describe('integration: add and remove resources', () => {
  let project: TestProject;

  beforeAll(async () => {
    project = await createTestProject({
      language: 'Python',
      framework: 'Strands',
      modelProvider: 'Bedrock',
      memory: 'none',
    });
  });

  afterAll(async () => {
    await project.cleanup();
    rmSync(auditDir, { recursive: true, force: true });
  });

  describe('memory lifecycle', () => {
    const memoryName = `IntegMem${Date.now().toString().slice(-6)}`;

    it('adds a memory resource', async () => {
      const result = await runCLI(['add', 'memory', '--name', memoryName, '--json'], project.projectPath, {
        env: auditEnv,
      });

      expect(result.exitCode, `stdout: ${result.stdout}, stderr: ${result.stderr}`).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);

      // Verify config updated
      const config = await readProjectConfig(project.projectPath);
      const memories = config.memories as Record<string, unknown>[] | undefined;
      expect(memories, 'memories should exist').toBeDefined();
      const found = memories!.some((m: Record<string, unknown>) => m.name === memoryName);
      expect(found, `Memory "${memoryName}" should be in config`).toBe(true);

      // Verify telemetry
      const entries = readAuditEntries();
      expect(entries.length).toBeGreaterThan(0);
      const last = entries[entries.length - 1]!.attrs;
      expect(last).toMatchObject({ command: 'add.memory', exit_reason: 'success' });
    });

    it('adds a memory with EPISODIC strategy and verifies reflectionNamespaces', async () => {
      const episodicMemName = `EpiMem${Date.now().toString().slice(-6)}`;
      const result = await runCLI(
        ['add', 'memory', '--name', episodicMemName, '--strategies', 'EPISODIC', '--json'],
        project.projectPath
      );

      expect(result.exitCode, `stdout: ${result.stdout}, stderr: ${result.stderr}`).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);

      // Verify EPISODIC in config with reflectionNamespaces
      const config = await readProjectConfig(project.projectPath);
      const memories = config.memories as {
        name: string;
        strategies: { type: string; reflectionNamespaces?: string[] }[];
      }[];
      const mem = memories.find(m => m.name === episodicMemName);
      expect(mem, 'Memory should exist').toBeTruthy();

      const episodic = mem!.strategies.find(s => s.type === 'EPISODIC');
      expect(episodic, 'EPISODIC strategy should exist').toBeTruthy();
      expect(episodic!.reflectionNamespaces, 'Should have reflectionNamespaces').toBeDefined();
      expect(episodic!.reflectionNamespaces!.length).toBeGreaterThan(0);

      // Clean up
      await runCLI(['remove', 'memory', '--name', episodicMemName, '--json'], project.projectPath);
    });

    it('removes the memory resource', async () => {
      const result = await runCLI(['remove', 'memory', '--name', memoryName, '--json'], project.projectPath);

      expect(result.exitCode, `stdout: ${result.stdout}, stderr: ${result.stderr}`).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);

      // Verify config updated
      const config = await readProjectConfig(project.projectPath);
      const memories = (config.memories as Record<string, unknown>[] | undefined) ?? [];
      const found = memories.some((m: Record<string, unknown>) => m.name === memoryName);
      expect(found, `Memory "${memoryName}" should be removed from config`).toBe(false);
    });
  });

  describe('credential lifecycle', () => {
    const credentialName = `IntegId${Date.now().toString().slice(-6)}`;

    it('adds a credential resource', async () => {
      const result = await runCLI(
        ['add', 'credential', '--name', credentialName, '--api-key', 'test-key-integ-123', '--json'],
        project.projectPath,
        { env: auditEnv }
      );

      expect(result.exitCode, `stdout: ${result.stdout}, stderr: ${result.stderr}`).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);

      // Verify config updated
      const config = await readProjectConfig(project.projectPath);
      const credentials = config.credentials as Record<string, unknown>[] | undefined;
      expect(credentials, 'credentials should exist').toBeDefined();
      const found = credentials!.some((c: Record<string, unknown>) => c.name === credentialName);
      expect(found, `Credential "${credentialName}" should be in config`).toBe(true);

      // Verify telemetry
      const entries = readAuditEntries();
      expect(entries.length).toBeGreaterThan(0);
      const last = entries[entries.length - 1]!.attrs;
      expect(last).toMatchObject({ command: 'add.credential', exit_reason: 'success', credential_type: 'api-key' });
    });

    it('removes the credential resource', async () => {
      const result = await runCLI(['remove', 'credential', '--name', credentialName, '--json'], project.projectPath);

      expect(result.exitCode, `stdout: ${result.stdout}, stderr: ${result.stderr}`).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);

      // Verify config updated
      const config = await readProjectConfig(project.projectPath);
      const credentials = (config.credentials as Record<string, unknown>[] | undefined) ?? [];
      const found = credentials.some((c: Record<string, unknown>) => c.name === credentialName);
      expect(found, `Credential "${credentialName}" should be removed from config`).toBe(false);
    });
  });
});
