import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = join(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), "dist", "index.js");

export type RunResult = { stdout: string; stderr: string; exitCode: number };

export function run(args: string[], cwd?: string): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [cli, ...args], {
      cwd,
      env: { ...process.env, AGENTCORE_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => resolvePromise({ stdout, stderr, exitCode: exitCode ?? -1 }));
  });
}
