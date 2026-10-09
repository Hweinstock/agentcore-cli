import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentCoreCLIError, UserCancellationError } from "../../../errors/errors";
import { PACKAGE_VERSION } from "../../../constants";
import { createRootHandler } from "../../index";
import { DEFAULT_GLOBAL_CONFIG } from "../../../globalConfig";
import { CommandRunMetricEventKey, ValueContext } from "../../../router";
import { DefaultTelemetryClient } from "../../../telemetry";
import { FileSystemSink } from "../../../telemetry/fileSystemSink";
import {
  createSilentLogger,
  initProject,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../testing";
import type { DeployBackendInput, ProjectBackend } from "../../../core/project";
import type { AwsDeploymentTarget } from "../../../projectSchemas/aws-targets";
import type { DeployResult, Project, ProjectEvent, TeardownConfirmationRequest } from "../types";

const DEFAULT_TARGET: AwsDeploymentTarget = {
  name: "default",
  account: "111122223333",
  region: "us-east-1",
};
const STAGING_TARGET: AwsDeploymentTarget = {
  name: "staging",
  account: "444455556666",
  region: "eu-west-1",
};
const TARGETS = [DEFAULT_TARGET, STAGING_TARGET];
const TEARDOWN: TeardownConfirmationRequest = {
  projectName: "orders",
  targetName: "default",
  resourceDescription: "stack 'AgentCore-orders-default-0' and every resource in it",
  account: DEFAULT_TARGET.account,
  region: DEFAULT_TARGET.region,
};
const TEARDOWN_PROMPT =
  "Deploying will delete everything deployed to target 'default' (111122223333/us-east-1). " +
  "Continue? (y/N)";
const EMPTY_RESOURCE_COUNTS = {
  project_runtime_count: 0,
  project_memory_count: 0,
  project_knowledge_base_count: 0,
  project_credential_count: 0,
  project_evaluator_count: 0,
  project_online_eval_config_count: 0,
  project_gateway_count: 0,
  project_tool_runtime_count: 0,
  project_policy_engine_count: 0,
  project_config_bundle_count: 0,
  project_harness_count: 0,
  project_payment_manager_count: 0,
  project_gateway_target_count: 0,
  project_policy_count: 0,
  project_runtime_endpoint_count: 0,
  project_payment_connector_count: 0,
  project_memory_strategy_count: 0,
  project_knowledge_base_data_source_count: 0,
};
const DEFAULT_RESOURCE_COUNTS = { ...EMPTY_RESOURCE_COUNTS, project_harness_count: 1 };
const POPULATED_RESOURCE_COUNTS = {
  project_runtime_count: 3,
  project_memory_count: 1,
  project_knowledge_base_count: 2,
  project_credential_count: 4,
  project_evaluator_count: 5,
  project_online_eval_config_count: 6,
  project_gateway_count: 7,
  project_tool_runtime_count: 8,
  project_policy_engine_count: 9,
  project_config_bundle_count: 10,
  project_harness_count: 11,
  project_payment_manager_count: 12,
  project_gateway_target_count: 10,
  project_policy_count: 13,
  project_runtime_endpoint_count: 3,
  project_payment_connector_count: 18,
  project_memory_strategy_count: 2,
  project_knowledge_base_data_source_count: 3,
};

/**
 * A ProjectBackend that deploys successfully, which CdkBackend cannot do until
 * CDK deployment is implemented. Stubbing the backend rather than the whole
 * manager keeps the real FsProjectManager in the path, so target resolution and
 * withProject run for real.
 */
function fakeBackend(
  result: DeployResult,
  events: ProjectEvent[] = [],
  teardown?: TeardownConfirmationRequest,
  failure?: Error,
) {
  const calls: { project: Project; input: DeployBackendInput }[] = [];
  const confirmations: boolean[] = [];
  const backend: ProjectBackend = {
    async *build() {},
    async *deploy(project, input) {
      calls.push({ project, input });
      if (teardown) {
        const confirmed = await input.confirmTeardown(teardown);
        confirmations.push(confirmed);
        if (!confirmed) {
          throw new Error("Re-run with --yes to confirm the teardown.");
        }
      }
      yield* events;
      if (failure) throw failure;
      return result;
    },
    async resolveDeployedResources() {
      return [];
    },
    async resolveProjectResources() {
      return [];
    },
  };
  return { calls, confirmations, backend };
}

type TestDeployOptions = {
  isTTY?: boolean;
  stdin?: string;
  teardown?: TeardownConfirmationRequest;
  /** Thrown by the fake backend after its events, to exercise failure paths. */
  failure?: Error;
  resolveAccount?: (region: string) => Promise<string>;
  /** Seeds the global config's transactionSearch flag (defaults to on). */
  transactionSearch?: boolean;
};

function testDeployCommand(
  result: DeployResult,
  events: ProjectEvent[] = [],
  options: TestDeployOptions = {},
) {
  const io = testIO({ isTTY: options.isTTY, stdin: options.stdin });
  const fake = fakeBackend(result, events, options.teardown, options.failure);
  const core = new TestCoreClient({
    backends: { CDK: fake.backend },
    resolveAccount: options.resolveAccount,
  });
  const logger = createSilentLogger();
  const globalConfigAccessor = new TestGlobalConfigAccessor(
    options.transactionSearch === undefined
      ? undefined
      : {
          initialConfigData: {
            ...DEFAULT_GLOBAL_CONFIG,
            transactionSearch: options.transactionSearch,
          },
        },
  );
  const telemetryDirectory = mkdtemp(join(tmpdir(), "agentcore-deploy-telemetry-"));
  cleanups.push(async () => {
    await rm(await telemetryDirectory, { recursive: true, force: true });
  });
  const auditFilePath = telemetryDirectory.then((directory) => join(directory, "audit.jsonl"));
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor,
    logger,
  });

  return {
    ...fake,
    io,
    run: async (args: string[] = []) => {
      const sessionId = crypto.randomUUID();
      const fileSystemSink = new FileSystemSink({
        logger,
        filePath: await auditFilePath,
        resourceAttributes: {
          "service.name": "agentcore-cli",
          "service.version": PACKAGE_VERSION,
          "agentcore-cli.installation_id": "00000000-0000-0000-0000-000000000000",
          "agentcore-cli.session_id": sessionId,
          "os.type": os.type(),
          "os.version": os.release(),
          "host.arch": os.arch(),
          "node.version": process.version,
        },
      });
      const telemetryClient = new DefaultTelemetryClient({
        logger,
        sessionId,
        globalConfigAccessor,
        currentVersion: PACKAGE_VERSION,
        metricSinks: [fileSystemSink],
      });
      const metricEvent = telemetryClient.createMetricEvent("cli.command_run", {
        exit_reason: "success",
      });
      const ctx = ValueContext.EmptyContext().withValue(CommandRunMetricEventKey, metricEvent);
      const startTime = Date.now();
      try {
        await root.route(["node", "agentcore", "deploy", ...args], ctx);
      } catch (cause) {
        const error = AgentCoreCLIError.fromError(cause);
        if (error.exitCode !== 0) {
          metricEvent.setAttributes({
            exit_reason: "failure",
            error_name: error.name,
            error_source: error.source,
          });
        }
        throw cause;
      } finally {
        await metricEvent.emit(Date.now() - startTime);
        await telemetryClient.shutdown();
      }
    },
    telemetryAttributes: async () => {
      const entries = (await readFile(await auditFilePath, "utf8"))
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        metricName: "cli.command_run",
        value: expect.any(Number),
      });
      return entries[0].attrs;
    },
  };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(() => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

/** Scaffolds a project whose aws-targets.json holds exactly `contents`, and cds into it. */
async function inProjectWithTargets(contents: string = JSON.stringify(TARGETS)): Promise<string> {
  const { projectRoot, cleanup } = await initProject({ name: "orders" });
  cleanups.push(cleanup);
  await writeFile(join(projectRoot, "agentcore", "aws-targets.json"), contents);
  return projectRoot;
}

/**
 * Rewrites the spec so it declares no resources — what remove --all leaves —
 * which is the up-front signal the deploy handler prompts for a teardown on.
 */
async function emptyProjectSpec(projectRoot: string): Promise<void> {
  await writeFile(
    join(projectRoot, "agentcore", "agentcore.json"),
    JSON.stringify({ name: "orders", version: 2 }),
  );
}

async function populatedProjectSpec(projectRoot: string): Promise<void> {
  const resources = <T extends object>(
    count: number,
    namePrefix: string,
    fields: (index: number) => T,
  ) =>
    Array.from({ length: count }, (_, index) => ({
      name: `${namePrefix}${index}`,
      ...fields(index),
    }));
  await writeFile(
    join(projectRoot, "agentcore", "agentcore.json"),
    JSON.stringify({
      name: "orders",
      version: 2,
      runtimes: resources(3, "Runtime", (index) => ({
        build: "CodeZip",
        entrypoint: "main.py",
        codeLocation: "app/agent",
        runtimeVersion: "PYTHON_3_12",
        endpoints:
          index === 2
            ? undefined
            : {
                LIVE: { version: 1 },
                ...(index === 1 ? { STAGING: { version: 2 } } : {}),
              },
      })),
      memories: resources(1, "Memory", () => ({
        eventExpiryDuration: 30,
        strategies: [{ type: "SEMANTIC" }, { type: "SUMMARIZATION" }],
      })),
      knowledgeBases: resources(2, "Knowledge", (index) => ({
        dataSources: Array.from({ length: index + 1 }, (_, sourceIndex) => ({
          type: "S3",
          uri: `s3://test-bucket/documents${sourceIndex}`,
        })),
      })),
      credentials: resources(4, "Credential", () => ({
        authorizerType: "ApiKeyCredentialProvider",
      })),
      evaluators: resources(5, "Evaluator", () => ({
        level: "SESSION",
        config: {
          codeBased: {
            external: {
              lambdaArn: "arn:aws:lambda:us-east-1:111122223333:function:evaluator",
            },
          },
        },
      })),
      onlineEvalConfigs: resources(6, "Quality", () => ({
        logGroupNames: ["/aws/agentcore/test"],
        evaluators: ["Builtin.Helpfulness"],
        samplingRate: 10,
      })),
      agentCoreGateways: resources(7, "Gateway", (index) => ({
        protocolType: "None",
        targets: resources((index % 2) + 1, "Target", () => ({
          targetType: "httpRuntime",
          httpRuntime: { runtime: "Runtime0" },
        })),
      })),
      toolRuntimes: resources(8, "Tool", () => ({
        toolDefinition: {
          name: "search",
          description: "Search catalog",
          inputSchema: { type: "object" },
        },
        compute: {
          host: "AgentCoreRuntime",
          implementation: { language: "Python", path: "tools", handler: "handler.main" },
        },
      })),
      policyEngines: resources(9, "PolicyEngine", (index) => ({
        policies: resources((index % 2) + 1, "Policy", () => ({
          statement: "permit(principal, action, resource);",
        })),
      })),
      configBundles: resources(10, "Bundle", () => ({ components: {} })),
      harnesses: resources(11, "Harness", () => ({ path: "app/harness" })),
      payments: resources(12, "Payment", (index) => ({
        connectors: resources((index % 2) + 1, "Connector", () => ({
          provider: "CoinbaseCDP",
          provisionMode: "QUICK_CREATE",
        })),
      })),
    }),
  );
}

describe("project deploy handler", () => {
  test("defaults to the default target and keeps progress off stdout", async () => {
    const subject = testDeployCommand(
      { outputs: { ZetaUrl: "https://zeta.example", AlphaArn: "arn:alpha" } },
      [
        { type: "step", message: "Preparing deployment" },
        { type: "output", line: "CREATE_IN_PROGRESS | AWS::IAM::Role" },
        { type: "step", message: "Deploying stack" },
      ],
    );
    const projectRoot = await inProjectWithTargets();
    await populatedProjectSpec(projectRoot);

    await subject.run();

    expect(await subject.telemetryAttributes()).toMatchObject({
      command_path: "/agentcore/deploy",
      exit_reason: "success",
      ...POPULATED_RESOURCE_COUNTS,
    });
    expect(subject.calls).toHaveLength(1);
    expect(subject.calls[0]?.input.target).toEqual(DEFAULT_TARGET);
    expect(subject.io.stderr()).toContain("Preparing deployment\nDeploying stack");
    // Output lines belong to the debug log outside a TTY, not the plain stream.
    expect(subject.io.stderr()).not.toContain("CREATE_IN_PROGRESS");
    expect(subject.io.stderr()).toContain("Deployed project 'orders' to target 'default'");
    expect(subject.io.stderr()).toContain("Next step:\n  agentcore invoke");
    // Stack outputs are rendered only with --json; without it stdout stays empty.
    expect(subject.io.stdout()).toBe("");
  });

  test("passes the global config's transactionSearch flag into the deploy", async () => {
    const enabled = testDeployCommand({ outputs: {} });
    await inProjectWithTargets();
    await enabled.run();
    expect(enabled.calls[0]?.input.transactionSearch).toBe(true);

    const disabled = testDeployCommand({ outputs: {} }, [], { transactionSearch: false });
    await inProjectWithTargets();
    await disabled.run();
    expect(disabled.calls[0]?.input.transactionSearch).toBe(false);
  });

  test("passes an explicit target and renders the result as JSON", async () => {
    const result = { outputs: { ServiceUrl: "https://service.example" } };
    const subject = testDeployCommand(result);
    await inProjectWithTargets();

    await subject.run(["--target", "staging", "--json"]);

    expect(subject.calls).toHaveLength(1);
    expect(subject.calls[0]?.input.target).toEqual(STAGING_TARGET);
    expect(JSON.parse(subject.io.stdout())).toEqual({
      message: "Deployed project 'orders' to target 'staging'",
      ...result,
    });
    expect(subject.io.stderr()).not.toContain("Next step");
  });

  test("renders a teardown result as JSON with the removal message", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true });
    await inProjectWithTargets();

    await subject.run(["--yes", "--json"]);

    expect(JSON.parse(subject.io.stdout())).toEqual({
      message: "Removed project 'orders' from target 'default'",
      outputs: {},
      tornDown: true,
    });
  });

  test("renders a deploy failure as JSON without changing the thrown error", async () => {
    const subject = testDeployCommand({ outputs: {} }, [], {
      failure: new Error("The stack failed creation: ROLLBACK_COMPLETE"),
    });
    await inProjectWithTargets();

    await expect(subject.run(["--json"])).rejects.toThrow("ROLLBACK_COMPLETE");

    expect(await subject.telemetryAttributes()).toMatchObject({
      command_path: "/agentcore/deploy",
      exit_reason: "failure",
      ...DEFAULT_RESOURCE_COUNTS,
    });
    expect(JSON.parse(subject.io.stdout())).toEqual({
      error: "The stack failed creation: ROLLBACK_COMPLETE",
    });
  });

  // --yes is the only way to authorize the teardown the backend refuses without
  // it, so a flag that never reaches the backend would make it unreachable.
  test("carries --yes through as permission to tear the stack down", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      isTTY: true,
      stdin: "\n",
      teardown: TEARDOWN,
    });
    await inProjectWithTargets();

    await subject.run(["--yes"]);

    expect(subject.confirmations).toEqual([true]);
    expect(subject.io.stderr()).not.toContain("(y/N)");
  });

  // The prompt is settled before the deploy generator starts (and before any
  // progress UI could own the terminal), so it fires on the spec declaring
  // nothing deployable rather than on the backend's post-synth discovery.
  test("prompts before tearing down and proceeds on yes", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      isTTY: true,
      stdin: "yes\n",
      teardown: TEARDOWN,
    });
    const projectRoot = await inProjectWithTargets();
    await emptyProjectSpec(projectRoot);

    await subject.run();

    expect(await subject.telemetryAttributes()).toMatchObject({
      command_path: "/agentcore/deploy",
      exit_reason: "success",
      ...EMPTY_RESOURCE_COUNTS,
    });
    expect(subject.io.stderr()).toContain("Project 'orders' declares no resources to deploy.");
    expect(subject.io.stderr()).toContain(TEARDOWN_PROMPT);
    expect(subject.confirmations).toEqual([true]);
    expect(subject.io.stderr()).toContain("Removed project 'orders' from target 'default'");
  });

  test.each([
    ["no", "n\n"],
    ["the default", "\n"],
  ])("does not tear down when the user chooses %s", async (_label, stdin) => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      isTTY: true,
      stdin,
      teardown: TEARDOWN,
    });
    const projectRoot = await inProjectWithTargets();
    await emptyProjectSpec(projectRoot);

    await expect(subject.run()).rejects.toBeInstanceOf(UserCancellationError);

    expect(await subject.telemetryAttributes()).toMatchObject({
      command_path: "/agentcore/deploy",
      exit_reason: "failure",
      ...EMPTY_RESOURCE_COUNTS,
    });
    expect(subject.io.stderr()).toContain("(y/N)");
    // Declined before the generator started: the backend never ran.
    expect(subject.calls).toEqual([]);
    expect(subject.io.stderr()).not.toContain("Removed project");
  });

  test("cancels when interactive input closes without an answer", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      isTTY: true,
      stdin: "",
      teardown: TEARDOWN,
    });
    const projectRoot = await inProjectWithTargets();
    await emptyProjectSpec(projectRoot);

    await expect(subject.run()).rejects.toBeInstanceOf(UserCancellationError);

    expect(await subject.telemetryAttributes()).toMatchObject({
      command_path: "/agentcore/deploy",
      exit_reason: "failure",
      ...EMPTY_RESOURCE_COUNTS,
    });
    expect(subject.calls).toEqual([]);
    expect(subject.io.stderr()).not.toContain("Removed project");
  });

  // The spec-level check can miss (a hand-edited CDK app can synthesize an
  // empty template from a non-empty spec); the backend's post-synth count is
  // the backstop, and by then the answer must already be no.
  test("falls back to requiring --yes when only synthesis reveals the teardown", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      isTTY: true,
      stdin: "yes\n",
      teardown: TEARDOWN,
    });
    await inProjectWithTargets();

    await expect(subject.run()).rejects.toThrow(/--yes/);

    expect(subject.io.stderr()).not.toContain("(y/N)");
    expect(subject.confirmations).toEqual([false]);
  });

  test("requires --yes instead of prompting in a non-interactive shell", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      stdin: "yes\n",
      teardown: TEARDOWN,
    });
    await inProjectWithTargets();

    await expect(subject.run()).rejects.toThrow(/--yes/);

    expect(subject.io.stderr()).not.toContain("(y/N)");
    expect(subject.confirmations).toEqual([false]);
  });

  test("requires --yes instead of prompting in JSON mode", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [], {
      isTTY: true,
      stdin: "yes\n",
      teardown: TEARDOWN,
    });
    await inProjectWithTargets();

    await expect(subject.run(["--json"])).rejects.toThrow(/--yes/);

    expect(subject.io.stderr()).not.toContain("(y/N)");
    expect(subject.confirmations).toEqual([false]);
    // JSON mode reports the refusal on stdout too, so scripts need not parse stderr.
    expect(JSON.parse(subject.io.stdout())).toEqual({
      error: expect.stringContaining("--yes"),
    });
  });

  test("does not prompt for a normal deployment", async () => {
    const subject = testDeployCommand({ outputs: { RuntimeArn: "arn:runtime" } }, [], {
      isTTY: true,
      stdin: "yes\n",
    });
    await inProjectWithTargets();

    await subject.run();

    expect(subject.io.stderr()).not.toContain("(y/N)");
  });

  test("says the project was removed when the deploy tore the stack down", async () => {
    const subject = testDeployCommand({ outputs: {}, tornDown: true }, [
      { type: "step", message: "Removing stack AgentCore-orders-default" },
    ]);
    await inProjectWithTargets();

    await subject.run(["--yes"]);

    expect(subject.io.stderr()).toContain("Removing stack AgentCore-orders-default");
    expect(subject.io.stderr()).toContain("Removed project 'orders' from target 'default'");
    // "Deployed" would be the wrong word for a stack that no longer exists.
    expect(subject.io.stderr()).not.toContain("Deployed project");
    // There is nothing left to invoke.
    expect(subject.io.stderr()).not.toContain("agentcore invoke");
  });

  test("rejects an unknown target without invoking the backend", async () => {
    const subject = testDeployCommand({ outputs: {} });
    await inProjectWithTargets();

    await expect(subject.run(["--target", "nope"])).rejects.toThrow(
      /no deployment target named 'nope'/,
    );
    expect(subject.calls).toEqual([]);
  });

  test("requires deployment targets to be configured for a named target", async () => {
    const subject = testDeployCommand({ outputs: {} });
    await inProjectWithTargets(JSON.stringify([]));

    await expect(subject.run(["--target", "staging"])).rejects.toThrow(
      /No deployment targets are configured/,
    );
    expect(subject.calls).toEqual([]);
  });

  // The zero-configuration path: a fresh project's aws-targets.json is [], so
  // the first deploy must invent the default target rather than demand edits.
  test("creates the default target from the environment on first deploy", async () => {
    const subject = testDeployCommand({ outputs: { RuntimeArn: "arn:runtime" } });
    const projectRoot = await inProjectWithTargets(JSON.stringify([]));

    await subject.run(["--region", "us-west-2"]);

    expect(subject.calls).toHaveLength(1);
    expect(subject.calls[0]?.input.target).toEqual({
      name: "default",
      account: "111122223333",
      region: "us-west-2",
    });
    expect(subject.io.stderr()).toContain(
      "Created default deployment target: account 111122223333, region us-west-2",
    );
    expect(subject.io.stderr()).toContain("Deployed project 'orders' to target 'default'");
    expect(await Bun.file(join(projectRoot, "agentcore", "aws-targets.json")).json()).toEqual([
      { name: "default", account: "111122223333", region: "us-west-2" },
    ]);
  });

  test("rejects an unsupported region instead of writing an invalid target", async () => {
    const subject = testDeployCommand({ outputs: {} });
    const projectRoot = await inProjectWithTargets(JSON.stringify([]));

    const message = await messageFrom(subject.run(["--region", "af-south-1"]));

    expect(message).toContain("'af-south-1' is not an AgentCore-supported region");
    expect(message).toContain("us-east-1");
    expect(subject.calls).toEqual([]);
    expect(await Bun.file(join(projectRoot, "agentcore", "aws-targets.json")).text()).toBe("[]");
  });

  test("explains how to fix unresolvable credentials", async () => {
    const subject = testDeployCommand({ outputs: {} }, [], {
      resolveAccount: async () => {
        throw new Error("Could not load credentials from any providers");
      },
    });
    await inProjectWithTargets(JSON.stringify([]));

    const message = await messageFrom(subject.run(["--region", "us-east-1"]));

    expect(message).toContain("Could not load credentials from any providers");
    expect(message).toContain("aws login");
    expect(subject.calls).toEqual([]);
  });
});

