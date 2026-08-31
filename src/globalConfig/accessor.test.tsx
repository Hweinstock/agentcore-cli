import { test, describe, beforeEach, afterEach, expect } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DefaultGlobalConfigAccessor } from "./accessor";
import { FsReadWriteJson, type ReadWriteJson } from "../io";
import { createSilentLogger } from "../testing";

describe("DefaultGlobalConfigAccessor.isFirstRun", () => {
  let tempDir: string;
  let filePath: string;

  const createAccessor = (json?: ReadWriteJson) => {
    const logger = createSilentLogger();
    return new DefaultGlobalConfigAccessor({
      logger,
      filePath,
      json: json ?? new FsReadWriteJson({ logger }),
    });
  };

  const writeRaw = (contents: string) => writeFile(filePath, contents);

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "global-config-test-"));
    filePath = join(tempDir, "config.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test.each([
    ["no config file exists", undefined],
    ["config file has no installationId", JSON.stringify({ telemetry: { enabled: true } })],
    ["config file contains unparseable json", "{ broken"],
  ] as const)("returns true when %s", async (_label, contents) => {
    if (contents !== undefined) await writeRaw(contents);

    expect(await createAccessor().isFirstRun()).toBe(true);
  });

  test("returns false when an installationId is already persisted", async () => {
    await writeRaw(JSON.stringify({ installationId: "00000000-0000-0000-0000-000000000000" }));

    expect(await createAccessor().isFirstRun()).toBe(false);
  });

  test("returns false when a persisted config exists but is unreadable", async () => {
    // An existing install whose config can't be read (e.g. permissions) must not
    // be treated as a first run, otherwise it would be nagged on every command.
    const unreadableJson: ReadWriteJson = {
      read: () => Promise.reject(new Error("EACCES: permission denied")),
      write: <TData extends object>(_path: string, data: TData) => Promise.resolve(data),
    };

    expect(await createAccessor(unreadableJson).isFirstRun()).toBe(false);
  });

  test("stays true across get(), regardless of call order", async () => {
    const accessor = createAccessor();

    // get() persists an installationId as a side effect on first run; neither
    // calling isFirstRun() before nor after get() may be fooled by it.
    expect(await accessor.isFirstRun()).toBe(true);
    await accessor.get();
    expect(await accessor.isFirstRun()).toBe(true);
  });
});
