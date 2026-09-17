import { spawn } from "node:child_process";

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`missing environment variable for ${key}`);
  return value;
}

function quoteShellArg(value: string): string {
  if (process.platform === "win32") {
    return `"${value.replaceAll('"', '\\"')}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export class CliRunner {
  private readonly command = requireEnv("AGENTCORE_CLI_PATH");

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

  start(args: string[], cwd: string) {
    const command = [this.command, ...args.map(quoteShellArg)].join(" ");
    return spawn(command, {
      cwd,
      env: { ...process.env, AGENTCORE_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
}
