import { collect, err, ok, wrap, wrapAsync } from './result';
import { describe, expect, it } from 'vitest';

describe('ok', () => {
  it('creates a success result with data', () => {
    const r = ok(42);
    expect(r.success).toBe(true);
    expect(r.unwrap()).toBe(42);
  });

  it('creates a void success result', () => {
    const r = ok();
    expect(r.success).toBe(true);
    expect(r.unwrap()).toBeUndefined();
  });
});

describe('err', () => {
  it('creates a failure result', () => {
    const r = err(new Error('fail'));
    expect(r.success).toBe(false);
    expect(r.error.message).toBe('fail');
  });

  it('unwrap throws the error', () => {
    const e = new Error('boom');
    expect(() => err(e).unwrap()).toThrow(e);
  });
});

describe('unwrapOr', () => {
  it('returns data for ok', () => {
    expect(ok(1).unwrapOr(99)).toBe(1);
  });

  it('returns fallback for err', () => {
    expect(err(new Error('x')).unwrapOr(99)).toBe(99);
  });
});

describe('map', () => {
  it('transforms ok value', () => {
    expect(
      ok(2)
        .map(x => x * 3)
        .unwrap()
    ).toBe(6);
  });

  it('catches exceptions in map fn', () => {
    const r = ok(1).map(() => {
      throw new Error('oops');
    });
    expect(r.success).toBe(false);
  });

  it('skips mapping on err', () => {
    expect(err(new Error('e')).map(() => 'never').success).toBe(false);
  });
});

describe('mapAsync', () => {
  it('transforms ok value asynchronously', async () => {
    const r = await ok(5).mapAsync(async x => x + 1);
    expect(r.unwrap()).toBe(6);
  });

  it('catches async exceptions', async () => {
    const r = await ok(1).mapAsync(async () => {
      throw new Error('async fail');
    });
    expect(r.success).toBe(false);
  });

  it('skips mapping on err', async () => {
    const r = await err(new Error('e')).mapAsync(async () => 'never');
    expect(r.success).toBe(false);
  });
});

describe('mapError', () => {
  it('transforms the error', () => {
    const r = err(new Error('orig')).mapError(e => new TypeError(e.message));
    expect(r.error).toBeInstanceOf(TypeError);
  });

  it('is a no-op on ok', () => {
    expect(
      ok(1)
        .mapError(() => new TypeError('x'))
        .unwrap()
    ).toBe(1);
  });
});

describe('collect', () => {
  it('collects all ok values', () => {
    expect(collect([ok(1), ok(2), ok(3)]).unwrap()).toEqual([1, 2, 3]);
  });

  it('returns first error', () => {
    const e = new Error('bad');
    const r = collect([ok(1), err(e), ok(3)]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe(e);
  });
});

describe('wrap', () => {
  it('wraps a successful function', () => {
    expect(wrap((x: number) => x + 1)(2).unwrap()).toBe(3);
  });

  it('wraps a throwing function', () => {
    expect(
      wrap(() => {
        throw new Error('fail');
      })().success
    ).toBe(false);
  });
});

describe('wrapAsync', () => {
  it('wraps a successful async function', async () => {
    const r = await wrapAsync(async (x: number) => x * 2)(4);
    expect(r.unwrap()).toBe(8);
  });

  it('wraps a rejecting async function', async () => {
    const r = await wrapAsync(async () => {
      throw new Error('reject');
    })();
    expect(r.success).toBe(false);
  });
});
