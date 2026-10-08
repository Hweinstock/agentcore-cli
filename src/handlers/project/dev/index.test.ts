import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  InternalServerException,
  RuntimeClientError,
  ValidationException,
  type InvokeHarnessStreamOutput,
} from "@aws-sdk/client-bedrock-agentcore";
import type { GetHarnessResponse } from "@aws-sdk/client-bedrock-agentcore-control";
import type { ProjectRuntime } from "../../../projectSchemas/runtime";
import {
  InputValidationError,
  NotImplementedError,
  ResourceNotFoundError,
  SilentCLIError,
  UserCancellationError,
} from "../../../errors";
import type { HttpRequestHandler, PortChecker } from "../../../io";
import { GlobalConfigAccessorKey, ProjectKey, Router, ValueContext } from "../../../router";
import { TestCoreClient, TestGlobalConfigAccessor, testIO } from "../../../testing";
import { JsonRendererKey } from "../../../tui";
import { JsonKey, RegionKey } from "../../keys";
import type { DeployProjectInput, Project } from "../types";
import { ProjectSpecSchema } from "../../../projectSchemas/project";
import {
  BMA_POLICY_FILE,
  BMA_TEMPLATE_NAME,
  BMA_TEMPLATE_TAG_KEY,
  BMA_TEMPLATE_TAG_VALUE,
} from "../bma";
import { createDevProjectHandler, type DevProjectHandlerConfig } from ".";
import type { DevEnvironmentInput } from "./environment";
import type { DevEvent, DevRunner, DevServerInput, DevTraceCollector } from "./types";

function runtime(name = "orders", build: ProjectRuntime["build"] = "CodeZip"): ProjectRuntime {
  return {
    name,
    build,
    protocol: "HTTP",
    entrypoint: "main.py",
    codeLocation: `app/${name}`,
  } as ProjectRuntime;
}

function project(...runtimes: ProjectRuntime[]): Project {
  return {
    name: "test-project",
    rootPath: "/workspace/project",
    spec: { ...ProjectSpecSchema.parse({ name: "testProject", version: 2 }), runtimes },
  };
}

function bmaRuntime(overrides: Partial<ProjectRuntime> = {}): ProjectRuntime {
  return {
    ...runtime("environment", "Container"),
    tags: { [BMA_TEMPLATE_TAG_KEY]: BMA_TEMPLATE_TAG_VALUE },
    additionalPolicies: [BMA_POLICY_FILE],
    ...overrides,
  };
}

function captureRunner(events: DevEvent[] = []) {
  const inputs: DevServerInput[] = [];
  const runner: DevRunner = {
    run: async function* (input) {
      inputs.push(input);
      yield* events;
    },
  };
  return { runner, inputs };
}

