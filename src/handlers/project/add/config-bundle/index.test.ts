import { afterEach, test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRootHandler } from "../../../index";
import {
  createSilentLogger,
  initProject,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../../testing";
import { InputValidationError } from "../../../../errors";

async function run(
  args: string[],
  opts?: { core?: TestCoreClient; stdin?: string; platform?: NodeJS.Platform },
) {
  const io = testIO({ stdin: opts?.stdin });
  const core = opts?.core ?? new TestCoreClient();
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor: new TestGlobalConfigAccessor(),
    logger: createSilentLogger(),
    platform: opts?.platform,
  });
  await root.route(["node", "agentcore", "project", ...args]);
  return { io, core };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(() => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("project add config-bundle", () => {
  const components = {
    "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/orders-agent": {
      configuration: {
        systemPrompt: "Help customers with their orders.",
        temperature: 0.2,
      },
    },
  };

  test("adds a configuration bundle to agentcore.json", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const { io } = await run([
      "add",
      "config-bundle",
      "--name",
      "OrdersConfig",
      "--components",
      JSON.stringify(components),
    ]);

    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.configBundles).toEqual([
      {
        name: "OrdersConfig",
        type: "ConfigurationBundle",
        components,
        branchName: "mainline",
      },
    ]);
    expect(io.stderr()).toContain("added configuration bundle 'OrdersConfig' to 'TestProject'");
  });

  test("stores optional configuration bundle fields", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const kmsKeyArn = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012";

    await run([
      "add",
      "config-bundle",
      "--name",
      "OrdersConfig",
      "--description",
      "Configuration for the order support runtime",
      "--components",
      JSON.stringify(components),
      "--branch-name",
      "production",
      "--commit-message",
      "Add the initial order support configuration",
      "--kms-key-arn",
      kmsKeyArn,
    ]);

    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.configBundles[0]).toEqual({
      name: "OrdersConfig",
      type: "ConfigurationBundle",
      description: "Configuration for the order support runtime",
      components,
      branchName: "production",
      commitMessage: "Add the initial order support configuration",
      kmsKeyArn,
    });
  });

  test("reads components from a file", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const componentsPath = join(projectRoot, "components.json");
    await Bun.write(componentsPath, JSON.stringify(components));

    await run([
      "add",
      "config-bundle",
      "--name",
      "OrdersConfig",
      "--components",
      `file://${componentsPath}`,
    ]);

    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.configBundles[0].components).toEqual(components);
  });

  test("adds no files under app", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);

    await run([
      "add",
      "config-bundle",
      "--name",
      "OrdersConfig",
      "--components",
      JSON.stringify(components),
    ]);

    expect(existsSync(join(projectRoot, "app", "OrdersConfig"))).toBe(false);
  });

  test("rejects a duplicate configuration bundle name", async () => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    const args = [
      "add",
      "config-bundle",
      "--name",
      "OrdersConfig",
      "--components",
      JSON.stringify(components),
    ];

    await run(args);
    await expect(run(args)).rejects.toBeInstanceOf(InputValidationError);
  });

  test.each([
    ["missing name", ["--components", JSON.stringify(components)]],
    ["missing components", ["--name", "OrdersConfig"]],
    ["invalid name", ["--name", "orders-config", "--components", JSON.stringify(components)]],
    ["empty components", ["--name", "OrdersConfig", "--components", "{}"]],
    [
      "component without configuration",
      ["--name", "OrdersConfig", "--components", '{"arn:component":{}}'],
    ],
    [
      "non-object component configuration",
      [
        "--name",
        "OrdersConfig",
        "--components",
        '{"arn:component":{"configuration":"not-an-object"}}',
      ],
    ],
    [
      "unexpected component field",
      [
        "--name",
        "OrdersConfig",
        "--components",
        '{"arn:component":{"configuration":{},"unexpected":true}}',
      ],
    ],
    ["malformed components", ["--name", "OrdersConfig", "--components", "{not-json"]],
    [
      "empty description",
      ["--name", "OrdersConfig", "--description", "", "--components", JSON.stringify(components)],
    ],
    [
      "branch name above maximum length",
      [
        "--name",
        "OrdersConfig",
        "--components",
        JSON.stringify(components),
        "--branch-name",
        "b".repeat(129),
      ],
    ],
    [
      "commit message above maximum length",
      [
        "--name",
        "OrdersConfig",
        "--components",
        JSON.stringify(components),
        "--commit-message",
        "m".repeat(501),
      ],
    ],
    [
      "invalid KMS key ARN",
      [
        "--name",
        "OrdersConfig",
        "--components",
        JSON.stringify(components),
        "--kms-key-arn",
        "not-an-arn",
      ],
    ],
  ])("rejects %s", async (_label, flags) => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    await expect(run(["add", "config-bundle", ...flags])).rejects.toBeInstanceOf(
      InputValidationError,
    );
  });
});
