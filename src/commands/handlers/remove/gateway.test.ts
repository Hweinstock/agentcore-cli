import { getInMemoryProject, getTestCommandContext } from '../../../testing';
import { removeGatewayCommand } from './gateway';
import { describe, expect, it } from 'vitest';

describe('remove gateway handler', () => {
  it('removes gateway from config', async () => {
    const project = getInMemoryProject();
    await project.config.add('gateways', 'my-gateway');
    const context = getTestCommandContext({ project });

    const result = await removeGatewayCommand.handler(context, { name: 'my-gateway' });

    expect(result.success).toBe(true);
    const configResult = await project.config.all();
    expect(configResult.success && configResult.data.config.gateways).not.toContain('my-gateway');
  });
});
