import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRootHandler } from "../../../index";
import {
  createSilentLogger,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../../testing";
import { InputValidationError } from "../../../../errors";

const originalCwd = process.cwd();
const tempDirectories: string[] = [];

async function inTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agentcore-runtime-"));
  tempDirectories.push(directory);
  process.chdir(directory);
  return process.cwd();
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function run(args: string[]) {
  const io = testIO();
  const core = new TestCoreClient();
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor: new TestGlobalConfigAccessor(),
    logger: createSilentLogger(),
  });
  await root.route(["node", "agentcore", "project", ...args]);
  return { io, core };
}

async function inProject(name = "TestProject"): Promise<string> {
  const directory = await inTempDirectory();
  await run(["create", "--name", name, "--skip-install", "--skip-git"]);
  const projectRoot = join(directory, name);
  process.chdir(projectRoot);
  return projectRoot;
}

describe("project add runtime", () => {
  const template = ["--template", "hello-world-python"];

  const allScaffoldingFlags = [
    "--build",
    "CodeZip",
    "--language",
    "Python",
    "--framework",
    "none",
    "--model-provider",
    "Bedrock",
    "--memory",
    "none",
  ];

  const allInfrastructureFlags = [
    "--description",
    "Configured runtime",
    "--role-arn",
    "arn:aws:iam::123456789012:role/MyRole",
    "--additional-policies",
    "arn:aws:iam::123456789012:policy/MyPolicy",
    "--protocol",
    "HTTP",
    "--network-mode",
    "VPC",
    "--network-config",
    '{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}',
    "--authorizer-type",
    "CUSTOM_JWT",
    "--authorizer-configuration",
    '{"customJwtAuthorizer":{"discoveryUrl":"https://idp.example.com/.well-known/openid-configuration","allowedAudience":["app"]}}',
    "--request-header-allowlist",
    "X-Custom-Header",
    "--lifecycle-configuration",
    '{"idleRuntimeSessionTimeout":300,"maxLifetime":3600}',
    "--environment-variables",
    '{"LOG_LEVEL":"debug","APP_ENV":"staging"}',
    "--filesystem-configurations",
    '[{"sessionStorage":{"mountPath":"/mnt/data"}}]',
    "--tags",
    '{"team":"ml","env":"test"}',
  ];

  const expectedSpecByLabel: Record<string, Record<string, unknown>> = {
    "all infrastructure flags": {
      description: "Configured runtime",
      executionRoleArn: "arn:aws:iam::123456789012:role/MyRole",
      additionalPolicies: ["arn:aws:iam::123456789012:policy/MyPolicy"],
      protocol: "HTTP",
      networkMode: "VPC",
      networkConfig: {
        subnets: ["subnet-0123456789abcdef0"],
        securityGroups: ["sg-0123456789abcdef0"],
      },
      authorizerType: "CUSTOM_JWT",
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: "https://idp.example.com/.well-known/openid-configuration",
          allowedAudience: ["app"],
        },
      },
      requestHeaderAllowlist: ["X-Custom-Header"],
      lifecycleConfiguration: { idleRuntimeSessionTimeout: 300, maxLifetime: 3600 },
      envVars: [
        { name: "LOG_LEVEL", value: "debug" },
        { name: "APP_ENV", value: "staging" },
      ],
      filesystemConfigurations: [{ sessionStorage: { mountPath: "/mnt/data" } }],
      tags: { team: "ml", env: "test" },
    },
  };

  test.each<[string, string[]]>([
    ["template preset", ["--name", "my_agent", ...template]],
    [
      "container template preset",
      ["--name", "my_agent", "--template", "hello-world-python-container"],
    ],
    ["strands-python template preset", ["--name", "my_agent", "--template", "strands-python"]],
    ["custom — all scaffolding flags", ["--name", "my_agent", ...allScaffoldingFlags]],
    [
      "custom — framework strands",
      [
        "--name",
        "strands_agent",
        "--build",
        "CodeZip",
        "--language",
        "Python",
        "--framework",
        "strands",
        "--model-provider",
        "Bedrock",
        "--memory",
        "none",
      ],
    ],
    [
      "custom — container build",
      [
        "--name",
        "my_agent",
        "--build",
        "Container",
        "--language",
        "Python",
        "--framework",
        "none",
        "--model-provider",
        "Bedrock",
        "--memory",
        "none",
      ],
    ],
    ["description", ["--name", "my_agent", ...template, "--description", "A test agent"]],
    [
      "role-arn",
      ["--name", "my_agent", ...template, "--role-arn", "arn:aws:iam::123456789012:role/MyRole"],
    ],
    [
      "network — VPC",
      [
        "--name",
        "my_agent",
        ...template,
        "--network-mode",
        "VPC",
        "--network-config",
        '{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}',
      ],
    ],
    ["network — PUBLIC", ["--name", "my_agent", ...template, "--network-mode", "PUBLIC"]],
    [
      "authorizer — customJWT",
      [
        "--name",
        "my_agent",
        ...template,
        "--authorizer-type",
        "CUSTOM_JWT",
        "--authorizer-configuration",
        '{"customJwtAuthorizer":{"discoveryUrl":"https://idp.example.com/.well-known/openid-configuration","allowedAudience":["app"]}}',
      ],
    ],
    [
      "request-header-allowlist",
      [
        "--name",
        "my_agent",
        ...template,
        "--request-header-allowlist",
        "X-Custom-Header",
        "Authorization",
      ],
    ],
    [
      "lifecycle-configuration",
      [
        "--name",
        "my_agent",
        ...template,
        "--lifecycle-configuration",
        '{"idleRuntimeSessionTimeout":300,"maxLifetime":3600}',
      ],
    ],
    [
      "environment-variables",
      [
        "--name",
        "my_agent",
        ...template,
        "--environment-variables",
        '{"LOG_LEVEL":"debug","APP_ENV":"staging"}',
      ],
    ],
    [
      "filesystem-configurations — sessionStorage",
      [
        "--name",
        "my_agent",
        ...template,
        "--filesystem-configurations",
        '[{"sessionStorage":{"mountPath":"/mnt/data"}}]',
      ],
    ],
    [
      "filesystem-configurations — efsAccessPoint",
      [
        "--name",
        "my_agent",
        ...template,
        "--network-mode",
        "VPC",
        "--network-config",
        '{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}',
        "--filesystem-configurations",
        '[{"efsAccessPoint":{"accessPointArn":"arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-0123456789abcdef0","mountPath":"/mnt/efs"}}]',
      ],
    ],
    [
      "filesystem-configurations — s3FilesAccessPoint",
      [
        "--name",
        "my_agent",
        ...template,
        "--network-mode",
        "VPC",
        "--network-config",
        '{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}',
        "--filesystem-configurations",
        '[{"s3FilesAccessPoint":{"accessPointArn":"arn:aws:s3files:us-east-1:123456789012:file-system/fs-0123456789abcdef01/access-point/fsap-0123456789abcdef1","mountPath":"/mnt/s3"}}]',
      ],
    ],
    ["tags", ["--name", "my_agent", ...template, "--tags", '{"team":"ml","env":"prod"}']],
    [
      "additional-policies",
      [
        "--name",
        "my_agent",
        ...template,
        "--additional-policies",
        "arn:aws:iam::123456789012:policy/MyPolicy",
      ],
    ],
    [
      "all infrastructure flags",
      ["--name", "configured_agent", ...template, ...allInfrastructureFlags],
    ],
  ])("%s — accepts flags", async (label, flags) => {
    const projectRoot = await inProject();
    await run(["add", "runtime", ...flags]);

    const name = flags[flags.indexOf("--name") + 1]!;
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    const runtime = spec.runtimes.find((candidate: { name: string }) => candidate.name === name);
    expect(runtime).toMatchObject({ entrypoint: "main.py", ...expectedSpecByLabel[label] });
    const isContainer = flags.some(
      (value) => value === "Container" || value === "hello-world-python-container",
    );
    expect(runtime.runtimeVersion).toBe(isContainer ? undefined : "PYTHON_3_14");
  });

  test.each<[string, string[]]>([
    ["missing --name", ["--template", "hello-world-python"]],
    [
      "missing --build without --template",
      [
        "--name",
        "my_agent",
        "--language",
        "Python",
        "--framework",
        "none",
        "--model-provider",
        "Bedrock",
        "--memory",
        "none",
      ],
    ],
    [
      "--template and --build are mutually exclusive",
      ["--name", "my_agent", "--template", "hello-world-python", "--build", "Container"],
    ],
    [
      "--template and --language are mutually exclusive",
      ["--name", "my_agent", "--template", "hello-world-python", "--language", "Python"],
    ],
    [
      "--template and --framework are mutually exclusive",
      ["--name", "my_agent", "--template", "hello-world-python", "--framework", "none"],
    ],
    [
      "--template and --model-provider are mutually exclusive",
      ["--name", "my_agent", "--template", "hello-world-python", "--model-provider", "Bedrock"],
    ],
    [
      "--template and --memory are mutually exclusive",
      ["--name", "my_agent", "--template", "hello-world-python", "--memory", "none"],
    ],
    [
      "strands-python only supports HTTP",
      ["--name", "my_agent", "--template", "strands-python", "--protocol", "MCP"],
    ],
    [
      "invalid JSON in --network-config",
      ["--name", "my_agent", ...template, "--network-config", "{bad}"],
    ],
    [
      "hello-world-python only supports HTTP",
      ["--name", "my_agent", "--template", "hello-world-python", "--protocol", "MCP"],
    ],
  ])("%s", async (_label, flags) => {
    await inProject();
    await expect(run(["add", "runtime", ...flags])).rejects.toBeInstanceOf(InputValidationError);
  });
});
