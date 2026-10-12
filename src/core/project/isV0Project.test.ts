import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isV0Project } from "./isV0Project";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("isV0Project", () => {
  test.each([
    { contents: '{"version":1,"unsupported":true}', expected: true },
    { contents: '{"version":2}', expected: false },
    { contents: '{"version":"1"}', expected: false },
    { contents: '{"version":3}', expected: false },
    { contents: "null", expected: false },
    { contents: "{", expected: false },
    { contents: undefined, expected: false },
  ])(
    "detects legacy projects from a child directory: $contents",
    async ({ contents, expected }) => {
      const root = await mkdtemp(join(tmpdir(), "agentcore-v0-detection-"));
      directories.push(root);
      const child = join(root, "app", "runtime");
      const config = join(root, "agentcore", "agentcore.json");
      await Promise.all([
        mkdir(child, { recursive: true }),
        mkdir(join(root, "agentcore"), { recursive: true }),
      ]);
      if (contents !== undefined) await writeFile(config, contents);

      expect(await isV0Project(child)).toBe(expected);
      if (contents !== undefined) expect(await readFile(config, "utf8")).toBe(contents);
    },
  );

  test("ignores an unreadable project marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentcore-v0-detection-"));
    directories.push(root);
    await mkdir(join(root, "agentcore", "agentcore.json"), { recursive: true });

    expect(await isV0Project(root)).toBe(false);
  });
});
