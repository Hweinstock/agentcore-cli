import { test as bunTest, type TestOptions } from "bun:test";

type TestMode = "serial" | "concurrent";

export type E2ETestOptions = TestOptions & {
  mode?: TestMode;
  tags?: readonly string[];
};

const selectedTags = new Set(
  (process.env.E2E_TAGS ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
);

type TestRegistrar = {
  (name: string, fn: (...args: any[]) => void | Promise<unknown>, options?: TestOptions): void;
  each<T>(table: readonly T[]): TestRegistrar;
};

/** Given the test tags, determines whether the test should be registered. */
function shouldRegister(tags?: readonly string[]): boolean {
  return selectedTags.size === 0 || tags?.some((tag) => selectedTags.has(tag)) === true;
}

/** Given a test mode, returns Bun's matching test registrar. */
function registrar(mode?: TestMode): TestRegistrar {
  switch (mode) {
    case "serial":
      return bunTest.serial;
    case "concurrent":
      return bunTest.concurrent;
    default:
      return bunTest;
  }
}

/** Given a Bun registrar, register the test when it matches the input tags */
function register(
  registerTest: TestRegistrar,
  name: string,
  testFn: (...args: any[]) => void | Promise<unknown>,
  options?: E2ETestOptions,
): void {
  if (!shouldRegister(options?.tags)) return;

  const { mode: _mode, tags: _tags, ...bunOptions } = options ?? {};
  registerTest(name, testFn, bunOptions);
}

/** Given a name, function, and options, registers a selected E2E test. */
export function test(
  name: string,
  fn: () => void | Promise<unknown>,
  options?: E2ETestOptions,
): void {
  register(registrar(options?.mode), name, fn, options);
}

export namespace test {
  /** Given a table, returns a tagged E2E test registrar for each row. */
  export function each<T>(table: readonly T[]) {
    return (
      name: string,
      fn: (value: T) => void | Promise<unknown>,
      options?: E2ETestOptions,
    ): void => {
      register(registrar(options?.mode).each(table), name, fn, options);
    };
  }
}
