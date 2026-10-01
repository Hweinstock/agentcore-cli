import { FRAMEWORK_OPTIONS } from '../types.js';
import { describe, expect, it } from 'vitest';

describe('agent template choices', () => {
  it('displays environment-python-bma with the stable BMA selection identity', () => {
    expect(FRAMEWORK_OPTIONS).toContainEqual(
      expect.objectContaining({ id: 'BedrockManagedAgents', title: 'environment-python-bma' })
    );
  });
});
