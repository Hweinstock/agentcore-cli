import * as helpers from '../helpers';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('add agent command', () => {
  it('rejects when not in a project', () => {
    const result = helpers.run(['add', 'agent', '--name', 'my-agent']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/no agentcore project found/i);
  });

  it('rejects when --name is missing', () => {
    const result = helpers.run(['add', 'agent']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/required/i);
  });

  it('rejects invalid --language value', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const result = helpers.run(['add', 'agent', '--name', 'my-agent', '--language', 'go'], {
      cwd: join(helpers.getTmpDir(), name),
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('adds an agent to an existing project', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const result = helpers.run(['add', 'agent', '--name', 'test-agent'], {
      cwd: join(helpers.getTmpDir(), name),
    });
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertExists('app/test-agent/main.py');
    helpers.project(name).assertConfigContains('agents', 'test-agent');
  });

  it('adds a typescript agent when --language typescript is passed', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const result = helpers.run(['add', 'agent', '--name', 'ts-agent', '--language', 'typescript'], {
      cwd: join(helpers.getTmpDir(), name),
    });
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertExists('app/ts-agent');
  });

  it('accepts the --debug flag', () => {
    const name = helpers.randomProjectName();
    helpers.createProject(name);
    const result = helpers.run(['add', 'agent', '--name', 'debug-agent', '--debug'], {
      cwd: join(helpers.getTmpDir(), name),
    });
    expect(result.exitCode, `expected exit code 0, got: ${JSON.stringify(result)}`).toBe(0);
  });
});
