import { type ChildProcess, execFile, spawn } from "node:child_process";
import z from "zod";

const KILL_GRACE_MS = 2000;
const STOP_TIMEOUT_MS = 10_000;
const TASKKILL_TIMEOUT_MS = 5000;

/** Given a CLI process, captures its standard output, error output, and exit code. */
export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/** Given an environment variable name, returns its required non-empty value. */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`missing environment variable for ${key}`);
  return value;
}

/** Given a command argument, returns a shell-safe representation for the current platform. */
function quoteShellArg(value: string): string {
  if (process.platform === "win32") {
    return `"${value.replaceAll('"', '\\"')}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Minimal abstraction to handle the running of CLI commands **/
export class CliRunner {
  constructor(private readonly command = requireEnv("AGENTCORE_CLI_PATH")) {}

  /** Given arguments and a working directory, runs the CLI and captures its result. */
  run(args: string[], cwd: string): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = this.start(args, cwd);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? -1 }));
    });
  }

  /** Given arguments and a working directory, starts the CLI and returns its child process. */
  start(args: string[], cwd: string) {
    const command = [this.command, ...args.map(quoteShellArg)].join(" ");
    return spawn(command, {
      cwd,
      detached: process.platform !== "win32",
      env: { ...process.env, AGENTCORE_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /** Given a running CLI process, terminates it and its descendants. */
  async stop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      if (processTreeAlive(child)) killProcessTree(child, "SIGKILL");
      return;
    }

    const closed = waitForClose(child);
    killProcessTree(child, "SIGTERM");
    const killTimer = setTimeout(() => killProcessTree(child, "SIGKILL"), KILL_GRACE_MS);
    killTimer.unref();

    try {
      await closed;
    } finally {
      clearTimeout(killTimer);
      if (processTreeAlive(child)) killProcessTree(child, "SIGKILL");
    }
  }
}

/** Given a child process and signal, terminates its process tree on the current platform. */
function killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      const taskkill = execFile(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { timeout: TASKKILL_TIMEOUT_MS, windowsHide: true },
        (error) => {
          if (error && child.exitCode === null && child.signalCode === null) child.kill(signal);
        },
      );
      taskkill.unref();
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

/** Given a child process, resolves on close or rejects after a bounded wait. */
function waitForClose(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onClose = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      child.removeListener("close", onClose);
      reject(
        new Error(
          `CLI process ${child.pid ?? "unknown"} did not exit within ${STOP_TIMEOUT_MS}ms.`,
        ),
      );
    }, STOP_TIMEOUT_MS);
    child.once("close", onClose);
  });
}

/** Given a child process, returns whether its POSIX process group still exists. */
function processTreeAlive(child: ChildProcess): boolean {
  if (process.platform === "win32" || !child.pid) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Given a Zod schema and CLI result, returns typed output or throws a diagnostic error. */
export function parseResult<TSchema extends z.ZodType>(
  schema: TSchema,
  result: RunResult,
): z.infer<TSchema> {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }

  const parseResult = schema.safeParse(JSON.parse(result.stdout));

  if (!parseResult.success) {
    throw new Error(
      `CLI output did not match expected. stdout: ${result.stdout}\nstderr: ${result.stderr}\n` +
        `error: ${z.prettifyError(parseResult.error)}`,
    );
  }

  return parseResult.data;
}
