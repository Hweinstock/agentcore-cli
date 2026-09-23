import { afterAll, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CliRunner } from "./run";

const scriptsDir = await mkdtemp(join(tmpdir(), "agentcore-e2e-runner-"));

afterAll(() => rm(scriptsDir, { recursive: true, force: true }));

test("stop terminates shell-spawned descendants", async () => {
  const parentScript = join(scriptsDir, "process-tree.cjs");
  const pidFile = join(scriptsDir, "descendant.pid");
  await writeFile(
    parentScript,
    [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'process.on(\"SIGTERM\", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "writeFileSync(process.argv[2], String(child.pid));",
      "process.on('SIGTERM', () => {});",
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );

  const cli = new CliRunner("node");
  const parent = cli.start([parentScript, pidFile], scriptsDir);
  let descendantPid: number | undefined;

  try {
    descendantPid = await reportedPid(pidFile);
    await cli.stop(parent);
    expect(await processStopped(descendantPid)).toBe(true);
  } finally {
    await cli.stop(parent).catch(() => {});
    if (descendantPid !== undefined && processRunning(descendantPid)) forceStop(descendantPid);
  }
}, 20_000);

/** Given a PID file path, resolves once a spawned process reports its descendant. */
async function reportedPid(path: string): Promise<number> {
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      return Number(readFileSync(path, "utf8"));
    } catch {
      await delay(10);
    }
  }
  throw new Error("process did not report a child PID");
}

/** Given a process ID, returns whether the process stops within one second. */
async function processStopped(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!processRunning(pid)) return true;
    await delay(10);
  }
  return false;
}

/** Given a process ID, returns whether it is still executable. */
function processRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(") ") + 2, stat.lastIndexOf(") ") + 3) !== "Z";
    }
    return true;
  } catch {
    return false;
  }
}

/** Given a process ID, forcibly terminates it on the current platform. */
function forceStop(pid: number): void {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5000,
    });
    return;
  }
  process.kill(pid, "SIGKILL");
}
