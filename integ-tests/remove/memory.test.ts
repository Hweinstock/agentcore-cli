import * as helpers from '../helpers';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('remove memory command', () => {
  it('rejects when not in a project', () => {
    const result = helpers.run(['remove', 'memory', '--name', 'my-memory']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no agentcore project found/i);
  });

  it('removes a memory from the project config', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const cwd = join(helpers.getTmpDir(), name);
    helpers.run(['add', 'memory', '--name', 'doomed-memory'], { cwd });
    helpers.project(name).assertConfigContains('memories', 'doomed-memory');

    const result = helpers.run(['remove', 'memory', '--name', 'doomed-memory'], { cwd });
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertConfigNotContains('memories', 'doomed-memory');
  });
});
