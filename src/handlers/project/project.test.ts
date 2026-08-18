import { afterEach, test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRootHandler } from "../index";
import {
  createSilentLogger,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../testing";
import { InputValidationError, NotImplementedError } from "../../errors";
import { FsReadWriteJson, type ReadWriteJson } from "../../io";

async function run(args: string[], opts?: { core?: TestCoreClient }) {
  const io = testIO();
  const core = opts?.core ?? new TestCoreClient();
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor: new TestGlobalConfigAccessor(),
    logger: createSilentLogger(),
  });
  await root.route(["node", "agentcore", "project", ...args]);
  return { io, core };
}

describe.each(["remove", "dev", "deploy", "status"])("project %s", (command) => {
  test("throws because it is not implemented yet", async () => {
    await expect(run([command])).rejects.toThrow(/not implemented/);
  });
});

const originalCwd = process.cwd();
const tempDirectories: string[] = [];

async function inTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agentcore-project-"));
  tempDirectories.push(directory);
  process.chdir(directory);
  // cwd is the realpath (macOS tmpdir lives behind a /var -> /private/var
  // symlink), matching the paths the manager derives from process.cwd().
  return process.cwd();
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/** Scaffolds a project and cds into it so withProject resolves it. */
async function inProject(name = "TestProject"): Promise<string> {
  const directory = await inTempDirectory();
  await run(["create", "--name", name, "--skip-install", "--skip-git"]);
  const projectRoot = join(directory, name);
  process.chdir(projectRoot);
  return projectRoot;
}

describe("project create", () => {
  test("scaffolds the project into a fresh directory named for the project", async () => {
    const directory = await inTempDirectory();
    await run(["create", "--name", "MyAgent"]);

    // One existence check proves the handler→manager pipe; the full manifest
    // is covered by the FsProjectManager snapshot test.
    const projectRoot = join(directory, "MyAgent");
    expect(await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).exists()).toBe(true);
  });

  test("rejects an invalid --project-name", async () => {
    await inTempDirectory();
    await expect(run(["create", "--name", "1-bad"])).rejects.toThrow();
  });

  test("rejects a reserved --project-name", async () => {
    await inTempDirectory();
    await expect(run(["create", "--name", "test"])).rejects.toThrow(/conflicts with/);
  });

  test("runs the post-scaffold steps and reports progress on stderr", async () => {
    const directory = await inTempDirectory();
    const { io, core } = await run(["create", "--name", "MyAgent"]);

    const projectRoot = join(directory, "MyAgent");
    expect(core.projectCommands).toEqual([
      { command: ["npm", "install"], cwd: join(projectRoot, "agentcore", "cdk") },
      { command: ["uv", "sync"], cwd: join(projectRoot, "app", "hello-world") },
      { command: ["git", "init"], cwd: projectRoot },
    ]);
    expect(io.stderr()).toContain("Creating project tree");
    expect(io.stderr()).toContain("Installing CDK dependencies with npm");
    expect(io.stderr()).toContain("Syncing Python dependencies with uv");
    expect(io.stderr()).toContain("Initializing git repository");
    expect(io.stderr()).toContain("Created project 'MyAgent' in ./MyAgent");
  });

  test("--skip-install and --skip-git run no commands", async () => {
    await inTempDirectory();
    const { core } = await run(["create", "--name", "MyAgent", "--skip-install", "--skip-git"]);

    expect(core.projectCommands).toEqual([]);
  });

  test("rejects an unknown --template value", async () => {
    await inTempDirectory();
    await expect(run(["create", "--name", "MyAgent", "--template", "nonsense"])).rejects.toThrow();
  });
});

