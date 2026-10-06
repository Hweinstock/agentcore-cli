import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AgentCoreCLIError } from "../../../errors";
import { createRootHandler } from "../../index";
import {
  createSilentLogger,
  initProject,
  inTempDirectory,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
  type TestIOOptions,
} from "../../../testing";

const HARNESS_ARN = "arn:aws:bedrock-agentcore:us-west-2:111122223333:harness/h-abc123";
const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;?]*[A-Za-z]`, "g");

function testExportCommand() {
  const core = new TestCoreClient();
  // A fresh root per invocation, so wiring-time state (e.g. the add router's
  // pinned cwd) always reflects the directory the test has cd'd into. The core
  // client is shared so mock responses and recorded calls span invocations.
  const route = (args: string[], options: TestIOOptions = {}) => {
    const io = testIO(options);
    const root = createRootHandler(core, {
      io: io.io,
      globalConfigAccessor: new TestGlobalConfigAccessor(),
      logger: createSilentLogger(),
    });
    subject.io = io;
    return root.route(["node", "agentcore", ...args]);
  };
  const subject = {
    /** IO captured for the most recent invocation. */
    io: undefined as unknown as ReturnType<typeof testIO>,
    core,
    project: (args: string[]) => route(args),
    run: (args: string[] = [], options: TestIOOptions = {}) =>
      route(["export", "harness", ...args], options),
  };
  return subject;
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(() => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

/** Scaffolds a project with one harness named `exportme` and cds into it. */
async function inProjectWithHarness(
  subject: ReturnType<typeof testExportCommand>,
): Promise<string> {
  const { projectRoot, cleanup } = await initProject({
    name: "orders",
    flags: ["--template", "agent-python-minimal"],
  });
  cleanups.push(cleanup);
  await subject.project([
    "add",
    "harness",
    "--name",
    "exportme",
    "--model",
    JSON.stringify({ provider: "bedrock", modelId: "us.amazon.nova-lite-v1:0", maxTokens: 256 }),
    "--system-prompt",
    "You are a terse assistant.",
    "--memory",
    '{"mode":"disabled"}',
  ]);
  return projectRoot;
}

describe("project export harness handler", () => {
  test("exports conventional prompt file contents as literal text", async () => {
    const prompt = "\uFEFFREADME.md\r\n";
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);
    const directory = join(projectRoot, "app", "exportme");
    const path = join(directory, "harness.yaml");
    const yaml = await Bun.file(path).text();
    await writeFile(join(directory, "system-prompt.md"), prompt);
    await subject.run(["--name", "exportme"]);
    expect(await Bun.file(join(projectRoot, "app", "exportmeAgent", "main.py")).text()).toContain(
      `DEFAULT_SYSTEM_PROMPT = """${prompt}"""`,
    );
    expect(await Bun.file(path).text()).toBe(yaml);
    expect(await readFile(join(directory, "system-prompt.md"), "utf8")).toBe(prompt);
  });

  test.each([
    ["malformed YAML", 1],
    ["blank prompt file", 2],
  ] as const)(
    "classifies %s as customer configuration through the CLI boundary",
    async (failure, exitCode) => {
      const subject = testExportCommand();
      const projectRoot = await inProjectWithHarness(subject);
      const directory = join(projectRoot, "app", "exportme");
      const path = join(directory, "harness.yaml");
      const promptPath = join(directory, "system-prompt.md");
      if (failure === "malformed YAML") await writeFile(path, "name: [");
      else await writeFile(promptPath, " \n");
      const specPath = join(projectRoot, "agentcore", "agentcore.json");
      const before = await Bun.file(specPath).text();
      const error = await subject
        .run(["--name", "exportme", "--json"])
        .catch(AgentCoreCLIError.fromError);
      expect(error).toBeInstanceOf(AgentCoreCLIError);
      expect(error).toMatchObject({
        source: "user",
        exitCode,
      });
      expect((error as Error).message).toContain(failure === "malformed YAML" ? path : promptPath);
      expect(existsSync(join(projectRoot, "app", "exportmeAgent"))).toBe(false);
      expect(await Bun.file(specPath).text()).toBe(before);
    },
  );

  test("requires exactly one of --name and --arn", async () => {
    const subject = testExportCommand();
    await inProjectWithHarness(subject);

    await expect(subject.run([])).rejects.toThrow(/specify exactly one of --name, --arn/);
    await expect(subject.run(["--name", "exportme", "--arn", HARNESS_ARN])).rejects.toThrow(
      /specify exactly one of --name, --arn/,
    );
  });

  test("exports an in-project harness to a buildable runtime and registers it", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);

    await subject.run(["--name", "exportme"]);

    // Generated code reflects the harness spec.
    const agentDir = join(projectRoot, "app", "exportmeAgent");
    expect(await Bun.file(join(agentDir, "main.py")).text()).toContain(
      'DEFAULT_SYSTEM_PROMPT = """You are a terse assistant."""',
    );
    const loadModel = await Bun.file(join(agentDir, "model", "load.py")).text();
    expect(loadModel).toContain('model_id="us.amazon.nova-lite-v1:0"');
    expect(loadModel).toContain("max_tokens=256");
    expect(await Bun.file(join(agentDir, "EXPORT_NOTES.md")).text()).toContain(
      "# Export Notes — exportme → exportmeAgent",
    );

    // agentcore.json gains the runtime; the harness entry stays.
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes).toContainEqual({
      name: "exportmeAgent",
      build: "CodeZip",
      entrypoint: "main.py",
      codeLocation: "app/exportmeAgent",
      protocol: "HTTP",
      runtimeVersion: "PYTHON_3_14",
      networkMode: "PUBLIC",
      authorizerType: "AWS_IAM",
      tags: {},
    });
    expect(spec.harnesses).toEqual([{ name: "exportme", path: "app/exportme" }]);

    // Dependencies are installed in the new agent dir.
    expect(subject.core.projectCommands).toContainEqual({
      command: ["uv", "sync"],
      cwd: agentDir,
    });

    expect(subject.io.stderr()).toContain(
      "Exported harness 'exportme' to runtime agent 'exportmeAgent'",
    );
    expect(subject.io.stdout()).toBe("");
  });

  test("derives the default target name and honors --target-agent-name", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);

    await subject.run(["--name", "exportme", "--target-agent-name", "my_agent"]);

    expect(existsSync(join(projectRoot, "app", "my_agent", "main.py"))).toBe(true);
    await expect(
      subject.run(["--name", "exportme", "--target-agent-name", "9bad"]),
    ).rejects.toThrow(/invalid --target-agent-name/);
  });

  test("refuses to overwrite an existing runtime, harness, or directory", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);

    // The scaffolded template runtime already owns its name.
    await expect(
      subject.run(["--name", "exportme", "--target-agent-name", "agent"]),
    ).rejects.toThrow(/runtime with name 'agent' already exists/);
    // A harness name is just as taken.
    await expect(
      subject.run(["--name", "exportme", "--target-agent-name", "exportme"]),
    ).rejects.toThrow(/harness with name 'exportme' already exists/);

    // A second export of the same harness collides with the first.
    await subject.run(["--name", "exportme"]);
    const specBefore = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).text();
    await expect(subject.run(["--name", "exportme"])).rejects.toThrow(
      /runtime with name 'exportmeAgent' already exists/,
    );
    expect(await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).text()).toBe(
      specBefore,
    );
  });

  test("fails clearly when the harness is not in the project", async () => {
    const subject = testExportCommand();
    await inProjectWithHarness(subject);

    await expect(subject.run(["--name", "nope"])).rejects.toThrow(
      /Harness 'nope' not found .* Available harnesses: exportme/,
    );
  });

  test.each([
    ["local", "exportme", ["--name", "exportme"]],
    ["service ARN", "remote_harness", ["--arn", HARNESS_ARN]],
  ] as const)(
    "renders completed TTY progress for a %s harness",
    async (source, harnessName, args) => {
      const subject = testExportCommand();
      await inProjectWithHarness(subject);
      if (source === "service ARN") {
        subject.core.harness.setGetResponse({
          harness: {
            harnessName,
            model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
          },
        } as never);
      }

      await subject.run([...args], { isTTY: true });

      const output = subject.io.stderr().replace(ANSI_SEQUENCE, "");
      if (source === "service ARN") {
        expect(output).toContain("✓ Fetching harness from the service");
        expect(output.indexOf("✓ Fetching harness from the service")).toBeLessThan(
          output.indexOf("✓ Reading project spec file"),
        );
      } else {
        expect(output).toContain("✓ Reading harness configuration");
      }
      expect(output).toContain("✓ Reading project spec file");
      expect(output).toContain(`✓ Mapping harness '${harnessName}'`);
      expect(output).toContain(`✓ Rendering agent code at 'app/${harnessName}Agent'`);
      expect(output).toContain("✓ Writing EXPORT_NOTES.md");
      expect(output).toContain("✓ Updating project spec file");
      expect(output).toContain("✓ Syncing Python dependencies with uv");
      expect(output).toContain(
        `Exported harness '${harnessName}' to runtime agent '${harnessName}Agent' (${join("app", `${harnessName}Agent`)})\n`,
      );
      expect(output).toContain(
        "Next steps:\n  Review the generated code\n  agentcore build\n  agentcore deploy",
      );
      expect(output.indexOf("✓ Syncing Python dependencies with uv")).toBeLessThan(
        output.indexOf("Exported harness"),
      );
      expect(subject.io.stdout()).toBe("");
    },
  );

  test.each([
    ["local", false, "exportme", ["--name", "exportme"]],
    ["local", true, "exportme", ["--name", "exportme"]],
    ["service ARN", true, "remote_harness", ["--arn", HARNESS_ARN]],
  ] as const)(
    "emits only JSON and plain progress for a %s harness (TTY: %s)",
    async (source, isTTY, harnessName, args) => {
      const subject = testExportCommand();
      const projectRoot = await inProjectWithHarness(subject);
      if (source === "service ARN") {
        subject.core.harness.setGetResponse({
          harness: {
            harnessName,
            model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
          },
        } as never);
      }

      await subject.run([...args, "--json"], { isTTY });

      expect(JSON.parse(subject.io.stdout())).toEqual({
        harnessName,
        agentName: `${harnessName}Agent`,
        agentPath: join(projectRoot, "app", `${harnessName}Agent`),
        notesPath: join(projectRoot, "app", `${harnessName}Agent`, "EXPORT_NOTES.md"),
        notes: [],
      });
      const progress = subject.io.stderr();
      expect(progress).toContain("Reading project spec file");
      expect(progress).toContain("Syncing Python dependencies with uv");
      if (source === "service ARN") {
        expect(progress.split("\n")[0]).toBe("Fetching harness from the service");
      }
      expect(progress).not.toContain(String.fromCharCode(0x1b));
      expect(progress).not.toContain("✓");
      expect(progress).not.toContain("Exported harness");
      expect(progress).not.toContain("Next steps:");
      expect(progress).not.toContain("agentcore build");
      expect(progress).not.toContain("agentcore deploy");
    },
  );

  test.each([false, true])(
    "keeps external memory details in EXPORT_NOTES.md (JSON: %s)",
    async (jsonOutput) => {
      const subject = testExportCommand();
      const projectRoot = await inProjectWithHarness(subject);
      const memoryArn = "arn:aws:bedrock-agentcore:us-west-2:111122223333:memory/external-abc123";
      subject.core.harness.setGetResponse({
        harness: {
          harnessName: "remote_harness",
          model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
          memory: {
            agentCoreMemoryConfiguration: { arn: memoryArn, messagesCount: 12 },
          },
        },
      } as never);

      await subject.run(["--arn", HARNESS_ARN, ...(jsonOutput ? ["--json"] : [])], { isTTY: true });

      const notesPath = join(projectRoot, "app", "remote_harnessAgent", "EXPORT_NOTES.md");
      const notes = await readFile(notesPath, "utf8");
      const categories = [
        "Harness memory tuning requires manual follow-up",
        "External memory reference not exported",
      ];
      for (const category of categories) expect(notes).toContain(`### ${category}`);
      expect(notes).toContain("messagesCount=12");
      expect(notes).toContain(memoryArn);
      expect(notes).toContain("runtime role needs memory permissions on that ARN");
      expect(notes).toContain("memory/session.py");
      const output = subject.io.stderr().replace(ANSI_SEQUENCE, "");
      expect(output).not.toContain(memoryArn);
      expect(output).not.toContain("messagesCount=12");
      expect(output).not.toContain("runtime role needs memory permissions on that ARN");
      if (jsonOutput) {
        const summary = JSON.parse(subject.io.stdout());
        expect(summary.notesPath).toBe(notesPath);
        expect(summary.notes.map((note: { category: string }) => note.category)).toEqual(
          categories,
        );
        for (const note of summary.notes) expect(notes).toContain(note.message);
        expect(subject.io.stderr()).not.toContain(String.fromCharCode(0x1b));
        expect(output).not.toContain("export notes requiring manual follow-up:");
        expect(output).not.toContain(
          `Review ${join("app", "remote_harnessAgent", "EXPORT_NOTES.md")}`,
        );
        expect(output).not.toContain("Next steps:");
        expect(output).not.toContain("Exported harness");
      } else {
        expect(output).toContain(
          "2 export notes requiring manual follow-up:\n" +
            categories.map((category) => `  - ${category}\n`).join("") +
            `Review ${join("app", "remote_harnessAgent", "EXPORT_NOTES.md")} for details.\n`,
        );
        expect(output).toContain(
          `Exported harness 'remote_harness' to runtime agent 'remote_harnessAgent' (${join("app", "remote_harnessAgent")})`,
        );
        expect(output).not.toContain(notesPath);
        expect(subject.io.stdout()).toBe("");
      }
    },
  );

  test("resolves displayed export paths from a nested project directory", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);
    const memoryArn = "arn:aws:bedrock-agentcore:us-west-2:111122223333:memory/external-abc123";
    subject.core.harness.setGetResponse({
      harness: {
        harnessName: "remote_harness",
        model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
        memory: {
          agentCoreMemoryConfiguration: { arn: memoryArn, messagesCount: 12 },
        },
      },
    } as never);
    const invocationDirectory = join(projectRoot, "app", "exportme");
    process.chdir(invocationDirectory);

    await subject.run(["--arn", HARNESS_ARN]);

    const output = subject.io.stderr();
    const displayedAgentPath = output.match(
      /Exported harness 'remote_harness' to runtime agent 'remote_harnessAgent' \(([^)]+)\)/,
    )?.[1];
    const displayedNotesPath = output.match(/Review (.+) for details\./)?.[1];
    const agentPath = join(projectRoot, "app", "remote_harnessAgent");
    const notesPath = join(agentPath, "EXPORT_NOTES.md");
    expect(displayedAgentPath).toBe(join("..", "remote_harnessAgent"));
    expect(resolve(invocationDirectory, displayedAgentPath!)).toBe(agentPath);
    expect(existsSync(join(agentPath, "main.py"))).toBe(true);
    expect(displayedNotesPath).toBe(join("..", "remote_harnessAgent", "EXPORT_NOTES.md"));
    expect(resolve(invocationDirectory, displayedNotesPath!)).toBe(notesPath);
    const notes = await readFile(resolve(invocationDirectory, displayedNotesPath!), "utf8");
    expect(notes).toContain("### External memory reference not exported");
    expect(notes).toContain(memoryArn);
    expect(notes).toContain("messagesCount=12");
    expect(notes).toContain("runtime role needs memory permissions on that ARN");
    expect(subject.io.stdout()).toBe("");
  });

  test.each(["local configuration", "service fetch"] as const)(
    "marks a failed %s step on a TTY without claiming success",
    async (failure) => {
      const subject = testExportCommand();
      const projectRoot = await inProjectWithHarness(subject);
      const specPath = join(projectRoot, "agentcore", "agentcore.json");
      const specBefore = await readFile(specPath, "utf8");
      let failedStep: string;
      if (failure === "service fetch") {
        const error = new Error("Harness fetch denied");
        subject.core.harness.setError(error);
        await expect(subject.run(["--arn", HARNESS_ARN], { isTTY: true })).rejects.toBe(error);
        failedStep = "Fetching harness from the service";
      } else {
        await writeFile(join(projectRoot, "app", "exportme", "system-prompt.md"), " \n");
        await expect(subject.run(["--name", "exportme"], { isTTY: true })).rejects.toThrow(
          "empty or whitespace-only",
        );
        failedStep = "Reading harness configuration";
      }

      const output = subject.io.stderr().replace(ANSI_SEQUENCE, "");
      expect(output).toContain(`✕ ${failedStep}`);
      expect(output).not.toContain(`✓ ${failedStep}`);
      expect(output).not.toContain("Exported harness");
      expect(output).not.toContain("Next steps:");
      expect(subject.io.stdout()).toBe("");
      expect(existsSync(join(projectRoot, "app", "exportmeAgent"))).toBe(false);
      expect(await readFile(specPath, "utf8")).toBe(specBefore);
    },
  );

  test("exports a service harness by ARN, fetching from the ARN's region", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);
    subject.core.harness.setGetResponse({
      harness: {
        harnessId: "h-abc123",
        harnessName: "remote_harness",
        arn: HARNESS_ARN,
        status: "READY",
        executionRoleArn: "arn:aws:iam::111122223333:role/HarnessRole",
        createdAt: new Date(0),
        updatedAt: new Date(0),
        model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
        systemPrompt: [{ text: "Fetched prompt." }],
        tools: [],
        skills: [],
      },
    } as never);

    await subject.run(["--arn", HARNESS_ARN, "--target-agent-name", "exported_arn"]);

    expect(subject.core.harness.calls).toEqual([
      {
        method: "getHarness",
        args: ["h-abc123", expect.objectContaining({ region: "us-west-2" })],
      },
    ]);
    expect(await Bun.file(join(projectRoot, "app", "exported_arn", "main.py")).text()).toContain(
      'DEFAULT_SYSTEM_PROMPT = """Fetched prompt."""',
    );
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(spec.runtimes.map((runtime: { name: string }) => runtime.name)).toContain(
      "exported_arn",
    );
  });

  test("defaults the --arn target name from the fetched harness name", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);
    subject.core.harness.setGetResponse({
      harness: {
        harnessName: "remote_harness",
        model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
      },
    } as never);

    await subject.run(["--arn", HARNESS_ARN]);

    expect(existsSync(join(projectRoot, "app", "remote_harnessAgent", "main.py"))).toBe(true);
  });

  /** A container harness in VPC mode, whose service VpcConfig carries no vpcId (the API has none). */
  function setVpcContainerHarness(subject: ReturnType<typeof testExportCommand>) {
    subject.core.harness.setGetResponse({
      harness: {
        harnessName: "remote_container",
        model: { bedrockModelConfig: { modelId: "us.amazon.nova-lite-v1:0" } },
        environmentArtifact: {
          containerConfiguration: {
            containerUri: "111122223333.dkr.ecr.us-west-2.amazonaws.com/base:latest",
          },
        },
        environment: {
          agentCoreRuntimeEnvironment: {
            networkConfiguration: {
              networkMode: "VPC",
              networkModeConfig: {
                subnets: ["subnet-0123456789abcdef0"],
                securityGroups: ["sg-0123456789abcdef0"],
              },
            },
          },
        },
      },
    } as never);
  }

  // A container harness in a VPC exports as CodeZip: no image build, so no CodeBuild and no vpcId
  // to supply. The service's subnets and security groups still carry over verbatim.
  test("exports a VPC container harness as CodeZip without additional lookups", async () => {
    const subject = testExportCommand();
    const projectRoot = await inProjectWithHarness(subject);
    setVpcContainerHarness(subject);

    await subject.run(["--arn", HARNESS_ARN]);

    expect(subject.core.harness.calls).toEqual([
      {
        method: "getHarness",
        args: ["h-abc123", expect.objectContaining({ region: "us-west-2" })],
      },
    ]);
    const spec = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    const runtime = spec.runtimes.find(
      (candidate: { name: string }) => candidate.name === "remote_containerAgent",
    );
    expect(runtime.build).toBe("CodeZip");
    expect(runtime.dockerfile).toBeUndefined();
    expect(runtime.networkConfig).toEqual({
      subnets: ["subnet-0123456789abcdef0"],
      securityGroups: ["sg-0123456789abcdef0"],
    });
    expect(existsSync(join(projectRoot, "app", "remote_containerAgent", "Dockerfile"))).toBe(false);
  });

  test("validates the project before fetching from the service", async () => {
    const subject = testExportCommand();
    cleanups.push((await inTempDirectory()).cleanup); // not a project

    await expect(subject.run(["--arn", HARNESS_ARN])).rejects.toThrow(/No AgentCore project found/);
    expect(subject.core.harness.calls).toEqual([]);
  });

  test("rejects a malformed --arn before calling the service", async () => {
    const subject = testExportCommand();
    await inProjectWithHarness(subject);

    await expect(subject.run(["--arn", "arn:aws:not-a-harness"])).rejects.toThrow(
      /not a valid harness ARN/,
    );
    expect(subject.core.harness.calls).toEqual([]);

    await expect(
      subject.run(["--arn", "arn:aws:lambda:us-west-2:111122223333:harness/h-abc123"]),
    ).rejects.toThrow(/not a valid harness ARN/);
    expect(subject.core.harness.calls).toEqual([]);
  });
});
