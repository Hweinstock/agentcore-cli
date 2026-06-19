export function once<R>(fn: (...args: unknown[]) => R): () => R {
  let result: R;
  let called = false;

  return (...args: unknown[]) => {
    if (called) return result;
    result = fn(...args);
    called = true;
    return result;
  };
}
