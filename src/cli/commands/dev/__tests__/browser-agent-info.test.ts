import type { AgentCoreProjectSpec } from '../../../../schema';
import { getBrowserAgentInfo, getBrowserSelectedAgent } from '../browser-mode';
import { describe, expect, it } from 'vitest';

describe('getBrowserAgentInfo', () => {
  it('preserves runtime indexes when unsupported runtimes are filtered out', () => {
    const project = {
      runtimes: [
        { name: 'unsupported', build: 'Container', protocol: 'HTTP' },
        { name: 'a2a-agent', build: 'CodeZip', protocol: 'A2A', entrypoint: 'main.py' },
      ],
    } as unknown as AgentCoreProjectSpec;

    expect(getBrowserAgentInfo(project)).toEqual([
      {
        name: 'a2a-agent',
        buildType: 'CodeZip',
        protocol: 'A2A',
        runtimeIndex: 1,
      },
    ]);
  });

  it('omits BMA environments from the browser runtime picker', () => {
    const project = {
      runtimes: [
        {
          name: 'Environment',
          build: 'Container',
          entrypoint: 'lifecycle/server.py',
          tags: { 'agentcore:template': 'BedrockManagedAgents' },
        },
        { name: 'LocalAgent', build: 'CodeZip', entrypoint: 'main.py' },
      ],
    } as unknown as AgentCoreProjectSpec;

    expect(getBrowserAgentInfo(project)).toEqual([
      { name: 'LocalAgent', buildType: 'CodeZip', protocol: 'HTTP', runtimeIndex: 1 },
    ]);
  });

  it('treats a BMA environment alongside a harness as a project without local dev runtimes', () => {
    const project = {
      runtimes: [
        {
          name: 'Environment',
          build: 'Container',
          entrypoint: 'lifecycle/server.py',
          tags: { 'agentcore:template': 'BedrockManagedAgents' },
        },
      ],
      harnesses: [{ name: 'Harness' }],
    } as unknown as AgentCoreProjectSpec;

    expect(getBrowserAgentInfo(project)).toEqual([]);
  });

  it('selects the only supported runtime so an explicit port applies to it', () => {
    const agents = [{ name: 'only-agent', buildType: 'CodeZip', protocol: 'A2A', runtimeIndex: 1 }];

    expect(getBrowserSelectedAgent(undefined, agents)).toBe('only-agent');
    expect(getBrowserSelectedAgent('requested-agent', agents)).toBe('requested-agent');
    expect(getBrowserSelectedAgent(undefined, [...agents, { ...agents[0]!, name: 'second-agent' }])).toBeUndefined();
  });
});
