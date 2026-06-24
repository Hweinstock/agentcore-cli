import { tryParseJson } from './json';
import { describe, expect, it } from 'vitest';

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    const result = tryParseJson('{"a":1}');
    expect(result.unwrap()).toEqual({ a: 1 });
  });

  it('returns error for invalid JSON without fallback', () => {
    const result = tryParseJson('not json');
    expect(result.success).toBe(false);
  });

  it('returns ok(fallback) for invalid JSON with fallback', () => {
    const result = tryParseJson('not json', 'default');
    expect(result.unwrap()).toBe('default');
  });

  it('returns parsed value even when fallback is provided', () => {
    const result = tryParseJson('"hello"', 'fallback');
    expect(result.unwrap()).toBe('hello');
  });

  it('parses "true" as a boolean', () => {
    const result = tryParseJson('true');
    expect(result.unwrap()).toBe(true);
  });
});
