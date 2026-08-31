import { test, expect, describe } from "bun:test";
import { CoreClient } from "../../core";
import { createRootHandler } from "../index";
import {
  createSilentLogger,
  fixtureFactories,
  TestGlobalConfigAccessor,
  testIO,
  type TestIOOptions,
} from "../../testing";
import { InputValidationError, UserCancellationError } from "../../errors";
import { join } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

// Command-flow tests for `agentcore feedback`. The Aperture POST/PUT calls go
// through an injected `fetch` stub (feedback is the one Core path outside the SDK
// seam), so these run offline and assert the exact HTTP the client makes.

const REGION = "us-east-1";
const FIXTURES = join(import.meta.dir, "__fixtures__");

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

// stubFetch answers the three Aperture calls (presign POST, S3 PUT, form POST)
// and records each so tests can assert the request shape.
function stubFetch(calls: Recorded[]) {
  const presignedUrl =
    "https://aperture-bucket.s3.us-east-1.amazonaws.com/us-east-1/AgentCore/CLI/0.1.0/13052026/abc-123.png?X-Amz-Signature=sig";
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body,
    });
    if (url.includes("/presignedurl")) {
      return new Response(presignedUrl, { status: 200 });
    }
    if (url.includes("/form")) {
      return new Response(
        JSON.stringify({
          id: "11111111-2222-3333-4444-555555555555",
          timestamp: "2026-08-31T00:00:00Z",
          reference: "agentcore-cli",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(null, { status: 200 }); // the S3 PUT
  }) as unknown as typeof fetch;
}

async function run(
  args: string[],
  opts: { io?: TestIOOptions; calls?: Recorded[] } = {},
): Promise<{ stdout: string; stderr: string }> {
  const factories = fixtureFactories(FIXTURES);
  const core = new CoreClient({
    ...factories,
    logger: createSilentLogger(),
    fetch: stubFetch(opts.calls ?? []),
  });
  const io = testIO(opts.io);
  const root = createRootHandler(core, {
    io: io.io,
    logger: createSilentLogger(),
    globalConfigAccessor: new TestGlobalConfigAccessor(),
  });
  await root.route(["node", "agentcore", "feedback", ...args, "--region", REGION]);
  return { stdout: io.stdout(), stderr: io.stderr() };
}

describe("feedback", () => {
  test("--yes --json submits and prints the result envelope", async () => {
    const calls: Recorded[] = [];
    const { stdout } = await run(["great tool", "--yes", "--json"], { calls });
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe("11111111-2222-3333-4444-555555555555");
    // Text-only: exactly one call, the form POST.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/form");
    expect(calls[0]!.method).toBe("POST");
  });

  test("prompts on a TTY and submits on 'y'", async () => {
    const calls: Recorded[] = [];
    const { stderr } = await run(["nice cli"], { io: { isTTY: true, stdin: "y\n" }, calls });
    expect(stderr).toContain("AWS Customer Agreement");
    expect(stderr).toContain("Submit feedback? (y/N)");
    expect(calls).toHaveLength(1);
  });

  test("declining the prompt cancels without submitting", async () => {
    const calls: Recorded[] = [];
    await expect(
      run(["nope"], { io: { isTTY: true, stdin: "n\n" }, calls }),
    ).rejects.toBeInstanceOf(UserCancellationError);
    expect(calls).toHaveLength(0);
  });

  test("non-interactive without --yes fails and does not submit", async () => {
    const calls: Recorded[] = [];
    const removal = run(["headless"], { calls });
    await expect(removal).rejects.toBeInstanceOf(InputValidationError);
    await expect(run(["headless"], { calls: [] })).rejects.toThrow(/--yes/);
    expect(calls).toHaveLength(0);
  });

  test("an empty message is rejected before any network call", async () => {
    const calls: Recorded[] = [];
    await expect(run(["   ", "--yes"], { calls })).rejects.toThrow(/cannot be empty/);
    expect(calls).toHaveLength(0);
  });

  test("a message over 1000 chars is rejected", async () => {
    const calls: Recorded[] = [];
    await expect(run(["x".repeat(1001), "--yes"], { calls })).rejects.toThrow(/1000 characters/);
    expect(calls).toHaveLength(0);
  });

  test("a screenshot drives presign -> S3 PUT (checksum + tag) -> form POST", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentcore-fb-"));
    const shot = join(dir, "shot.png");
    await writeFile(shot, Buffer.from("iVBORw0KGgoAAAANSUhEUgAA", "base64"));

    const calls: Recorded[] = [];
    const { stdout } = await run(["with shot", "--screenshot", shot, "--yes", "--json"], { calls });
    expect(JSON.parse(stdout).success).toBe(true);

    expect(
      calls.map(
        (c) =>
          `${c.method} ${c.url.includes("/presignedurl") ? "presign" : c.url.includes("/form") ? "form" : "s3"}`,
      ),
    ).toEqual(["POST presign", "PUT s3", "POST form"]);
    const put = calls[1]!;
    expect(put.headers["x-amz-checksum-algorithm"]).toBe("SHA256");
    expect(put.headers["x-amz-tagging"]).toBe("scanstatus=NOT_SCANNED");
    // The form references the exact object key parsed from the presigned URL path.
    const form = JSON.parse(String(calls[2]!.body));
    const attachment = form.customerResponses.find(
      (r: { response: { responseType: string } }) => r.response.responseType === "fileUpload",
    );
    expect(attachment.response.responseValue).toEqual([
      "us-east-1/AgentCore/CLI/0.1.0/13052026/abc-123.png",
    ]);
  });
});
