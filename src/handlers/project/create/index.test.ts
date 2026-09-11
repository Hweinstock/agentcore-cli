import { afterEach, test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createRootHandler } from "../../index";
import {
  createSilentLogger,
  inTempDirectory,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../testing";

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

describe("project create", () => {
  test("--json returns the created project without human success text", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    const { io } = await run([
      "create",
      "--name",
      "JsonProject",
      "--skip-install",
      "--skip-git",
      "--json",
    ]);
    const projectRoot = join(directory, "JsonProject");

    expect(JSON.parse(io.stdout())).toEqual({
      operation: "create",
      project: { name: "JsonProject", path: projectRoot },
    });
    expect(io.stderr()).not.toContain("Created project");
    expect(io.stderr()).not.toContain("Next steps");
  });

  test("scaffolds a harness project by default, named for the project", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run(["create", "--name", "MyAgent"]);

    const projectRoot = join(directory, "MyAgent");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.harnesses).toEqual([{ name: "MyAgent", path: "app/MyAgent" }]);
    expect(spec.runtimes).toEqual([]);

    const harness = await Bun.file(join(projectRoot, "app", "MyAgent", "harness.json")).json();
    expect(harness.model).toEqual({
      provider: "bedrock",
      modelId: "global.anthropic.claude-sonnet-4-6",
    });
    expect(harness.memory).toBeUndefined();
    expect(await Bun.file(join(projectRoot, "app", "MyAgent", "system-prompt.md")).exists()).toBe(
      true,
    );
  });

  test("refuses a project root that would exceed MAX_PATH on Windows, leaving nothing behind", async () => {
    const { path, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    const deep = join(path, "n".repeat(120));
    await mkdir(deep);
    process.chdir(deep);

    await expect(run(["create", "--name", "Deep"], { platform: "win32" })).rejects.toThrow(
      /too long for Windows/,
    );
    expect(await readdir(deep)).toEqual([]);

    await run(["create", "--name", "Deep", "--skip-install", "--skip-git"], { platform: "win32" });
    expect(await readdir(deep)).toEqual(["Deep"]);
  });

  test("a harness create installs CDK dependencies and git only (no uv sync)", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    const { core } = await run(["create", "--name", "MyAgent"]);

    const projectRoot = join(directory, "MyAgent");
    expect(core.projectCommands).toEqual([
      {
        command: ["npm", "install", "--loglevel=http"],
        cwd: join(projectRoot, "agentcore", "cdk"),
      },
      { command: ["git", "init"], cwd: projectRoot },
    ]);
  });

  test("the empty template scaffolds a project with no runtime and no harness", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyAgent",
      "--template",
      "empty",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyAgent");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes ?? []).toEqual([]);
    expect(spec.harnesses ?? []).toEqual([]);
    expect(existsSync(join(projectRoot, "app"))).toBe(true);
  });

  test("rejects --model-provider with the empty template", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(
      run(["create", "--name", "MyAgent", "--template", "empty", "--model-provider", "anthropic"]),
    ).rejects.toThrow(/--model-provider only applies to runtime templates/);
  });

  test("rejects --model-provider without a template", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(
      run(["create", "--name", "MyAgent", "--model-provider", "anthropic"]),
    ).rejects.toThrow(/--model-provider only applies to runtime templates/);
  });

  test("rejects --api-key with a template that does not support it", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await expect(
      run(
        [
          "create",
          "--name",
          "MyProject",
          "--template",
          "agent-python-minimal",
          "--api-key",
          "-",
          "--skip-install",
          "--skip-git",
        ],
        { stdin: "secret-key" },
      ),
    ).rejects.toThrow(/--api-key is not valid with the agent-python-minimal template/);
    expect(existsSync(join(directory, "MyProject"))).toBe(false);
  });

  test("rejects --model-provider with a template that does not support it", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(
      run([
        "create",
        "--name",
        "MyProject",
        "--template",
        "a2a-python-strands",
        "--model-provider",
        "anthropic",
        "--skip-install",
        "--skip-git",
      ]),
    ).rejects.toThrow(/--model-provider is not valid with the a2a-python-strands template/);
  });

  test("runs the post-scaffold steps and reports progress on stderr", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    const { io, core } = await run([
      "create",
      "--name",
      "MyAgent",
      "--template",
      "agent-python-minimal",
    ]);

    const projectRoot = join(directory, "MyAgent");
    expect(core.projectCommands).toEqual([
      {
        command: ["npm", "install", "--loglevel=http"],
        cwd: join(projectRoot, "agentcore", "cdk"),
      },
      { command: ["uv", "sync"], cwd: join(projectRoot, "app", "agent_python_minimal") },
      { command: ["git", "init"], cwd: projectRoot },
    ]);
    expect(io.stderr()).toContain("Creating project tree");
    expect(io.stderr()).toContain("Installing CDK dependencies with npm");
    expect(io.stderr()).toContain("Syncing Python dependencies with uv");
    expect(io.stderr()).toContain("Initializing git repository");
    expect(io.stderr()).toContain("Created project 'MyAgent' in ./MyAgent");
    expect(io.stderr()).toContain("Next steps:\n  cd MyAgent\n  agentcore project deploy");
  });

  test("--skip-install and --skip-git run no commands", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    const { core } = await run(["create", "--name", "MyAgent", "--skip-install", "--skip-git"]);

    expect(core.projectCommands).toEqual([]);
  });

  test("scaffolds the strands template with longAndShortTerm memory pre-configured", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "agent-python-strands",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyProject");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes[0]).toMatchObject({
      name: "agent_python_strands",
      build: "CodeZip",
      codeLocation: "app/agent_python_strands",
      runtimeVersion: "PYTHON_3_14",
    });
    const memory = (spec.memories ?? [])[0];
    expect(memory).toMatchObject({ name: "agent_python_strandsMemory", eventExpiryDuration: 30 });
    expect(memory.strategies.map(({ type }: { type: string }) => type)).toEqual([
      "SEMANTIC",
      "USER_PREFERENCE",
      "SUMMARIZATION",
      "EPISODIC",
    ]);
    expect(
      await Bun.file(join(projectRoot, "app", "agent_python_strands", "main.py")).exists(),
    ).toBe(true);
  });

  test("scaffolds a keyless LiteLLM runtime with no credential", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "agent-python-strands",
      "--model-provider",
      "lite_llm",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyProject");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes).toHaveLength(1);
    expect(spec.credentials ?? []).toEqual([]);
  });

  test.each<[string, string]>([
    ["anthropic", "agent_python_strandsAnthropicApiKey"],
    ["open_ai", "agent_python_strandsOpenAIApiKey"],
    ["gemini", "agent_python_strandsGeminiApiKey"],
    ["lite_llm", "agent_python_strandsLiteLLMApiKey"],
  ])("scaffolds a runtime with a %s API-key credential", async (provider, credentialName) => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    const apiKeyPath = join(directory, "api-key.txt");
    await Bun.write(apiKeyPath, "test-api-key");

    await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "agent-python-strands",
      "--model-provider",
      provider,
      "--api-key",
      `file://${apiKeyPath}`,
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyProject");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.credentials).toContainEqual({
      authorizerType: "ApiKeyCredentialProvider",
      name: credentialName,
    });
    const envLocal = await Bun.file(join(projectRoot, "agentcore", ".env.local")).text();
    expect(envLocal).toContain("test-api-key");
  });

  test("scaffolds a Container agent from the strands -container template", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "agent-python-strands-container",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyProject");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes[0]).toMatchObject({
      name: "agent_python_strands_container",
      build: "Container",
      codeLocation: "app/agent_python_strands_container",
      dockerfile: "Dockerfile",
    });
    expect(spec.runtimes[0].runtimeVersion).toBeUndefined();
    const runtimeRoot = join(projectRoot, "app", "agent_python_strands_container");
    expect(await Bun.file(join(runtimeRoot, "Dockerfile")).exists()).toBe(true);
    expect(await Bun.file(join(runtimeRoot, ".dockerignore")).exists()).toBe(true);
  });

  test("omits the Dockerfile from a CodeZip strands template", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "agent-python-strands",
      "--skip-install",
      "--skip-git",
    ]);

    const runtimeRoot = join(directory, "MyProject", "app", "agent_python_strands");
    expect(await Bun.file(join(runtimeRoot, "Dockerfile")).exists()).toBe(false);
    expect(await Bun.file(join(runtimeRoot, ".dockerignore")).exists()).toBe(false);
  });

  test("generates uv.lock for a Container scaffold even with --skip-install", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    const { core } = await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "agent-python-strands-container",
      "--skip-install",
      "--skip-git",
    ]);

    expect(core.projectCommands).toContainEqual({
      command: ["uv", "lock"],
      cwd: join(directory, "MyProject", "app", "agent_python_strands_container"),
    });
  });

  test("scaffolds an MCP server from the mcp-python-fastmcp template (CodeZip default)", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyProject",
      "--template",
      "mcp-python-fastmcp",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyProject");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes[0]).toMatchObject({
      name: "mcp_python_fastmcp",
      build: "CodeZip",
      protocol: "MCP",
      codeLocation: "app/mcp_python_fastmcp",
      runtimeVersion: "PYTHON_3_14",
    });
    const runtimeRoot = join(projectRoot, "app", "mcp_python_fastmcp");
    const mainPy = await Bun.file(join(runtimeRoot, "main.py")).text();
    expect(mainPy).toContain("FastMCP");
    expect(mainPy).toContain('mcp.run(transport="streamable-http")');
    expect(await Bun.file(join(runtimeRoot, "Dockerfile")).exists()).toBe(false);
    expect(spec.memories ?? []).toEqual([]);
  });

  test("scaffolds the minimal Python template", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyAgent",
      "--template",
      "agent-python-minimal",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyAgent");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes).toEqual([
      {
        name: "agent_python_minimal",
        build: "CodeZip",
        entrypoint: "main.py",
        codeLocation: "app/agent_python_minimal",
        runtimeVersion: "PYTHON_3_14",
      },
    ]);
    expect(spec.memories ?? []).toEqual([]);
  });

  test("renders the LangChain template's pyproject name and no credentials", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyAgent",
      "--template",
      "agent-python-langchain",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyAgent");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.credentials ?? []).toEqual([]);
    const pyproject = await Bun.file(
      join(projectRoot, "app", "agent_python_langchain", "pyproject.toml"),
    ).text();
    expect(pyproject).toContain('name = "agent_python_langchain"');
  });

  test("scaffolds a TypeScript strands runtime with memory pre-configured", async () => {
    const { path: directory, cleanup } = await inTempDirectory();
    cleanups.push(cleanup);
    await run([
      "create",
      "--name",
      "MyAgent",
      "--template",
      "agent-typescript-strands",
      "--skip-install",
      "--skip-git",
    ]);

    const projectRoot = join(directory, "MyAgent");
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    // NODE_22 runtimes deploy a compiled main.js, so the spec entrypoint is main.js
    // even though the scaffolded source is main.ts.
    expect(spec.runtimes[0]).toMatchObject({
      name: "agent_typescript_strands",
      build: "CodeZip",
      entrypoint: "main.js",
      codeLocation: "app/agent_typescript_strands",
      runtimeVersion: "NODE_22",
      protocol: "HTTP",
    });
    expect(spec.memories ?? []).toHaveLength(1);
    expect(
      await Bun.file(join(projectRoot, "app", "agent_typescript_strands", "main.ts")).exists(),
    ).toBe(true);
  });

  test("rejects an invalid --name", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(run(["create", "--name", "1-bad"])).rejects.toThrow();
  });

  test("rejects a reserved --name", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(run(["create", "--name", "test"])).rejects.toThrow(/conflicts with/);
  });

  test("rejects an unknown --template value", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    await expect(run(["create", "--name", "MyAgent", "--template", "nonsense"])).rejects.toThrow();
  });
});