describe("project add harness", () => {
  const defaultModel = { provider: "bedrock", modelId: "global.anthropic.claude-sonnet-4-6" };
  /** Verify error case for different flags **/
  test.each<[string, string[], Record<string, unknown>]>([
    ["minimal — name only", ["--name", "x"], { model: defaultModel }],
    [
      "model — bedrock",
      [
        "--name",
        "x",
        "--model",
        '{"bedrockModelConfig":{"modelId":"us.anthropic.claude-sonnet-4-5-20250929-v1:0"}}',
      ],
      { model: { provider: "bedrock", modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" } },
    ],
    [
      "model — openai",
      [
        "--name",
        "x",
        "--model",
        '{"openAiModelConfig":{"modelId":"gpt-4","apiKeyArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:api-key/k"}}',
      ],
      {
        model: {
          provider: "open_ai",
          modelId: "gpt-4",
          apiKeyArn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:api-key/k",
        },
      },
    ],
    [
      "model — gemini",
      [
        "--name",
        "x",
        "--model",
        '{"geminiModelConfig":{"modelId":"gemini-pro","apiKeyArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:api-key/k"}}',
      ],
      {
        model: {
          provider: "gemini",
          modelId: "gemini-pro",
          apiKeyArn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:api-key/k",
        },
      },
    ],
    [
      "model — litellm",
      ["--name", "x", "--model", '{"liteLlmModelConfig":{"modelId":"anthropic/claude-3"}}'],
      { model: { provider: "lite_llm", modelId: "anthropic/claude-3" } },
    ],
    [
      "tools — remote_mcp",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"remote_mcp","name":"mcp1","config":{"remoteMcp":{"url":"https://mcp.example.com"}}}]',
      ],
      {
        tools: [
          {
            type: "remote_mcp",
            name: "mcp1",
            config: { remoteMcp: { url: "https://mcp.example.com" } },
          },
        ],
      },
    ],
    [
      "tools — agentcore_gateway",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"agentcore_gateway","name":"gw1","config":{"agentCoreGateway":{"gatewayArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/g"}}}]',
      ],
      {
        tools: [
          {
            type: "agentcore_gateway",
            name: "gw1",
            config: {
              agentCoreGateway: {
                gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/g",
              },
            },
          },
        ],
      },
    ],
    [
      "tools — agentcore_gateway with outboundAuth",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"agentcore_gateway","name":"gw1","config":{"agentCoreGateway":{"gatewayArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/g","outboundAuth":{"oauth":{"providerArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:oauth2-credential-provider/p","scopes":["read","write"]}}}}}]',
      ],
      {
        tools: [
          {
            type: "agentcore_gateway",
            name: "gw1",
            config: {
              agentCoreGateway: {
                gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/g",
                outboundAuth: {
                  oauth: {
                    providerArn:
                      "arn:aws:bedrock-agentcore:us-east-1:123456789012:oauth2-credential-provider/p",
                    scopes: ["read", "write"],
                  },
                },
              },
            },
          },
        ],
      },
    ],
    [
      "tools — agentcore_browser",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"agentcore_browser","name":"br1","config":{"agentCoreBrowser":{}}}]',
      ],
      { tools: [{ type: "agentcore_browser", name: "br1", config: { agentCoreBrowser: {} } }] },
    ],
    [
      "tools — inline_function",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"inline_function","name":"fn1","config":{"inlineFunction":{"description":"test","inputSchema":{"type":"object"}}}}]',
      ],
      {
        tools: [
          {
            type: "inline_function",
            name: "fn1",
            config: { inlineFunction: { description: "test", inputSchema: { type: "object" } } },
          },
        ],
      },
    ],
    [
      "tools — agentcore_code_interpreter",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"agentcore_code_interpreter","name":"ci1","config":{"agentCoreCodeInterpreter":{}}}]',
      ],
      {
        tools: [
          {
            type: "agentcore_code_interpreter",
            name: "ci1",
            config: { agentCoreCodeInterpreter: {} },
          },
        ],
      },
    ],
    [
      "tools — no config",
      ["--name", "x", "--tools", '[{"type":"agentcore_browser","name":"br1"}]'],
      { tools: [{ type: "agentcore_browser", name: "br1" }] },
    ],
    [
      "tools — unrecognized config variant (passes through without config)",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"agentcore_browser","name":"br1","config":{"someFutureConfig":{}}}]',
      ],
      { tools: [{ type: "agentcore_browser", name: "br1" }] },
    ],
    [
      "skills — path",
      ["--name", "x", "--skills", '[{"path":"./my-skill"}]'],
      { skills: [{ path: "./my-skill" }] },
    ],
    [
      "skills — s3",
      ["--name", "x", "--skills", '[{"s3":{"uri":"s3://bucket/skill/"}}]'],
      { skills: [{ s3Uri: "s3://bucket/skill/" }] },
    ],
    [
      "skills — git",
      [
        "--name",
        "x",
        "--skills",
        '[{"git":{"url":"https://github.com/org/repo","path":"skills/","auth":{"credentialArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:credential/c","username":"oauth2"}}}]',
      ],
      {
        skills: [
          {
            gitUrl: "https://github.com/org/repo",
            path: "skills/",
            auth: {
              credentialArn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:credential/c",
              username: "oauth2",
            },
          },
        ],
      },
    ],
    [
      "skills — awsSkills",
      ["--name", "x", "--skills", '[{"awsSkills":{"paths":["core-skills/*"]}}]'],
      { skills: [{ awsSkills: { paths: ["core-skills/*"] } }] },
    ],
    [
      "memory — managed",
      [
        "--name",
        "x",
        "--memory",
        '{"managedMemoryConfiguration":{"strategies":["SEMANTIC"],"eventExpiryDuration":30}}',
      ],
      { memory: { mode: "managed", strategies: ["SEMANTIC"], eventExpiryDuration: 30 } },
    ],
    [
      "memory — existing",
      [
        "--name",
        "x",
        "--memory",
        '{"agentCoreMemoryConfiguration":{"arn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:memory/m"}}',
      ],
      {
        memory: {
          mode: "existing",
          arn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:memory/m",
        },
      },
    ],
    [
      "memory — disabled",
      ["--name", "x", "--memory", '{"disabled":{}}'],
      { memory: { mode: "disabled" } },
    ],
    [
      "truncation — sliding_window",
      [
        "--name",
        "x",
        "--truncation",
        '{"strategy":"sliding_window","config":{"slidingWindow":{"messagesCount":40}}}',
      ],
      {
        truncation: {
          strategy: "sliding_window",
          config: { slidingWindow: { messagesCount: 40 } },
        },
      },
    ],
    [
      "truncation — summarization",
      [
        "--name",
        "x",
        "--truncation",
        '{"strategy":"summarization","config":{"summarization":{"summaryRatio":0.5,"preserveRecentMessages":5}}}',
      ],
      {
        truncation: {
          strategy: "summarization",
          config: { summarization: { summaryRatio: 0.5, preserveRecentMessages: 5 } },
        },
      },
    ],
    [
      "truncation — none",
      ["--name", "x", "--truncation", '{"strategy":"none"}'],
      { truncation: { strategy: "none" } },
    ],
    [
      "truncation — unrecognized config variant (passes through strategy only)",
      ["--name", "x", "--truncation", '{"strategy":"none","config":{"someFutureStrategy":{}}}'],
      { truncation: { strategy: "none" } },
    ],
    [
      "authorizer — customJWT",
      [
        "--name",
        "x",
        "--authorizer-configuration",
        '{"customJWTAuthorizer":{"discoveryUrl":"https://idp.example.com/.well-known/openid-configuration","allowedAudience":["my-app"]}}',
      ],
      {
        authorizerType: "CUSTOM_JWT",
        authorizerConfiguration: {
          customJwtAuthorizer: {
            discoveryUrl: "https://idp.example.com/.well-known/openid-configuration",
            allowedAudience: ["my-app"],
          },
        },
      },
    ],
    [
      "environment — VPC + lifecycle",
      [
        "--name",
        "x",
        "--environment",
        '{"agentCoreRuntimeEnvironment":{"networkConfiguration":{"networkMode":"VPC","networkModeConfig":{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}},"lifecycleConfiguration":{"idleRuntimeSessionTimeout":900,"maxLifetime":28800}}}',
      ],
      {
        networkMode: "VPC",
        networkConfig: {
          subnets: ["subnet-0123456789abcdef0"],
          securityGroups: ["sg-0123456789abcdef0"],
        },
        lifecycleConfig: { idleRuntimeSessionTimeout: 900, maxLifetime: 28800 },
      },
    ],
    [
      "environment — with filesystem mounts",
      [
        "--name",
        "x",
        "--environment",
        '{"agentCoreRuntimeEnvironment":{"networkConfiguration":{"networkMode":"VPC","networkModeConfig":{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}},"filesystemConfigurations":[{"sessionStorage":{"mountPath":"/mnt/data"}},{"efsAccessPoint":{"accessPointArn":"arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-0123456789abcdef0","mountPath":"/mnt/efs"}},{"s3FilesAccessPoint":{"accessPointArn":"arn:aws:s3files:us-east-1:123456789012:file-system/fs-0123456789abcdef01/access-point/fsap-0123456789abcdef01","mountPath":"/mnt/s3"}}]}}',
      ],
      {
        networkMode: "VPC",
        networkConfig: {
          subnets: ["subnet-0123456789abcdef0"],
          securityGroups: ["sg-0123456789abcdef0"],
        },
        sessionStoragePath: "/mnt/data",
        efsAccessPoints: [
          {
            accessPointArn:
              "arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-0123456789abcdef0",
            mountPath: "/mnt/efs",
          },
        ],
        s3AccessPoints: [
          {
            accessPointArn:
              "arn:aws:s3files:us-east-1:123456789012:file-system/fs-0123456789abcdef01/access-point/fsap-0123456789abcdef01",
            mountPath: "/mnt/s3",
          },
        ],
      },
    ],
    [
      "environment-artifact — containerUri",
      [
        "--name",
        "x",
        "--environment-artifact",
        '{"containerConfiguration":{"containerUri":"123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest"}}',
      ],
      { containerUri: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest" },
    ],
    [
      "environment-variables",
      ["--name", "x", "--environment-variables", '{"LOG_LEVEL":"debug"}'],
      { environmentVariables: { LOG_LEVEL: "debug" } },
    ],
    ["tags", ["--name", "x", "--tags", '{"team":"ml"}'], { tags: { team: "ml" } }],
    [
      "allowed-tools",
      ["--name", "x", "--allowed-tools", "*", "@builtin"],
      { allowedTools: ["*", "@builtin"] },
    ],
    [
      "max-iterations, max-tokens, timeout-seconds",
      ["--name", "x", "--max-iterations", "10", "--max-tokens", "4096", "--timeout-seconds", "60"],
      { maxIterations: 10, maxTokens: 4096, timeoutSeconds: 60 },
    ],
  ])("%s", async (_label, flags, expected) => {
    const projectRoot = await inProject();
    await run(["add", "harness", ...flags]);

    const harnessJson = await Bun.file(join(projectRoot, "app", "x", "harness.json")).json();
    expect(harnessJson).toMatchObject(expected);

    const agentcoreJson = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(agentcoreJson.harnesses).toContainEqual({
      name: "x",
      path: join("app", "x"),
    });
  });

  test("--system-prompt overrides the default system-prompt.md", async () => {
    const projectRoot = await inProject();
    await run(["add", "harness", "--name", "x", "--system-prompt", "You are a pirate."]);

    const prompt = await Bun.file(join(projectRoot, "app", "x", "system-prompt.md")).text();
    expect(prompt).toBe("You are a pirate.");

    const harnessJson = await Bun.file(join(projectRoot, "app", "x", "harness.json")).json();
    expect(harnessJson).not.toHaveProperty("systemPrompt");
  });

  test("--dockerfile copies the file into the harness directory and stores the relative path", async () => {
    const projectRoot = await inProject();

    const dockerfilePath = join(projectRoot, "Dockerfile");
    await Bun.write(dockerfilePath, "FROM python:3.12-slim\nCOPY . /app\n");

    await run(["add", "harness", "--name", "x", "--dockerfile", dockerfilePath]);

    const copiedContent = await Bun.file(join(projectRoot, "app", "x", "Dockerfile")).text();
    expect(copiedContent).toBe("FROM python:3.12-slim\nCOPY . /app\n");

    const harnessJson = await Bun.file(join(projectRoot, "app", "x", "harness.json")).json();
    expect(harnessJson.dockerfile).toBe("Dockerfile");
  });

  test("--dockerfile with VPC mode succeeds when --vpc-id is provided", async () => {
    const projectRoot = await inProject();

    const dockerfilePath = join(projectRoot, "Dockerfile");
    await Bun.write(dockerfilePath, "FROM python:3.12-slim\n");

    await run([
      "add",
      "harness",
      "--name",
      "x",
      "--dockerfile",
      dockerfilePath,
      "--environment",
      '{"agentCoreRuntimeEnvironment":{"networkConfiguration":{"networkMode":"VPC","networkModeConfig":{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}}}}',
      "--vpc-id",
      "vpc-0123456789abcdef0",
    ]);

    const harnessJson = await Bun.file(join(projectRoot, "app", "x", "harness.json")).json();
    expect(harnessJson).toMatchObject({
      dockerfile: "Dockerfile",
      networkMode: "VPC",
      networkConfig: {
        subnets: ["subnet-0123456789abcdef0"],
        securityGroups: ["sg-0123456789abcdef0"],
        vpcId: "vpc-0123456789abcdef0",
      },
    });
  });

  test("--dockerfile with VPC mode fails without --vpc-id", async () => {
    const projectRoot = await inProject();

    const dockerfilePath = join(projectRoot, "Dockerfile");
    await Bun.write(dockerfilePath, "FROM python:3.12-slim\n");

    await expect(
      run([
        "add",
        "harness",
        "--name",
        "x",
        "--dockerfile",
        dockerfilePath,
        "--environment",
        '{"agentCoreRuntimeEnvironment":{"networkConfiguration":{"networkMode":"VPC","networkModeConfig":{"subnets":["subnet-0123456789abcdef0"],"securityGroups":["sg-0123456789abcdef0"]}}}}',
      ]),
    ).rejects.toBeInstanceOf(InputValidationError);
  });

  test("cleans up scaffolded files when the spec write fails", async () => {
    const projectRoot = await inProject();
    const logger = createSilentLogger();
    const realJson = new FsReadWriteJson({ logger });

    // A json adapter that delegates reads but always fails on write.
    const failingJson: ReadWriteJson = {
      read: (path, schema) => realJson.read(path, schema),
      write: () => {
        throw new Error("simulated write failure");
      },
    };

    const core = new TestCoreClient({ json: failingJson });

    await expect(run(["add", "harness", "--name", "x"], { core })).rejects.toThrow();

    // The scaffolded harness directory should have been cleaned up.
    expect(existsSync(join(projectRoot, "app", "x"))).toBe(false);
  });

  test("rejects a duplicate harness name", async () => {
    await inProject();
    await run(["add", "harness", "--name", "x"]);
    await expect(run(["add", "harness", "--name", "x"])).rejects.toBeInstanceOf(
      InputValidationError,
    );
  });

  test.each([
    ["missing --name", ["--model", '{"bedrockModelConfig":{"modelId":"x"}}']],
    ["model without modelId", ["--name", "x", "--model", '{"bedrockModelConfig":{}}']],
    ["unrecognized model variant", ["--name", "x", "--model", '{"unknownConfig":{"modelId":"x"}}']],
    ["tool without type", ["--name", "x", "--tools", '[{"name":"t1"}]']],
    ["tool without name", ["--name", "x", "--tools", '[{"type":"remote_mcp"}]']],
    ["unrecognized skill variant", ["--name", "x", "--skills", '[{"unknown":true}]']],
    ["unrecognized memory variant", ["--name", "x", "--memory", '{"unknownMemory":{}}']],
    [
      "missing truncation strategy",
      ["--name", "x", "--truncation", '{"config":{"slidingWindow":{"messagesCount":10}}}'],
    ],
    [
      "unrecognized authorizer variant",
      ["--name", "x", "--authorizer-configuration", '{"unknownAuth":{}}'],
    ],
    [
      "missing discoveryUrl in authorizer",
      [
        "--name",
        "x",
        "--authorizer-configuration",
        '{"customJWTAuthorizer":{"allowedAudience":["a"]}}',
      ],
    ],
    ["unrecognized environment variant", ["--name", "x", "--environment", '{"unknownEnv":{}}']],
    [
      "unrecognized environment-artifact variant",
      ["--name", "x", "--environment-artifact", '{"unknownArtifact":{}}'],
    ],
    [
      "unrecognized outboundAuth variant",
      [
        "--name",
        "x",
        "--tools",
        '[{"type":"agentcore_gateway","name":"gw1","config":{"agentCoreGateway":{"gatewayArn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/g","outboundAuth":{"unknownAuth":{}}}}}]',
      ],
    ],
    [
      "containerUri and dockerfile are mutually exclusive",
      [
        "--name",
        "x",
        "--environment-artifact",
        '{"containerConfiguration":{"containerUri":"123456789012.dkr.ecr.us-east-1.amazonaws.com/img:v1"}}',
        "--dockerfile",
        "Dockerfile",
      ],
    ],
    [
      "--vpc-id requires --environment with VPC network configuration",
      ["--name", "x", "--vpc-id", "vpc-0123456789abcdef0"],
    ],
  ])("%s", async (_label, flags) => {
    await inProject();
    await expect(run(["add", "harness", ...flags])).rejects.toBeInstanceOf(InputValidationError);
  });
});

