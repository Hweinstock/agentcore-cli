import { AgentCoreCLIError, ExitCode, SilentCLIError, UserCancellationError } from "../errors";

/** Runs a headless operation with process interrupts mapped to UserCancellationError. */
export async function withUserCancellation<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: { onCancel?: () => void } = {},
): Promise<T> {
  const controller = new AbortController();
  const signals = ["SIGINT", "SIGTERM"] as const;
  const interrupt = () => {
    if (controller.signal.aborted) return;
    options.onCancel?.();
    controller.abort(new UserCancellationError());
  };
  // Ink's signal-exit handler must see our listener until cancellation cleanup settles.
  for (const signal of signals) process.on(signal, interrupt);
  try {
    const result = await fn(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    controller.signal.throwIfAborted();
    throw error;
  } finally {
    controller.abort();
    for (const signal of signals) process.off(signal, interrupt);
  }
}

// Runnable can be implemented by any application's main entrypoint.
export interface Runnable {
  run(argv: string[]): Promise<void>;
}

// runRunnable creates and runs any instance of Runnable with proper exit code handling.
export function runRunnable(
  createRunnable: () => Runnable,
  argv: string[] = process.argv,
): Promise<number> {
  return runWithExitCode(async () => {
    await createRunnable().run(argv);
  });
}

// runWithExitCode safely runs the given function with exit code handling.
export async function runWithExitCode(
  fn: (argv: string[]) => Promise<void>,
  argv: string[] = process.argv,
): Promise<number> {
  try {
    await fn(argv);
    return ExitCode.SUCCESS;
  } catch (caught) {
    const error = AgentCoreCLIError.fromError(caught);
    if (!(error instanceof SilentCLIError)) console.error(`Error: ${error.message}`);
    return error.exitCode;
  }
}