/** A runner that emits `events` then stays alive until aborted, rejecting with the abort reason like the real process runner. */
function stayingRunner(events: DevEvent[] = []) {
  const inputs: DevServerInput[] = [];
  const runner: DevRunner = {
    run: async function* (input) {
      inputs.push(input);
      yield* events;
      if (!input.signal.aborted) {
        await new Promise<void>((resolve) =>
          input.signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      }
      throw input.signal.reason;
    },
  };
  return { runner, inputs };
}

function fakeCollector() {
  const starts: Parameters<DevProjectHandlerConfig["startTraceCollector"]>[0][] = [];
  const state = { closed: 0 };
  const collector: DevTraceCollector = {
    port: 43180,
    envVars: {
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:43180",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:43180/v1/traces",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
    },
    traces: { list: async () => [], get: async () => undefined },
    close: async () => {
      state.closed++;
    },
  };
  const start: DevProjectHandlerConfig["startTraceCollector"] = async (options) => {
    starts.push(options);
    return collector;
  };
  return { start, starts, state };
}

type HarnessOptions = {
  project?: Project;
  tty?: boolean;
  reloadedRuntimes?: ProjectRuntime[];
  codeZip?: ReturnType<typeof captureRunner>;
  container?: ReturnType<typeof captureRunner>;
  checkPort?: PortChecker;
  json?: boolean;
  loadEnvironment?: DevProjectHandlerConfig["loadDevEnvironment"];
  deployFailure?: Error;
  browserFailure?: Error;
};

function harness(options: HarnessOptions = {}) {
  const io = testIO();
  const ui = { starts: [] as { port?: number }[], opened: [] as string[], closed: 0 };
  const watchers: { path: string; onChange: () => void }[] = [];
  let capturedHandler: HttpRequestHandler | undefined;
  const codeZip = options.codeZip ?? captureRunner();
  const container = options.container ?? captureRunner();
  const collector = fakeCollector();
  const environmentInputs: DevEnvironmentInput[] = [];
  const deployments: { project: Project; input: DeployProjectInput }[] = [];
  const resolutions: Parameters<
    DevProjectHandlerConfig["projectManager"]["resolveDeployedResource"]
  >[1][] = [];
  const core = new TestCoreClient();
  const harnessClient = core.harness.setGetResponse({
    harness: { arn: "arn:aws:bedrock-agentcore:eu-west-1:111122223333:harness/test" },
  } as GetHarnessResponse);
  const projectManager = core.projectManager;
  projectManager.deploy = async function* (configuredProject, input) {
    deployments.push({ project: configuredProject, input });
    yield { type: "output", line: "Deploying harnesses" };
    if (options.deployFailure) throw options.deployFailure;
    return { outputs: {} };
  };
  projectManager.resolveTarget = async () => undefined;
  projectManager.resolveDeployedResource = async (_project, input) => {
    resolutions.push(input);
    return {
      resourceType: "harness",
      name: input.name,
      id: "harness-test",
      target: { name: input.target, account: "111122223333", region: "eu-west-1" },
      credentialProvider: async () => ({ accessKeyId: "test", secretAccessKey: "test" }),
    };
  };
  projectManager.resolve = async () =>
    options.reloadedRuntimes ? project(...options.reloadedRuntimes) : undefined;
  const handler = createDevProjectHandler({
    io: io.io,
    harness: harnessClient,
    runners: { CodeZip: codeZip.runner, Container: container.runner },
    loadDevEnvironment:
      options.loadEnvironment ??
      (async (input) => {
        environmentInputs.push(input);
        return { env: { FROM_LOADER: "yes" } };
      }),
    checkPort: options.checkPort ?? (async () => true),
    startTraceCollector: collector.start,
    startServer: async (requestHandler, serverOptions) => {
      capturedHandler = requestHandler;
      ui.starts.push({ port: serverOptions?.port });
      return {
        port: serverOptions?.port ?? 8081,
        close: async () => {
          ui.closed++;
        },
      };
    },
    openBrowser: async (url) => {
      ui.opened.push(url);
      if (options.browserFailure) throw options.browserFailure;
    },
    inspectorAssets: { read: async () => undefined },
    isInteractive: () => options.tty ?? false,
    watchFile: (path, onChange) => {
      watchers.push({ path, onChange });
    },
    projectManager,
    waitReady: async () => {
      await Bun.sleep(5);
    },
  });
  const ctx = ValueContext.EmptyContext()
    .withValue(GlobalConfigAccessorKey, new TestGlobalConfigAccessor())
    .withValue(ProjectKey, options.project ?? project(runtime()))
    .withValue(JsonKey, options.json ?? false)
    .withValue(RegionKey, "us-west-2")
    .withValue(JsonRendererKey, {
      renderJson: (data) => io.io.stdout.write(`${JSON.stringify(data, null, 2)}\n`),
      renderJsonLine: (data) => io.io.stdout.write(`${JSON.stringify(data)}\n`),
    });

  return {
    codeZip,
    container,
    collector,
    environmentInputs,
    deployments,
    resolutions,
    harnessClient,
    io,
    ui,
    watchers,
    inspectorHandler: () => capturedHandler,
    run: (
      flags: {
        agent?: string;
        port?: number;
        traces?: boolean;
        mode?: "browser" | "headless";
        target?: string;
        yes?: boolean;
        "skip-deploy"?: boolean;
        "ui-port"?: number;
      } = {},
    ) =>
      handler.handle(
        ctx,
        { traces: true, yes: false, "skip-deploy": false, mode: "headless", ...flags },
        {},
      ),
    route: (args: readonly string[]) =>
      new Router("agentcore", "test")
        .handler(handler)
        .route(["node", "agentcore", "dev", ...args], ctx),
  };
}

/** Ask the captured Inspector handler for the current agent status. */
async function inspectorStatus(subject: ReturnType<typeof harness>): Promise<{ name: string }[]> {
  const response = await inspectorRequest(subject, "/api/status");
  const status = JSON.parse(String(response.body)) as { agents: { name: string }[] };
  return status.agents;
}

describe("project dev selection and dispatch", () => {
  test.each([
    ["headless", undefined, project(bmaRuntime({ additionalPolicies: undefined }))],
    ["browser", undefined, project(bmaRuntime({ tags: undefined }))],
    [
      "headless",
      "environment",
      project(bmaRuntime({ tags: { [BMA_TEMPLATE_TAG_KEY]: "Custom" } }), runtime()),
    ],
    ["browser", "environment", project(bmaRuntime(), runtime())],
  ] as const)(
    "rejects unsupported BMA selection (%s, %s)",
    async (mode, agent, configuredProject) => {
      const subject = harness({ project: configuredProject });
      const pending = subject.run({ mode, agent });
      await expect(pending).rejects.toBeInstanceOf(NotImplementedError);
      await expect(pending).rejects.toMatchObject({ source: "user", exitCode: 1 });
      await expect(pending).rejects.toThrow(
        `Local dev is not supported for runtime 'environment' (${BMA_TEMPLATE_NAME})`,
      );
      expect(subject.codeZip.inputs).toHaveLength(0);
      expect(subject.container.inputs).toHaveLength(0);
      expect(subject.collector.starts).toHaveLength(0);
      expect(subject.ui.starts).toHaveLength(0);
    },
  );

  test.each([
    [project(), {}, "This project has no runtimes or harnesses", InputValidationError],
    [
      project(),
      { agent: "missing" },
      "This project has no runtimes or harnesses",
      InputValidationError,
    ],
    [
      project(runtime("orders"), runtime("support", "Container")),
      { port: 4567 },
      "--port applies to a single runtime. Use --agent to select one.",
      InputValidationError,
    ],
    [
      project(runtime("orders"), runtime("support", "Container")),
      { agent: "missing" },
      "Agent 'missing' was not found. Available agents: orders, support",
      ResourceNotFoundError,
    ],
  ] as const)(
    "rejects invalid runtime selection",
    async (configuredProject, flags, message, ErrorType) => {
      const pending = harness({ project: configuredProject }).run(flags);
      await expect(pending).rejects.toBeInstanceOf(ErrorType);
      await expect(pending).rejects.toThrow(message);
    },
  );

  test("loads the environment and dispatches the selected runtime", async () => {
    const subject = harness({
      project: project(bmaRuntime(), runtime("orders"), runtime("support", "Container")),
    });
    await subject.run({ agent: "support", port: 4567 });

    expect(subject.codeZip.inputs).toHaveLength(0);
    expect(subject.environmentInputs).toEqual([
      {
        projectRoot: "/workspace/project",
        runtime: expect.objectContaining({ name: "support" }),
        region: "us-west-2",
      },
    ]);
    expect(subject.container.inputs[0]).toMatchObject({
      projectRoot: "/workspace/project",
      port: 4567,
      env: {
        FROM_LOADER: "yes",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://host.docker.internal:43180",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://host.docker.internal:43180/v1/traces",
        OTEL_SERVICE_NAME: "support",
      },
      runtime: { name: "support", build: "Container" },
    });
    expect(subject.io.stderr()).not.toContain("Skipping runtime");
  });

  test("announces an automatically selected port", async () => {
    const checked: number[] = [];
    const subject = harness({
      checkPort: async (port) => {
        checked.push(port);
        return port === 8081;
      },
    });
    await subject.run({ agent: "orders" });

    expect(checked).toEqual([8080, 8081]);
    expect(subject.codeZip.inputs[0]?.port).toBe(8081);
    expect(subject.io.stderr()).toContain("Port 8080 is in use; using 8081.");
  });
});

describe("project dev headless multi-agent", () => {
  const twoRuntimes = () => project(runtime("orders"), runtime("support", "Container"));

  /** Start a headless multi-agent run and give its agents time to reach "running". */
  async function supervised(subject: ReturnType<typeof harness>) {
    const pending = subject.run();
    pending.catch(() => undefined);
    await Bun.sleep(30);
    return { pending };
  }

  test("supervises supported runtimes with attributed output and per-runtime env", async () => {
    const codeZip = stayingRunner([{ type: "stdout", line: "orders says hi" }]);
    const container = stayingRunner();
    const subject = harness({
      project: project(
        bmaRuntime({ tags: { [BMA_TEMPLATE_TAG_KEY]: "Custom" } }),
        runtime("orders"),
        runtime("support", "Container"),
      ),
      codeZip,
      container,
    });
    const { pending } = await supervised(subject);

    expect(subject.io.stderr()).toContain("Skipping runtime 'environment'");
    expect(codeZip.inputs).toHaveLength(1);
    expect(container.inputs).toHaveLength(1);
    expect(codeZip.inputs[0]!.env).toMatchObject({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:43180",
      OTEL_SERVICE_NAME: "orders",
    });
    expect(container.inputs[0]!.env).toMatchObject({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://host.docker.internal:43180",
      OTEL_SERVICE_NAME: "support",
    });
    expect(subject.io.stdout()).toContain("[orders] orders says hi");
    expect(subject.io.stderr()).toContain("Agent 'orders' is running on port");

    process.emit("SIGINT", "SIGINT");
    await expect(pending).rejects.toMatchObject({ exitCode: 130 });
    expect(subject.io.stderr()).not.toContain("crashed");
    expect(subject.collector.state.closed).toBe(1);
  });

  test("assigns distinct ports to runtimes launched together", async () => {
    const codeZip = stayingRunner();
    const container = stayingRunner();
    const subject = harness({ project: twoRuntimes(), codeZip, container });
    const { pending } = await supervised(subject);

    expect([codeZip.inputs[0]?.port, container.inputs[0]?.port]).toEqual([8080, 8081]);

    process.emit("SIGINT", "SIGINT");
    await expect(pending).rejects.toMatchObject({ exitCode: 130 });
  });

  test("one agent failing to start leaves the others running", async () => {
    const subject = harness({
      project: twoRuntimes(),
      codeZip: captureRunner([{ type: "status", message: "dying" }]),
      container: stayingRunner(),
    });
    const { pending } = await supervised(subject);

    expect(subject.io.stderr()).toContain("[orders] Agent 'orders' failed to start");
    expect(subject.io.stderr()).toContain("Agent 'support' is running on port");

    process.emit("SIGINT", "SIGINT");
    await pending.catch(() => undefined);
  });

  test("exits non-zero when every agent fails to start", async () => {
    const subject = harness({ project: twoRuntimes() });

    await expect(subject.run()).rejects.toBeInstanceOf(SilentCLIError);
    expect(subject.collector.state.closed).toBe(1);
  });
});

describe("project dev trace collection", () => {
  test("starts the collector, announces it, and points a CodeZip agent at loopback", async () => {
    const subject = harness();
    await subject.run({ agent: "orders" });

    expect(subject.collector.starts).toEqual([
      {
        tracesDirectory: join("/workspace/project", "agentcore", ".cli", "traces", "otlp"),
        host: "127.0.0.1",
        onError: expect.any(Function),
      },
    ]);
    expect(subject.io.stderr()).toContain("OTEL collector listening on port 43180");
    expect(subject.codeZip.inputs[0]?.env).toMatchObject({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:43180",
      OTEL_SERVICE_NAME: "orders",
    });
    expect(subject.collector.state.closed).toBe(1);
  });

  test("binds the collector to all interfaces so a container can reach it", async () => {
    const subject = harness({ project: project(runtime("support", "Container")) });
    await subject.run({ agent: "support" });

    expect(subject.collector.starts[0]?.host).toBe("0.0.0.0");
  });

  test("reports a trace-persistence failure once, not per failed export", async () => {
    const subject = harness();
    await subject.run({ agent: "orders" });

    const onError = subject.collector.starts[0]?.onError;
    onError?.(new Error("disk full"));
    onError?.(new Error("disk full"));

    const stderr = subject.io.stderr();
    expect(stderr).toContain("failed to persist traces");
    expect(stderr).toContain("disk full");
    expect(stderr.match(/failed to persist traces/g)).toHaveLength(1);
  });

  test("--no-traces skips the collector entirely", async () => {
    const subject = harness();
    await subject.run({ agent: "orders", traces: false });

    expect(subject.collector.starts).toHaveLength(0);
    expect(subject.codeZip.inputs[0]?.env).toEqual({ FROM_LOADER: "yes" });
  });

  test("a runtime with instrumentation disabled skips the collector", async () => {
    const disabled = { ...runtime(), instrumentation: { enableOtel: false } } as ProjectRuntime;
    const subject = harness({ project: project(disabled) });
    await subject.run({ agent: "orders" });

    expect(subject.collector.starts).toHaveLength(0);
    expect(subject.codeZip.inputs[0]?.env).toEqual({ FROM_LOADER: "yes" });
  });

  test("the collector is closed when the runner fails", async () => {
    const codeZip = captureRunner();
    codeZip.runner.run = async function* () {
      yield* [];
      throw new InputValidationError("runner failed");
    };
    const subject = harness({ codeZip });

    await expect(subject.run({ agent: "orders" })).rejects.toThrow("runner failed");
    expect(subject.collector.state.closed).toBe(1);
  });
});

// Return the pending command inside an object so awaiting startup does not wait for dev to exit.
async function runUi(subject: ReturnType<typeof harness>, args: readonly string[] = []) {
  const pending = subject.route(["--mode", "browser", ...args]);
  pending.catch(() => undefined);
  await Bun.sleep(10);
  expect(subject.ui.starts).toHaveLength(1);
  return { pending };
}

describe("project dev Inspector UI mode", () => {
  test("starts the Inspector, prints the URL, and opens the browser on a TTY", async () => {
    const subject = harness({ tty: true });
    const { pending } = await runUi(subject);

    expect(subject.ui.starts).toEqual([{ port: 8081 }]);
    expect(subject.io.stderr()).toContain("Agent Inspector running at http://127.0.0.1:8081");
    expect(subject.ui.opened).toEqual(["http://127.0.0.1:8081"]);

    process.emit("SIGINT", "SIGINT");
    await pending.catch(() => undefined);
    expect(subject.collector.state.closed).toBe(1);
  });

  test.each([{}, { tty: true, json: true }] as const)(
    "never opens a browser without a TTY or in JSON mode (%o)",
    async (options) => {
      const subject = harness(options);
      const { pending } = await runUi(subject);
      expect(subject.ui.opened).toEqual([]);
      process.emit("SIGINT", "SIGINT");
      await pending.catch(() => undefined);
    },
  );

  test("serves the Inspector API: status lists supported runtimes, none started", async () => {
    const subject = harness({
      project: project(bmaRuntime(), runtime("orders"), runtime("support", "Container")),
    });
    const { pending } = await runUi(subject);

    expect((await inspectorStatus(subject)).map((agent) => agent.name)).toEqual([
      "orders",
      "support",
    ]);
    expect(subject.codeZip.inputs).toHaveLength(0);

    process.emit("SIGINT", "SIGINT");
    await pending.catch(() => undefined);
  });

  test("agentcore.json edits reload the supervised agents", async () => {
    const subject = harness({
      reloadedRuntimes: [bmaRuntime({ tags: undefined }), runtime("orders"), runtime("payments")],
    });
    const { pending } = await runUi(subject);

    expect(subject.watchers[0]?.path).toBe(
      join("/workspace/project", "agentcore", "agentcore.json"),
    );
    subject.watchers[0]!.onChange();
    await Bun.sleep(5);

    expect((await inspectorStatus(subject)).map((agent) => agent.name)).toEqual([
      "orders",
      "payments",
    ]);
    expect(subject.io.stderr()).toContain("Reloaded agents from agentcore.json.");

    process.emit("SIGINT", "SIGINT");
    await pending.catch(() => undefined);
  });

  test("--agent narrows the supervised set", async () => {
    const subject = harness({
      project: harnessProject(
        ["harness"],
        [bmaRuntime(), runtime("orders"), runtime("support", "Container")],
      ),
    });
    const { pending } = await runUi(subject, ["--agent", "support"]);

    expect((await inspectorStatus(subject)).map((agent) => agent.name)).toEqual(["support"]);
    const status = await inspectorRequest(subject, "/api/status");
    expect(JSON.parse(String(status.body)).harnesses).toEqual([]);
    expect(subject.io.stderr()).not.toContain("Skipping runtime");

    process.emit("SIGINT", "SIGINT");
    await pending.catch(() => undefined);
  });

  test("an explicit --ui-port that is taken fails fast", async () => {
    const subject = harness({ checkPort: async () => false });
    await expect(subject.run({ mode: "browser", "ui-port": 9999 })).rejects.toThrow(
      "Port 9999 is already in use",
    );
  });
});

test("project dev renders attributed human and NDJSON output", async () => {
  const events: DevEvent[] = [
    { type: "status", message: "Starting" },
    { type: "stdout", line: "agent output" },
    { type: "stderr", line: "agent warning" },
  ];

  for (const json of [false, true]) {
    const subject = harness({
      project: project(bmaRuntime(), runtime()),
      codeZip: captureRunner(events),
      json,
    });
    await subject.run({ agent: "orders", traces: false });
    expect(subject.io.stdout()).toBe(
      json
        ? events.map((event) => JSON.stringify({ agent: "orders", ...event })).join("\n")
        : "[orders] agent output",
    );
    expect(subject.io.stderr()).toBe(json ? "" : "[orders] Starting\n[orders] agent warning");
  }
});

function harnessProject(
  names: readonly string[] = ["support"],
  runtimes: readonly ProjectRuntime[] = [],
): Project {
  const configured = project(...runtimes);
  configured.spec.harnesses = names.map((name) => ({ name, path: `harnesses/${name}` }));
  return configured;
}

async function inspectorRequest(subject: ReturnType<typeof harness>, url: string, body?: unknown) {
  return subject.inspectorHandler()!({
    method: body === undefined ? "GET" : "POST",
    url,
    headers: { host: "127.0.0.1:8081", "x-agentcore-local": "1" },
    body: Buffer.from(body === undefined ? "" : JSON.stringify(body)),
    signal: new AbortController().signal,
  });
}

describe("project dev harnesses", () => {
  test.each([
    { names: ["support"], args: [], json: false },
    { names: ["orders", "support"], args: ["--mode", "headless"], json: true },
    { names: ["support"], args: ["--skip-deploy"], json: true },
  ])("headless deploys and returns invoke guidance (%o)", async ({ names, args, json }) => {
    const subject = harness({ project: harnessProject(names), tty: true, json });
    await subject.route([...args]);
    const skipDeploy = args.some((arg) => arg === "--skip-deploy");
    expect(subject.deployments).toHaveLength(skipDeploy ? 0 : 1);
    expect(subject.ui.starts).toEqual([]);
    expect(subject.ui.opened).toEqual([]);
    expect(subject.codeZip.inputs).toEqual([]);
    expect(subject.io.stderr()).toContain("Next step:\n  agentcore invoke");
    if (json && !skipDeploy) {
      expect(JSON.parse(subject.io.stdout()).message).toContain("Deployed project");
    }
  });

  test.each([
    { names: ["support"], runtimes: [], args: [], selected: ["support"], json: false },
    {
      names: ["orders", "support"],
      runtimes: [],
      args: ["--target", "staging", "--ui-port", "9001", "--yes"],
      selected: ["orders", "support"],
      json: true,
    },
    {
      names: ["orders", "support"],
      runtimes: [runtime("runtime")],
      args: ["--agent", "support"],
      selected: ["support"],
      json: false,
    },
  ])("deploys then serves Inspector (%o)", async ({ names, runtimes, args, selected, json }) => {
    const configuredProject = harnessProject(names, runtimes);
    const subject = harness({ project: configuredProject, tty: true, json });
    const before = process.listenerCount("SIGTERM");
    const { pending } = await runUi(subject, args);
    try {
      const deployment = subject.deployments[0]!;
      expect(subject.deployments).toHaveLength(1);
      expect(deployment.project).toBe(configuredProject);
      expect(deployment.input.target).toBe(
        args.some((arg) => arg === "staging") ? "staging" : "default",
      );
      const response = await inspectorRequest(subject, "/api/status");
      const status = JSON.parse(String(response.body));
      expect(status.agents).toEqual([]);
      expect(status.harnesses.map(({ name }: { name: string }) => name)).toEqual(selected);
      expect(subject.ui.starts[0]?.port).toBe(args.some((arg) => arg === "9001") ? 9001 : 8081);
      expect(subject.ui.opened).toEqual(
        json ? [] : [`http://127.0.0.1:${subject.ui.starts[0]?.port}`],
      );
      expect(subject.codeZip.inputs).toHaveLength(0);
      expect(subject.collector.starts).toHaveLength(0);
    } finally {
      process.emit("SIGTERM", "SIGTERM");
      await expect(pending).rejects.toBeInstanceOf(UserCancellationError);
    }
    expect(subject.ui.closed).toBe(1);
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  test.each([
    { args: ["--port=8080"] },
    { args: ["--no-traces"] },
    { args: ["--port=8080", "--no-traces"] },
  ])("rejects runtime flags on harness dev: %o", async ({ args }) => {
    const subject = harness({ project: harnessProject() });
    await expect(subject.route(args)).rejects.toThrow("does not apply to harness dev");
    expect(subject.deployments).toHaveLength(0);
  });

  test.each([
    { args: ["--target=default"] },
    { args: ["--yes"] },
    { args: ["--skip-deploy"] },
    { args: ["--target=default", "--yes", "--skip-deploy"] },
  ])("rejects harness flags on runtime dev: %o", async ({ args }) => {
    const subject = harness();
    await expect(subject.route(args)).rejects.toThrow("does not apply to runtime dev");
    expect(subject.codeZip.inputs).toHaveLength(0);
  });

  test("mixed projects require an unambiguous agent and can choose the runtime path", async () => {
    const subject = harness({ project: harnessProject(["support"], [runtime("orders")]) });
    await expect(subject.route([])).rejects.toThrow("Pass --agent <name>");
    await expect(subject.route(["--agent", "missing"])).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    await subject.route(["--agent", "orders", "--no-traces"]);
    expect(subject.codeZip.inputs).toHaveLength(1);
    expect(subject.deployments).toHaveLength(0);
    await expect(
      harness({ project: harnessProject(["orders"], [runtime("orders")]) }).route([
        "--agent",
        "orders",
      ]),
    ).rejects.toThrow("names both a runtime and a harness");
  });

  test.each([
    { deployFailure: new Error("deployment failed"), message: "deployment failed", closed: 0 },
    { checkPort: async () => false, message: "Port 9999 is already in use", closed: 0 },
    { browserFailure: new Error("browser failed"), message: "browser failed", closed: 1 },
  ])("cleans up harness startup failures (%o)", async ({ message, closed, ...options }) => {
    const before = process.listenerCount("SIGINT");
    const subject = harness({ ...options, project: harnessProject(), tty: true });
    await expect(subject.route(["--mode", "browser", "--ui-port", "9999"])).rejects.toThrow(
      message,
    );
    expect(subject.ui.closed).toBe(closed);
    expect(process.listenerCount("SIGINT")).toBe(before);
  });

  test("Inspector invokes the deployed target and streams harness events and errors", async () => {
    const subject = harness({ project: harnessProject(), tty: true });
    const toolUse = { toolUseId: "search-1", name: "search" };
    const toolResult = { toolUseId: "search-1", status: "success" as const };
    const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
    const stream: InvokeHarnessStreamOutput[] = [
      { messageStart: { role: "assistant" } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Hello" } } },
      { contentBlockStart: { contentBlockIndex: 1, start: { toolUse } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: "{}" } } } },
      { contentBlockStart: { contentBlockIndex: 2, start: { toolResult } } },
      {
        contentBlockDelta: { contentBlockIndex: 2, delta: { toolResult: [{ text: "Found it" }] } },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 3,
          delta: { reasoningContent: { text: "Thinking" } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 3 } },
      { messageStop: { stopReason: "end_turn" } },
      { metadata: { usage, metrics: { latencyMs: 1 } } },
      {
        internalServerException: new InternalServerException({
          message: "internal error",
          $metadata: {},
        }),
      },
      {
        validationException: new ValidationException({
          message: "validation error",
          reason: undefined,
          $metadata: {},
        }),
      },
      { runtimeClientError: new RuntimeClientError({ message: "runtime error", $metadata: {} }) },
    ];
    subject.harnessClient.queueInvokeStream(
      (async function* () {
        yield* stream;
        throw new Error("stream disconnected");
      })(),
    );
    const { pending } = await runUi(subject, ["--target", "staging", "--skip-deploy"]);
    try {
      const request = {
        harnessName: "support",
        prompt: "Hello",
        userId: "user",
        harnessOverrides: {
          systemPrompt: "Be helpful",
          maxIterations: 3,
          harnessArn: "wrong-arn",
          runtimeSessionId: "wrong-session",
          messages: [],
        },
      };
      const response = await inspectorRequest(subject, "/invocations", request);
      expect(response.status).toBe(200);
      expect(response.headers?.["Content-Type"]).toBe("text/event-stream");
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) chunks.push(chunk);
      const events = Buffer.concat(chunks)
        .toString()
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)));
      expect(events).toContainEqual({
        type: "contentBlockDelta",
        contentBlockIndex: 0,
        delta: { type: "text", text: "Hello" },
      });
      expect(events).toContainEqual({
        type: "contentBlockStart",
        contentBlockIndex: 1,
        start: { type: "toolUse", toolUse },
      });
      expect(events).toContainEqual({
        type: "contentBlockStart",
        contentBlockIndex: 2,
        start: { type: "toolResult", toolResult },
      });
      expect(events).toContainEqual({
        type: "contentBlockDelta",
        contentBlockIndex: 2,
        delta: { type: "toolResult", results: [{ text: "Found it" }] },
      });
      expect(events).toContainEqual({ type: "metadata", usage, metrics: { latencyMs: 1 } });
      expect(events.filter(({ type }) => type === "error")).toEqual([
        { type: "error", errorType: "internalServerException", message: "internal error" },
        { type: "error", errorType: "validationException", message: "validation error" },
        { type: "error", errorType: "runtimeClientError", message: "runtime error" },
        { type: "error", errorType: "invocationError", message: "stream disconnected" },
      ]);
      expect(subject.deployments).toHaveLength(0);
      expect(subject.ui.opened).toEqual(["http://127.0.0.1:8081"]);
      expect(subject.resolutions).toEqual([
        { target: "staging", resourceType: "harness", name: "support" },
      ]);
      expect(
        subject.harnessClient.calls
          .find(({ method }) => method === "invokeHarness")
          ?.args.slice(0, 2),
      ).toMatchObject([
        {
          harnessArn: "arn:aws:bedrock-agentcore:eu-west-1:111122223333:harness/test",
          runtimeSessionId: response.headers?.["x-session-id"],
          runtimeUserId: "user",
          messages: [{ role: "user", content: [{ text: "Hello" }] }],
          systemPrompt: [{ text: "Be helpful" }],
          maxIterations: 3,
        },
        { region: "eu-west-1", credentials: expect.any(Function) },
      ]);
      for (const [body, status] of [
        [{ harnessName: 1, prompt: "Hello" }, 400],
        [{ harnessName: "support", prompt: "" }, 400],
        [{ harnessName: "missing", prompt: "Hello" }, 404],
      ] as const) {
        expect((await inspectorRequest(subject, "/invocations", body)).status).toBe(status);
      }
      subject.harnessClient.setGetResponse({} as GetHarnessResponse);
      expect((await inspectorRequest(subject, "/invocations", request)).status).toBe(502);
      subject.harnessClient.setError(new Error("service unavailable"));
      expect((await inspectorRequest(subject, "/invocations", request)).status).toBe(502);
    } finally {
      process.emit("SIGINT", "SIGINT");
      await pending.catch(() => undefined);
    }
    const signal = subject.harnessClient.calls.find(({ method }) => method === "invokeHarness")
      ?.args[2] as AbortSignal;
    expect(signal.aborted).toBe(true);
  });
});