describe("project build", () => {
  async function inBuildableProject(): Promise<string> {
    const projectRoot = await inProject("MyAgent");
    // create --skip-install leaves no node_modules, which build requires.
    await mkdir(join(projectRoot, "agentcore", "cdk", "node_modules"), { recursive: true });
    return projectRoot;
  }

  test("synthesizes the CDK app of the enclosing project", async () => {
    const projectRoot = await inBuildableProject();
    const { io, core } = await run(["build"]);

    expect(core.projectCommands).toEqual([
      {
        command: ["npm", "run", "cdk", "--", "synth", "--quiet"],
        cwd: join(projectRoot, "agentcore", "cdk"),
      },
    ]);
    expect(io.stderr()).toContain("Synthesizing CloudFormation templates");
    expect(io.stderr()).toContain("Built project 'MyAgent'");
  });

  test("resolves the project from a nested directory", async () => {
    const projectRoot = await inBuildableProject();
    process.chdir(join(projectRoot, "app", "hello-world"));

    const { core } = await run(["build"]);

    expect(core.projectCommands.map(({ cwd }) => cwd)).toEqual([
      join(projectRoot, "agentcore", "cdk"),
    ]);
  });

  test("fails with actionable guidance outside a project", async () => {
    await inTempDirectory();
    await expect(run(["build"])).rejects.toThrow(/No AgentCore project found/);
  });

  test("fails when the CDK dependencies have not been installed", async () => {
    const projectRoot = await inBuildableProject();
    await rm(join(projectRoot, "agentcore", "cdk", "node_modules"), { recursive: true });

    await expect(run(["build"])).rejects.toThrow(/npm install/);
  });
});

