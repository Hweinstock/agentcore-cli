import { once } from './function';
import { describe, expect, it, vi } from 'vitest';

describe('once', () => {
  it('calls the function on first invocation', () => {
    const fn = vi.fn(() => 42);
    const wrapped = once(fn);
    expect(wrapped()).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns cached result on subsequent calls', () => {
    const fn = vi.fn(() => 'value');
    const wrapped = once(fn);
    wrapped();
    expect(wrapped()).toBe('value');
    expect(fn).toHaveBeenCalledOnce();
  });
});
