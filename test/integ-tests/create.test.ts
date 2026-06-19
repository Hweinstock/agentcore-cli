import * as helpers from './helpers';
import { describe, expect, it } from 'vitest';

describe('create command', () => {
  it('rejects unknown flags', () => {
    const result = helpers.run(['create', '--bogus-flag']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/unknown option/i);
  });

  it('rejects invalid value for --language', () => {
    const name = helpers.randomProjectName();
    const result = helpers.run(['create', '--project-name', name, '--language', 'cobol']);
    expect(result.exitCode).not.toBe(0);
  });

  it('creates a project without agent when --no-agent is passed', () => {
    const name = helpers.randomProjectName();
    const result = helpers.run(['create', '--project-name', name, '--no-agent']);
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertExists('agentcore/agentcore.json');
  });

  it('creates a project with agent by default', () => {
    const name = helpers.randomProjectName();
    const result = helpers.run(['create', '--name', name]);
    expect(result.exitCode).toBe(0);
    helpers.project(name).assertExists(`app/${name}`);
  });

  it('rejects if project directory already exists', () => {
    const name = helpers.randomProjectName();
    helpers.run(['create', '--project-name', name, '--no-agent']);
    const result = helpers.run(['create', '--project-name', name, '--no-agent']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/already exists/i);
  });
});
