import * as helpers from '../helpers';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('add gateway command', () => {
  it('rejects when not in a project', () => {
    const result = helpers.run(['add', 'gateway', '--name', 'my-gateway']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no agentcore project found/i);
  });

  it('adds a gateway to an existing project', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const result = helpers.run(['add', 'gateway', '--name', 'test-gateway'], {
      cwd: join(helpers.getTmpDir(), name),
    });
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertConfigContains('gateways', 'test-gateway');
  });
});
