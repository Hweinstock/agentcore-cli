import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { CoreClient } from "../../core";
import { createRootHandler } from "../index";
import {
  createSilentLogger,
  fixtureFactories,
  fixtureFetch,
  matchGolden,
  TestGlobalConfigAccessor,
  testIO,
  type TestIOOptions,
} from "../../testing";
import { UserCancellationError } from "../../errors";

// Record with: RECORD=1 bun test src/handlers/feedback/feedback.fixture.test.tsx
//
// The two "submits …" tests are WRITES: a record run posts a REAL feedback
// submission to the Aperture public API (and, for the screenshot case, uploads
// shot.png through a real presigned S3 PUT) — there is no undo, same as the
// batch-evaluation evaluate/simulate fixtures that submit real jobs. After a
// record run, strip the X-Amz-* query from the recorded presign Fetch fixture
// so no signed URL is committed (the object-path key it replays on is unchanged).
// Every other run replays the committed fixtures offline.
//
// Aperture is the one Core path outside the AWS SDK `.send()` seam, so it is
// driven through the injected `fetch` (fixtureFetch) rather than the SDK
// factories. Each submit test uses its own fixture subdir because fixtureFetch
// keys on method+path only, and both submits POST to the same /form path.
const REGION = "us-east-1";
const FIXTURES = join(import.meta.dir, "__fixtures__");
const SHOT = join(FIXTURES, "shot.png");

function createFixtureCore(fetchDir: string): CoreClient {
  const { createControlClient, createDataClient, createIamClient, createLogsClient } =
    fixtureFactories(FIXTURES);
  return new CoreClient({
    createControlClient,
    createDataClient,
    createIamClient,
    createLogsClient,
    logger: createSilentLogger(),
    fetch: fixtureFetch(join(FIXTURES, fetchDir)),
  });
}

// run drives the real router (parsing → consent → handler → CoreClient →
// Aperture fetch) against the fixture-backed clients and returns captured IO.
async function run(
  args: string[],
  opts: { fetchDir?: string; io?: TestIOOptions } = {},
): Promise<{ stdout: string; stderr: string }> {
  const io = testIO(opts.io);
  const root = createRootHandler(createFixtureCore(opts.fetchDir ?? "unused"), {
    io: io.io,
    logger: createSilentLogger(),
    globalConfigAccessor: new TestGlobalConfigAccessor(),
  });
  await root.route(["node", "agentcore", "feedback", ...args, "--region", REGION]);
  return { stdout: io.stdout(), stderr: io.stderr() };
}

describe("feedback (fixture-backed)", () => {
  test("submits text-only feedback and prints the result envelope", async () => {
    const { stdout } = await run(
      ["[agentcore-cli golden fixture] text submit — please ignore", "--yes", "--json"],
      { fetchDir: "submit-text" },
    );

    matchGolden(FIXTURES, "submit-text.golden.json", stdout);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(typeof result.id).toBe("string");
    expect(result.reference).toBe("agentcore-cli");
  }, 120_000);

  test("submits feedback with a screenshot (presign → S3 PUT → form)", async () => {
    const { stdout } = await run(
      [
        "[agentcore-cli golden fixture] screenshot submit — please ignore",
        "--screenshot",
        SHOT,
        "--yes",
        "--json",
      ],
      { fetchDir: "submit-screenshot" },
    );

    matchGolden(FIXTURES, "submit-screenshot.golden.json", stdout);
    expect(JSON.parse(stdout).success).toBe(true);
  }, 120_000);

  // ── validation / consent errors (no network, no fixtures — like batch-evaluation's not-found) ──

  test("without --yes and without a TTY it fails rather than submitting", async () => {
    await expect(run(["headless", "--json"])).rejects.toThrow(/--yes/);
  });

  test("declining the consent prompt cancels", async () => {
    await expect(run(["no thanks"], { io: { isTTY: true, stdin: "n\n" } })).rejects.toBeInstanceOf(
      UserCancellationError,
    );
  });

  test("an empty message is rejected", async () => {
    await expect(run(["   ", "--yes"])).rejects.toThrow(/cannot be empty/);
  });

  test("a message over 1000 characters is rejected", async () => {
    await expect(run(["x".repeat(1001), "--yes"])).rejects.toThrow(/1000 characters/);
  });

  test("an explicitly-empty --screenshot is rejected", async () => {
    await expect(run(["msg", "--screenshot", "", "--yes"])).rejects.toThrow(
      /--screenshot requires a file path/,
    );
  });
});
