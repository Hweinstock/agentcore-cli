import { NotSupportedError } from '../../../../lib';
import { AgentCoreProjectSpecSchema } from '../../../../schema';
import { ErrorName } from '../../../telemetry/schemas/common-shapes';
import { getDevConfig, getDevSupportedAgents } from '../config';
import { describe, expect, it } from 'vitest';

const bmaRuntime = {
  name: 'Environment',
  build: 'Container',
  entrypoint: 'lifecycle/server.py',
  codeLocation: 'app/Environment',
  dockerfile: 'Dockerfile',
  tags: { 'agentcore:template': 'BedrockManagedAgents' },
};

const localRuntime = {
  name: 'LocalAgent',
  build: 'CodeZip',
  runtimeVersion: 'PYTHON_3_12',
  entrypoint: 'main.py',
  codeLocation: 'app/LocalAgent',
};

const projectDefaults = { name: 'TestProject', version: 1 };

describe('BMA local dev support', () => {
  it.each([
    [bmaRuntime, localRuntime],
    [localRuntime, bmaRuntime],
  ])('skips BMA environments and selects the local runtime regardless of order', (...runtimes) => {
    const project = AgentCoreProjectSpecSchema.parse({ ...projectDefaults, runtimes });

    expect(getDevSupportedAgents(project).map(agent => agent.name)).toEqual(['LocalAgent']);
    expect(getDevConfig('/project', project)?.agentName).toBe('LocalAgent');
  });

  it('excludes a BMA-only project from local dev', () => {
    const project = AgentCoreProjectSpecSchema.parse({ ...projectDefaults, runtimes: [bmaRuntime] });

    expect(getDevSupportedAgents(project)).toEqual([]);
    expect(getDevConfig('/project', project)).toBeNull();
  });

  it('rejects an explicitly selected BMA runtime with an actionable user error', () => {
    const project = AgentCoreProjectSpecSchema.parse({ ...projectDefaults, runtimes: [bmaRuntime, localRuntime] });

    try {
      getDevConfig('/project', project, undefined, 'Environment');
      expect.fail('BMA must not start a local dev server');
    } catch (error) {
      expect(error).toBeInstanceOf(NotSupportedError);
      expect(error).toMatchObject({ errorSource: 'user' });
      expect(ErrorName.parse((error as Error).name)).toBe('NotSupportedError');
      expect((error as Error).message).toContain('Local dev is not supported');
      expect((error as Error).message).toContain('environment-python-bma');
      expect((error as Error).message).toContain('agentcore deploy');
    }
  });

  it('continues to support ordinary Container runtimes', () => {
    const project = AgentCoreProjectSpecSchema.parse({
      ...projectDefaults,
      runtimes: [{ ...bmaRuntime, tags: {} }],
    });

    expect(getDevSupportedAgents(project).map(agent => agent.name)).toEqual(['Environment']);
    expect(getDevConfig('/project', project, undefined, 'Environment')?.buildType).toBe('Container');
  });
});
