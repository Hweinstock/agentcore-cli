import { getInMemoryProject, getTestCommandContext } from '../../../testing';
import { addGatewayCommand } from './gateway';
import { describe, expect, it } from 'vitest';

describe('add gateway handler', () => {
  it('adds gateway to config', async () => {
    const project = getInMemoryProject();
    const context = getTestCommandContext({ project });
    const result = await addGatewayCommand.handler(context, { name: 'my-gateway' });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    // TODO: actually assert that the default fields are filled
    expect(configResult.success && configResult.data.config.gateways).toContain('my-gateway');
  });
});
