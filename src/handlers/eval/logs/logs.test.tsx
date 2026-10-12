import { describe, expect, test } from "bun:test";
import {
  createSilentLogger,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../testing";
import { createRootHandler } from "../../index";

const ID = "evaluation-1";
const SINCE = 1_709_391_000_000;
const LOG_SOURCE = { logGroupName: "/custom/evaluation-results" };
const EVENTS = [
  { timestamp: new Date(SINCE), message: "first result", logStreamName: "run-a" },
  { timestamp: new Date(SINCE + 1_000), message: "second result", logStreamName: "run-b" },
];

function setup(resource: "online-eval" | "batch-evaluation") {
  const core = new TestCoreClient();
  core.eval.logSource = LOG_SOURCE;
  core.observability.logEvents = EVENTS;
  const io = testIO();
  const root = createRootHandler(core, {
    io: io.io,
    logger: createSilentLogger(),
    globalConfigAccessor: new TestGlobalConfigAccessor(),
  });
  return {
    core,
    io,
    route: (flags: string[]) =>
      root.route([
        "node",
        "agentcore",
        "eval",
        resource,
        "logs",
        ...flags,
        "--region",
        "us-west-2",
      ]),
  };
}

describe.each([
  ["online-eval", "resourceOnlineEvaluationLogSource"],
  ["batch-evaluation", "resourceBatchEvaluationLogSource"],
] as const)("%s logs", (resource, sourceMethod) => {
  test("searches the resolved group and prints every record as JSON", async () => {
    const { core, io, route } = setup(resource);

    await route(["--id", ID, "--since", `${SINCE}`, "--json"]);

    expect(core.eval.calls[0]).toEqual({
      method: sourceMethod,
      args: [ID, { region: "us-west-2" }],
    });
    expect(core.observability.calls[0]?.method).toBe("searchLogs");
    expect(core.observability.calls[0]?.args[0]).toEqual(LOG_SOURCE);
    expect(
      io
        .stdout()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual(EVENTS.map((event) => ({ ...event, timestamp: event.timestamp.toISOString() })));
    expect(io.stderr()).toBe("");
  });

  test("tails the resolved group by default and announces it on stderr", async () => {
    const { core, io, route } = setup(resource);

    await route(["--id", ID]);

    expect(core.observability.calls[0]?.method).toBe("tailLogs");
    expect(core.observability.calls[0]?.args[0]).toEqual(LOG_SOURCE);
    expect(io.stdout()).toBe(
      EVENTS.map((event) => `${event.timestamp.toISOString()}  ${event.message}`).join("\n"),
    );
    expect(io.stderr()).toBe(`Streaming logs for ${resource} ${ID}... (Ctrl+C to stop)`);
  });
});

test("requires an explicit resource ID", async () => {
  const { route } = setup("online-eval");

  await expect(route(["--since", "1h"])).rejects.toThrow("required option '--id' not specified");
});
