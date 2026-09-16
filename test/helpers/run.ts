import { spawn, type ChildProcessByStdio } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const COMPILED_TARGETS: Record<string, string> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-arm64": "linux-arm64",
  "linux-x64": "linux-x64",
  "win32-arm64": "windows-arm64",
  "win32-x64": "windows-x64",
};

export type RunResult = { stdout: string; stderr: string; exitCode: number };
export type CliProcess = ChildProcessByStdio<null, Readable, Readable>;

export function compiledCliPath(): string {
  const target = COMPILED_TARGETS[`${process.platform}-${process.arch}`];
  if (!target) {
    throw new Error(`Unsupported e2e platform: ${process.platform}-${process.arch}`);
  }
  return join(
    REPO_ROOT,
    "dist",
    "bin",
    `agentcore-${target}${process.platform === "win32" ? ".exe" : ""}`,
  );
}

export class CliRunner {
  constructor(private readonly executable: string) {}

  run(args: string[], cwd?: string): Promise<RunResult> {
    return new Promise((resolvePromise, reject) => {
      const child = this.start(args, cwd);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (exitCode) => resolvePromise({ stdout, stderr, exitCode: exitCode ?? -1 }));
    });
  }

  start(args: string[], cwd?: string): CliProcess {
    return spawn(this.executable, args, {
      cwd,
      env: { ...process.env, AGENTCORE_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
}
