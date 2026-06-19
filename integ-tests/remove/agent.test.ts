import * as helpers from '../helpers';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('remove agent command', () => {
  it('rejects when not in a project', () => {
    const result = helpers.run(['remove', 'agent', '--name', 'my-agent']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no agentcore project found/i);
  });

  it('removes an agent from the project config', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const cwd = join(helpers.getTmpDir(), name);
    helpers.run(['add', 'agent', '--name', 'doomed-agent'], { cwd });
    helpers.project(name).assertConfigContains('agents', 'doomed-agent');

    const result = helpers.run(['remove', 'agent', '--name', 'doomed-agent'], { cwd });
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertConfigNotContains('agents', 'doomed-agent');
  });
});
