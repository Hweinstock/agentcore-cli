import { AgentCoreProjectSpecSchema } from '../../../../schema';
import { runCLI } from '../../../../test-utils';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('BMA dev command', () => {
  let testDirectory: string;
  let singleRuntimeDirectory: string;
  let mixedRuntimeDirectory: string;
  const env = { AGENTCORE_TELEMETRY_DISABLED: '1' };

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'agentcore-bma-dev-'));
    singleRuntimeDirectory = join(testDirectory, 'single');
    mixedRuntimeDirectory = join(testDirectory, 'mixed');
    const environment = {
      name: 'Environment',
      build: 'Container',
      entrypoint: 'lifecycle/server.py',
      codeLocation: 'app/Environment',
      dockerfile: 'Dockerfile',
      tags: { 'agentcore:template': 'BedrockManagedAgents' },
    };
    const localAgent = {
      name: 'LocalAgent',
      build: 'CodeZip',
      runtimeVersion: 'PYTHON_3_12',
      entrypoint: 'main.py',
      codeLocation: 'app/LocalAgent',
    };

    for (const [directory, runtimes] of [
      [singleRuntimeDirectory, [environment]],
      [mixedRuntimeDirectory, [environment, localAgent]],
    ] as const) {
      const configDirectory = join(directory, 'agentcore');
      await mkdir(configDirectory, { recursive: true });
      const project = AgentCoreProjectSpecSchema.parse({ name: 'TestProject', version: 1, runtimes });
      await writeFile(join(configDirectory, 'agentcore.json'), JSON.stringify(project));
    }
  });

  afterAll(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it.each([[], ['--logs'], ['--no-browser'], ['hello'], ['hello', '--stream']])(
    'rejects an explicitly selected BMA runtime before dev operations',
    async (...flags) => {
      const result = await runCLI(
        ['dev', '--runtime', 'Environment', '--skip-deploy', '--no-traces', ...flags],
        mixedRuntimeDirectory,
        { env }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr, JSON.stringify(result)).toContain(
        'Local dev is not supported for runtime "Environment" (environment-python-bma)'
      );
      expect(result.stderr).toContain('agentcore deploy');
      expect(result.stdout).not.toContain('Starting dev server');
    }
  );

  it('reports unsupported local dev when BMA is the only runtime', async () => {
    const result = await runCLI(['dev', '--logs', '--skip-deploy', '--no-traces'], singleRuntimeDirectory, { env });

    expect(result.exitCode).toBe(1);
    expect(result.stderr, JSON.stringify(result)).toContain('Local dev is not supported');
    expect(result.stderr).toContain('environment-python-bma');
  });

  it('rejects prompt invocation when BMA is the only runtime', async () => {
    const result = await runCLI(['dev', 'hello'], singleRuntimeDirectory, { env });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Local dev is not supported');
  });

  it('invokes the only supported runtime in a mixed project without requiring --runtime', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ response: 'LocalAgent response' }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing local server port');
      const result = await runCLI(['dev', 'hello', '--port', String(address.port)], mixedRuntimeDirectory, { env });

      expect(result.exitCode, JSON.stringify(result)).toBe(0);
      expect(result.stdout).toContain('LocalAgent response');
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
});
