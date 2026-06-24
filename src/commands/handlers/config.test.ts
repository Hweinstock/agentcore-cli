import { ValidationError } from '../../common';
import { getTestCommandContext } from '../testing';
import { configCommand } from './config';
import { describe, expect, it } from 'vitest';

describe('config handler', () => {
  it('returns all config when no key is provided', async () => {
    const context = getTestCommandContext();
    const result = await configCommand.handler(context, {});

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({});
  });

  it('gets a specific config value', async () => {
    const context = getTestCommandContext();
    await context.globalConfigAccessor.set('telemetry.enabled', true);

    const result = await configCommand.handler(context, { key: 'telemetry.enabled' });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(true);
  });

  it('sets a config value', async () => {
    const context = getTestCommandContext();
    const result = await configCommand.handler(context, { key: 'telemetry.enabled', value: 'true' });

    result.unwrap();

    const getResult = await context.globalConfigAccessor.get('telemetry.enabled');
    expect(getResult.success && getResult.data.value).toBe(true);
  });

  it('returns error for invalid key', async () => {
    const context = getTestCommandContext();
    const result = await configCommand.handler(context, { key: 'nonexistent.path' });

    expect(() => result.unwrap()).toThrow(ValidationError);
  });

  it('returns error for invalid value', async () => {
    const context = getTestCommandContext();
    const result = await configCommand.handler(context, { key: 'telemetry.enabled', value: 'notaboolean' });

    expect(() => result.unwrap()).toThrow(ValidationError);
  });
});
