class Ok<T> {
  readonly success = true;

  constructor(readonly data: T) {}

  unwrap(): T {
    return this.data;
  }

  unwrapOr(_fallback: T): T {
    return this.data;
  }

  map<P>(fn: (input: T) => P): Result<P> {
    try {
      return new Ok(fn(this.data));
    } catch (e) {
      return new Err(e as Error);
    }
  }

  async mapAsync<P>(fn: (input: T) => Promise<P>): AsyncResult<P> {
    try {
      return new Ok(await fn(this.data));
    } catch (e) {
      return new Err(e as Error);
    }
  }

  mapError<E2 extends Error>(_f: (originalError: Error) => E2): Ok<T> {
    return this;
  }
}

class Err<E extends Error = Error> {
  readonly success = false;

  constructor(readonly error: E) {}

  unwrap(): never {
    throw this.error;
  }

  unwrapOr<T>(fallback: T): T {
    return fallback;
  }

  map<P>(_f: (input: never) => P): Err<E> {
    return this;
  }

  async mapAsync<P>(_f: (input: never) => Promise<P>): Promise<Err<E>> {
    return this;
  }

  mapError<E2 extends Error>(f: (originalError: E) => E2): Err<E2> {
    return new Err(f(this.error));
  }
}

export type Result<T = void, E extends Error = Error> = Ok<T> | Err<E>;
export type AsyncResult<T = void, E extends Error = Error> = Promise<Result<T, E>>;

export type OkResult<T = void> = Ok<T>;
export type ErrResult<E extends Error = Error> = Err<E>;

export function err<E extends Error = Error>(error: E): Err<E> {
  return new Err(error);
}

export function ok(): Ok<undefined>;
export function ok<T>(data: T): Ok<T>;
export function ok<T>(data?: T): Ok<T | undefined> {
  return new Ok(data);
}

export function collect<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.success) return r;
    values.push(r.data);
  }
  return ok(values);
}

export type ResultWrapped<F extends (...args: never[]) => unknown, E extends Error = Error> =
  ReturnType<F> extends Promise<infer T>
    ? (...args: Parameters<F>) => Promise<Result<Awaited<T>, E>>
    : (...args: Parameters<F>) => Result<ReturnType<F>, E>;

export function wrap<I extends unknown[], O>(fn: (...args: I) => O): (...args: I) => Result<O> {
  return (...args) => {
    try {
      return new Ok(fn(...args));
    } catch (e) {
      return new Err(e as Error);
    }
  };
}

export function wrapAsync<I extends unknown[], O>(fn: (...args: I) => Promise<O>): (...args: I) => AsyncResult<O> {
  return async (...args) => {
    try {
      const output = await fn(...args);
      return new Ok(output);
    } catch (e) {
      return new Err(e as Error);
    }
  };
}
