import * as helpers from './helpers';
import { existsSync } from 'fs';
import { join } from 'path';
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
    expect(existsSync(join(helpers.getTmpDir(), name, 'agentcore', 'agentcore.json'))).toBe(true);
    expect(existsSync(join(helpers.getTmpDir(), name, 'app', name))).toBe(false);
  });

  it('creates a project with agent by default', () => {
    const name = helpers.randomProjectName();
    const result = helpers.run(['create', '--name', name]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(helpers.getTmpDir(), name, 'app', name))).toBe(true);
  });

  it('rejects if project directory already exists', () => {
    const name = helpers.randomProjectName();
    helpers.run(['create', '--project-name', name, '--no-agent']);
    const result = helpers.run(['create', '--project-name', name, '--no-agent']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/already exists/i);
  });
});