/** The message the user would see on stderr, since the reporter prints only that. */
async function messageFrom(command: Promise<void>): Promise<string> {
  try {
    await command;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the command to fail");
}

describe("project deploy reports which field of aws-targets.json is wrong", () => {
  test("names the offending field for an unsupported region", async () => {
    const subject = testDeployCommand({ outputs: {} });
    await inProjectWithTargets(
      JSON.stringify([{ name: "default", account: "111122223333", region: "us-east-11" }]),
    );

    const message = await messageFrom(subject.run());

    expect(message).toContain("aws-targets.json");
    expect(message).toContain("at [0].region");
    expect(message).toContain('"us-east-1"');
    expect(subject.calls).toEqual([]);
  });

  test("surfaces the duplicate target name", async () => {
    const subject = testDeployCommand({ outputs: {} });
    await inProjectWithTargets(JSON.stringify([DEFAULT_TARGET, DEFAULT_TARGET]));

    await expect(subject.run()).rejects.toThrow(
      /Duplicate deployment target name \(ignoring case\): default/,
    );
    expect(subject.calls).toEqual([]);
  });

  test("surfaces the account id rule", async () => {
    const subject = testDeployCommand({ outputs: {} });
    await inProjectWithTargets(
      JSON.stringify([{ name: "default", account: "123", region: "us-east-1" }]),
    );

    await expect(subject.run()).rejects.toThrow(/AWS account ID must be exactly 12 digits/);
    expect(subject.calls).toEqual([]);
  });

  test("surfaces the parse error for malformed json", async () => {
    const subject = testDeployCommand({ outputs: {} });
    await inProjectWithTargets('[{ "name": "default", }]');

    await expect(subject.run()).rejects.toThrow(/JSON Parse error/);
    expect(subject.calls).toEqual([]);
  });
});