function heldRunner() {
  let start!: (input: DevServerInput) => void;
  let release: (() => void) | undefined;
  const started = new Promise<DevServerInput>((resolve) => (start = resolve));
  const runner: DevRunner = {
    run: async function* (input) {
      yield* [];
      start(input);
      await new Promise<void>((resolve) => (release = resolve));
      input.signal.throwIfAborted();
    },
  };
  return { runner, inputs: [], started, release: () => release?.() };
}

describe("project dev interruption", () => {
  test.each(["SIGINT", "SIGTERM"] as const)(
    "%s aborts, reports exit 130, and removes its listener",
    async (signal) => {
      const codeZip = heldRunner();
      const before = process.listenerCount(signal);
      const subject = harness({ codeZip });
      const pending = subject.run({ agent: "orders" });
      const input = await codeZip.started;

      process.emit(signal, signal);
      process.emit(signal, signal);
      codeZip.release();

      expect(input.signal.aborted).toBe(true);
      expect(input.signal.reason).toBeInstanceOf(UserCancellationError);
      await expect(pending).rejects.toBe(input.signal.reason);
      expect((input.signal.reason as UserCancellationError).exitCode).toBe(130);
      // Traces are on by default, so the collector's "listening" line precedes this.
      expect(subject.io.stderr()).toContain("Shutting down…");
      expect(subject.collector.state.closed).toBe(1);
      expect(process.listenerCount(signal)).toBe(before);
    },
  );

  test("preserves an ordinary runner failure", async () => {
    const failure = new InputValidationError("runner failed");
    const codeZip = captureRunner();
    codeZip.runner.run = async function* () {
      yield* [];
      throw failure;
    };

    await expect(harness({ codeZip }).run({ agent: "orders" })).rejects.toBe(failure);
  });
});
