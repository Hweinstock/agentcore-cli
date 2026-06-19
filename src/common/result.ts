export interface SuccessResult<T = void> {
  success: true;
  data: T;
}

export interface FailureResult<E extends Error = Error> {
  success: false;
  error: E;
}

export type Result<T = void, E extends Error = Error> = SuccessResult<T> | FailureResult<E>;

export function ok(): SuccessResult<void>;
export function ok<T>(data: T): SuccessResult<T>;
export function ok(data?: unknown) {
  return { success: true, data };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyResult = Result<any>;

export function err<E extends Error = Error>(error: E): FailureResult<E> {
  return { success: false, error };
}

export type ResultWrapped<F extends (...args: never[]) => unknown> =
  ReturnType<F> extends Promise<infer T>
    ? (...args: Parameters<F>) => Promise<Result<Awaited<T>>>
    : (...args: Parameters<F>) => Result<ReturnType<F>>;

export function wrapInResult<I extends unknown[], O>(
  handler: (...args: I) => Promise<O>
): (...args: I) => Promise<Result<O>>;
export function wrapInResult<I extends unknown[], O>(handler: (...args: I) => O): (...args: I) => Result<O>;
export function wrapInResult(handler: (...args: unknown[]) => unknown) {
  return (...args: unknown[]) => {
    try {
      const output = handler(...args);
      if (output instanceof Promise) {
        return output
          .then((v: unknown) => ok(v))
          .catch((e: unknown) => err(e instanceof Error ? e : new Error(String(e))));
      }
      return ok(output);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  };
}

export function unwrapResult<T>(r: Result<T>, fallback: T): T;
export function unwrapResult<T>(r: Result<T>): T | undefined;
export function unwrapResult<T>(r: Result<T>, fallback?: T): T | undefined {
  if (r.success) return r.data;
  if (fallback !== undefined) return fallback;
  throw r.error;
}

export function collectResults<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.success) return r;
    values.push(r.data);
  }
  return ok(values);
}
