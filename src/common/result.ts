interface BaseResult<T = void, E extends Error = Error> {
  success: boolean;
  unwrapOr(fallback: T): T;
  unwrap(): T;

  map<P>(f: (input: T) => P): Result<P, E>;
  mapAsync<P>(f: (input: T) => Promise<P>): AsyncResult<P, E>;
}

class Ok<T> implements BaseResult<T> {
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
      const newData = fn(this.data);
      return new Ok(newData);
    } catch (e) {
      return new Err(e as Error);
    }
  }

  async mapAsync<P>(fn: (input: T) => Promise<P>): AsyncResult<P> {
    try {
      const newData = await fn(this.data);
      return new Ok(newData);
    } catch (e) {
      return new Err(e as Error);
    }
  }
}

class Err<E extends Error> implements BaseResult<void, E> {
  readonly success = false;

  constructor(readonly error: E) {}

  unwrap(): never {
    throw this.error;
  }

  unwrapOr<T>(fallback: T): T {
    return fallback;
  }

  map<P>(_f: (input: void) => P): Result<P, E> {
    return this;
  }

  async mapAsync<P>(_f: (input: void) => Promise<P>): AsyncResult<P, E> {
    return this;
  }
}

export type Result<T = void, E extends Error = Error> = Ok<T> | Err<E>;
export type AsyncResult<T = void, E extends Error = Error> = Promise<Result<T, E>>;

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

export type ResultWrapped<F extends (...args: never[]) => unknown> =
  ReturnType<F> extends Promise<infer T>
    ? (...args: Parameters<F>) => Promise<Result<Awaited<T>>>
    : (...args: Parameters<F>) => Result<ReturnType<F>>;

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
