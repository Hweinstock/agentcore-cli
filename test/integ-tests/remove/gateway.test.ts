import * as helpers from '../helpers';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('remove gateway command', () => {
  it('rejects when not in a project', () => {
    const result = helpers.run(['remove', 'gateway', '--name', 'my-gateway']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no agentcore project found/i);
  });

  it('removes a gateway from the project config', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const cwd = join(helpers.getTmpDir(), name);
    helpers.run(['add', 'gateway', '--name', 'doomed-gateway'], { cwd });
    helpers.project(name).assertConfigContains('gateways', 'doomed-gateway');

    const result = helpers.run(['remove', 'gateway', '--name', 'doomed-gateway'], { cwd });
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertConfigNotContains('gateways', 'doomed-gateway');
  });
});