// TODO: Replace NotImplementedError assertions with output assertions once
// FsProjectManager.addResource supports the "runtime" resource type.
describe("project add runtime", () => {
  const byo = ["--code-location", "app/my_agent"];
  const template = ["--template", "hello-world-python"];

  // Verifies each valid flag combination passes handler validation.
  test.each<[string, string[]]>([
    ["minimal — name only (defaults to template)", ["--name", "my_agent"]],
    ["explicit template path", ["--name", "my_agent", ...template]],
    ["minimal — BYO path with build", ["--name", "my_agent", ...byo, "--build", "CodeZip"]],
    [
      "BYO container with dockerfile",
      ["--name", "my_agent", ...byo, "--build", "Container", "--dockerfile", "Dockerfile"],
    ],
    [
      "entrypoint + runtime-version for CodeZip",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "CodeZip",
        "--entrypoint",
        "app.py:main",
        "--runtime-version",
        "PYTHON_3_13",
      ],
    ],
    ["description", ["--name", "my_agent", ...template, "--description", "A test agent"]],
    [
      "role-arn",
      ["--name", "my_agent", ...template, "--role-arn", "arn:aws:iam::123456789012:role/MyRole"],
    ],
    [
      "network-configuration — VPC",
      [
        "--name",
        "my_agent",
        ...template,
        "--network-configuration",
        '{"networkMode":"VPC","networkModeConfig":{"subnets":["subnet-abc"],"securityGroups":["sg-123"]}}',
      ],
    ],
    [
      "network-configuration — PUBLIC",
      ["--name", "my_agent", ...template, "--network-configuration", '{"networkMode":"PUBLIC"}'],
    ],
    [
      "authorizer-configuration — customJWT",
      [
        "--name",
        "my_agent",
        ...template,
        "--authorizer-configuration",
        '{"customJWTAuthorizer":{"discoveryUrl":"https://idp.example.com/.well-known/openid-configuration","allowedAudience":["app"]}}',
      ],
    ],
    [
      "protocol-configuration — MCP",
      ["--name", "my_agent", ...template, "--protocol-configuration", '{"serverProtocol":"MCP"}'],
    ],
    [
      "protocol-configuration — A2A",
      ["--name", "my_agent", ...template, "--protocol-configuration", '{"serverProtocol":"A2A"}'],
    ],
    [
      "protocol-configuration — AGUI",
      ["--name", "my_agent", ...template, "--protocol-configuration", '{"serverProtocol":"AGUI"}'],
    ],
    [
      "request-header-configuration",
      [
        "--name",
        "my_agent",
        ...template,
        "--request-header-configuration",
        '{"requestHeaderAllowlist":["X-Custom-Header","Authorization"]}',
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
        "--filesystem-configurations",
        '[{"efsAccessPoint":{"accessPointArn":"arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-abc","mountPath":"/mnt/efs"}}]',
      ],
    ],
    [
      "filesystem-configurations — s3FilesAccessPoint",
      [
        "--name",
        "my_agent",
        ...template,
        "--filesystem-configurations",
        '[{"s3FilesAccessPoint":{"accessPointArn":"arn:aws:s3files:us-east-1:123456789012:file-system/fs-abc/access-point/fsap-def","mountPath":"/mnt/s3"}}]',
      ],
    ],
    ["tags", ["--name", "my_agent", ...template, "--tags", '{"team":"ml","env":"prod"}']],
    [
      "dockerfile + build-context-path",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "Container",
        "--dockerfile",
        "docker/Dockerfile.gpu",
        "--build-context-path",
        ".",
      ],
    ],
    [
      "custom-docker-build-args with dockerfile",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "Container",
        "--dockerfile",
        "Dockerfile",
        "--custom-docker-build-args",
        '{"AGENT_NAME":"my_agent","VERSION":"1.0"}',
      ],
    ],
    [
      "custom-docker-build-args with build-context-path",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "Container",
        "--build-context-path",
        ".",
        "--custom-docker-build-args",
        '{"AGENT_NAME":"my_agent"}',
      ],
    ],
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
    ["protocol shortcut", ["--name", "my_agent", ...template, "--protocol", "MCP"]],
    [
      "memory — create with strategies",
      [
        "--name",
        "my_agent",
        ...template,
        "--memory",
        '{"mode":"create","strategies":["SEMANTIC","EPISODIC"]}',
      ],
    ],
    [
      "memory — existing by ARN",
      [
        "--name",
        "my_agent",
        ...template,
        "--memory",
        '{"mode":"existing","arn":"arn:aws:bedrock-agentcore:us-east-1:123456789012:memory/MyMem"}',
      ],
    ],
    ["memory — disabled", ["--name", "my_agent", ...template, "--memory", '{"mode":"disabled"}']],
    ["model-provider — openai", ["--name", "my_agent", ...template, "--model-provider", "openai"]],
    [
      "build on template path (overlay)",
      ["--name", "my_agent", ...template, "--build", "Container"],
    ],
    [
      "vpc-id with VPC network configuration",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "Container",
        "--dockerfile",
        "Dockerfile",
        "--network-configuration",
        '{"networkMode":"VPC","networkModeConfig":{"subnets":["subnet-abc"],"securityGroups":["sg-123"]}}',
        "--vpc-id",
        "vpc-0123456789abcdef0",
      ],
    ],
  ])("%s — accepts flags", async (_label, flags) => {
    await inProject();
    await expect(run(["add", "runtime", ...flags])).rejects.toBeInstanceOf(NotImplementedError);
  });

  // Rejects invalid flag combinations with InputValidationError.
  test.each<[string, string[]]>([
    ["missing --name", ["--template", "hello-world-python"]],
    [
      "--template and --code-location are mutually exclusive",
      ["--name", "my_agent", "--template", "hello-world-python", "--code-location", "app/agent"],
    ],
    [
      "--custom-docker-build-args requires --dockerfile or --build-context-path",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "Container",
        "--custom-docker-build-args",
        '{"KEY":"value"}',
      ],
    ],
    [
      "--vpc-id requires --network-configuration with VPC network configuration",
      [
        "--name",
        "my_agent",
        ...byo,
        "--build",
        "Container",
        "--dockerfile",
        "Dockerfile",
        "--vpc-id",
        "vpc-0123456789abcdef0",
      ],
    ],
    [
      "unrecognized authorizer configuration variant",
      ["--name", "my_agent", ...template, "--authorizer-configuration", '{"unknownAuth":{}}'],
    ],
    [
      "missing discoveryUrl in authorizer",
      [
        "--name",
        "my_agent",
        ...template,
        "--authorizer-configuration",
        '{"customJWTAuthorizer":{"allowedAudience":["a"]}}',
      ],
    ],
    [
      "unrecognized filesystem configuration variant",
      ["--name", "my_agent", ...template, "--filesystem-configurations", '[{"unknownFs":{}}]'],
    ],
    [
      "invalid JSON in --network-configuration",
      ["--name", "my_agent", ...template, "--network-configuration", "{bad}"],
    ],
    [
      "unrecognized request header configuration variant",
      [
        "--name",
        "my_agent",
        ...template,
        "--request-header-configuration",
        '{"unknownVariant":["X-Foo"]}',
      ],
    ],
    [
      "--protocol and --protocol-configuration are mutually exclusive",
      [
        "--name",
        "my_agent",
        ...template,
        "--protocol",
        "MCP",
        "--protocol-configuration",
        '{"serverProtocol":"MCP"}',
      ],
    ],
    [
      "--entrypoint is only available on BYO path",
      ["--name", "my_agent", ...template, "--entrypoint", "main.py"],
    ],
    [
      "--runtime-version is only available on BYO path",
      ["--name", "my_agent", ...template, "--runtime-version", "PYTHON_3_13"],
    ],
    [
      "--dockerfile is only available on BYO path",
      ["--name", "my_agent", ...template, "--dockerfile", "Dockerfile"],
    ],
    [
      "--build-context-path is only available on BYO path",
      ["--name", "my_agent", ...template, "--build-context-path", "."],
    ],
    [
      "--custom-docker-build-args is only available on BYO path",
      ["--name", "my_agent", ...template, "--custom-docker-build-args", '{"KEY":"val"}'],
    ],
    [
      "--memory is only available on template path",
      ["--name", "my_agent", ...byo, "--memory", '{"mode":"disabled"}'],
    ],
    [
      "--model-provider is only available on template path",
      ["--name", "my_agent", ...byo, "--model-provider", "openai"],
    ],
    [
      "--api-key is only available on template path",
      ["--name", "my_agent", ...byo, "--api-key", "-"],
    ],
    [
      "invalid memory JSON schema",
      ["--name", "my_agent", ...template, "--memory", '{"mode":"invalid"}'],
    ],
  ])("%s", async (_label, flags) => {
    await inProject();
    await expect(run(["add", "runtime", ...flags])).rejects.toBeInstanceOf(InputValidationError);
  });
});
