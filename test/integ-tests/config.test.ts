import * as helpers from './helpers';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

describe('config command', () => {
  let configDir: string;
  let config: helpers.GlobalConfigHelper;

  beforeEach(() => {
    configDir = join(helpers.getTmpDir(), `config-${helpers.randomProjectName()}`);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{}');
    config = helpers.globalConfig(configDir);
  });

  const runConfig = (args: string[] = []) =>
    helpers.run(['config', ...args], { env: { AGENTCORE_CONFIG_DIR: configDir } });

  it('succeeds with no arguments', () => {
    const result = runConfig();
    expect(result.exitCode).toBe(0);
  });

  it('sets a config value', () => {
    const result = runConfig(['telemetry.enabled', 'true']);
    expect(result.exitCode).toBe(0);
    config.assertFieldEquals('telemetry.enabled', true);
  });

  it('gets a config value', () => {
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ telemetry: { enabled: true } }));
    const result = runConfig(['telemetry.enabled']);
    expect(result.exitCode).toBe(0);
  });

  it('fails for invalid key', () => {
    const result = runConfig(['nonexistent.path']);
    expect(result.exitCode).not.toBe(0);
  });

  it('fails for invalid value', () => {
    const result = runConfig(['telemetry.enabled', 'notaboolean']);
    expect(result.exitCode).not.toBe(0);
  });

  it('persists multiple values', () => {
    runConfig(['telemetry.enabled', 'true']);
    runConfig(['telemetry.audit', 'true']);
    config.assertFieldEquals('telemetry.enabled', true);
    config.assertFieldEquals('telemetry.audit', true);
  });
});
