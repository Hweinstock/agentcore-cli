import { test, expect, describe, afterEach } from "bun:test";
import {
  renderScreen,
  waitForFlatText,
  waitForText,
  cleanupScreens,
  compiledRootCommand,
  createSilentLogger,
  menuEntries,
  TestCoreClient,
  TestGlobalConfigAccessor,
  inTempDirectory,
  testIO,
  ttyTestIO,
  waitFor,
} from "../../testing";
import { createRootHandler } from "../index";
import { createProjectHandler } from ".";

afterEach(cleanupScreens);
const cleanups: Array<() => Promise<void>> = [];
afterEach(() => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

// projectSubcommands reads the project group's children off the compiled
// Commander tree, so tests driven by it cover any subcommand added later.
function projectSubcommands(): string[] {
  const root = compiledRootCommand();
  const project = root.commands.find((command) => command.name() === "project")!;
  return project.commands.map((command) => command.name());
}

describe("project menu", () => {
  test("lists every project subcommand", async () => {
    const r = renderScreen("/agentcore/project");

    await waitForText(r.lastFrame, "manage an AgentCore project");
    const frame = r.lastFrame()!;
    for (const command of projectSubcommands()) {
      expect(frame).toContain(command);
    }
    r.unmount();
  });

  test("is reachable from the root menu", async () => {
    const r = renderScreen("/agentcore");

    await waitForText(r.lastFrame, "manage an AgentCore project");
    await r.write("project");
    await waitForText(r.lastFrame, "❯ project");
    await r.press("return");

    await waitForText(r.lastFrame, "agentcore → project");
    expect(r.lastFrame()).toContain("create");
    r.unmount();
  });

  test("esc returns to the root menu", async () => {
    const r = renderScreen("/agentcore/project");

    await waitForText(r.lastFrame, "agentcore → project");
    await r.press("escape");

    await waitForText(r.lastFrame, "the platform for production AI agents");
    r.unmount();
  });
});

// projectCommand resolves a compiled project subcommand by path, for reading
// the help the CLI-only screen must match.
function projectCommand(...path: string[]) {
  const root = compiledRootCommand();
  let command = root.commands.find((c) => c.name() === "project")!;
  for (const name of path) command = command.commands.find((c) => c.name() === name)!;
  return command;
}

describe("project menu: command-line-only subcommands", () => {
  test("are listed below a divider, after the ones with a screen", async () => {
    const r = renderScreen("/agentcore/project");

    await waitForText(r.lastFrame, "command line only");
    const withScreens = ["create", "deploy", "invoke", "build", "status", "add", "remove"];
    const { screens, cliOnly } = menuEntries(r.lastFrame()!);
    expect(screens.toSorted()).toEqual(withScreens.toSorted());
    expect(cliOnly.toSorted()).toEqual(
      projectSubcommands()
        .filter((c) => !withScreens.includes(c))
        .toSorted(),
    );
    r.unmount();
  });

  test("a group drills down to its leaves' help and back", async () => {
    const r = renderScreen("/agentcore/project/add");

    await waitForText(r.lastFrame, "agentcore → project → add");
    await r.write("gateway");
    await waitForText(r.lastFrame, "❯ gateway");
    await r.press("return");

    await waitForText(r.lastFrame, "agentcore → project → add → gateway");
    const frame = r.lastFrame()!.replace(/\s+/g, " ");
    expect(frame).toContain("this command runs from the command line");
    expect(frame).toContain("agentcore project add gateway [options]");
    expect(frame).toContain("--authorizer-type");

    await r.press("escape");
    await waitForText(r.lastFrame, "agentcore → project → add");
    r.unmount();
  });

  test("help longer than the terminal scrolls, and the parameter details are reachable", async () => {
    // `add gateway-target` has ten options plus a long --target-configuration
    // write-up, which `--help` appends as "Parameter details"; at 80×24 most of
    // it is below the fold.
    const r = renderScreen("/agentcore/project/add/gateway-target");
    await r.resize(80, 24);
    await waitForText(r.lastFrame, "this command runs from the command line");
    expect(r.lastFrame()).not.toContain("curated Connector shortcuts");

    // Scroll to the end: the write-up's last line is the last thing on the page.
    for (let i = 0; i < 80; i++) await r.press("down");
    const bottom = r.lastFrame()!.replace(/\s+/g, " ");
    expect(bottom).toContain("Use project add gateway-connector for curated Connector shortcuts.");
    // …and the heading was on the way.
    expect(r.frames.some((frame) => frame.includes("Parameter details:"))).toBe(true);

    for (let i = 0; i < 80; i++) await r.press("up");
    await waitForText(r.lastFrame, "this command runs from the command line");
    r.unmount();
  });

  // These three exercise the help viewport, so they need a command-line-only
  // resource whose help is longer than the terminal: `add payment-manager`.
  test("growing the terminal after scrolling to the bottom pulls the content back into view", async () => {
    const r = renderScreen("/agentcore/project/add/payment-manager");
    await r.resize(80, 24);
    await waitForText(r.lastFrame, "this command runs from the command line");
    for (let i = 0; i < 80; i++) await r.press("down");
    expect(r.lastFrame()).not.toContain("this command runs from the command line");

    // Tall enough for the whole help: the offset must fall back to the top
    // rather than leave a mostly blank viewport. Height only — a width change
    // reflows the content, which would mask a clamp that read a stale height.
    await r.resize(80, 120);
    await waitForText(r.lastFrame, "this command runs from the command line");
    expect(r.lastFrame()).toContain("--default-spend-limit");
    r.unmount();
  });

  test("a key that fills its column still stands clear of its value", async () => {
    const r = renderScreen("/agentcore/project/add/payment-manager");
    await r.resize(40, 60);
    // Narrow enough that the intro wraps and the key column hits its cap.
    await waitForFlatText(r.lastFrame, "this command runs from the command line");
    const lines = r.lastFrame()!.split("\n");
    // "--description <description>" wraps within the capped column…
    expect(lines.some((line) => /^\s+<description>\s{2,}\S/.test(line))).toBe(true);
    // …and no line runs a key straight into its value (checked case-insensitively;
    // this is a terminal layout check, not an HTML filter).
    expect(lines.some((line) => /<[a-z-]+>[a-z]/i.test(line))).toBe(false);
    r.unmount();
  });

  test("every option is reachable on a small terminal", async () => {
    const r = renderScreen("/agentcore/project/add/payment-manager");
    await r.resize(80, 24);
    await waitForText(r.lastFrame, "this command runs from the command line");

    const seen = new Set<string>();
    const collect = () => {
      for (const match of r.lastFrame()!.matchAll(/--[a-z][a-z-]*/g)) seen.add(match[0]);
    };
    collect();
    for (let i = 0; i < 60; i++) {
      await r.press("down");
      collect();
    }
    const compiled = projectCommand("add", "payment-manager");
    for (const option of compiled.options) {
      if (option.long && option.long !== "--help") expect(seen).toContain(option.long);
    }
    r.unmount();
  });

  test("an unknown project path retains the standard help fallback", async () => {
    const r = renderScreen("/agentcore/project/no-such-command");
    await waitForText(() => r.frames.join("\n"), "Usage:");
    expect(r.frames.join("\n")).not.toContain("command line only");
    r.unmount();
  });
});

describe("agentcore project (no subcommand)", () => {
  test("skips project resolution for create when mounted independently", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    const io = testIO();
    const project = createProjectHandler({ core: new TestCoreClient(), io: io.io });

    await expect(project.route(["node", "project", "create"])).rejects.toThrow(
      "required option '--name <name>' not specified",
    );
  });

  test("opens the project menu on a TTY outside a project", async () => {
    cleanups.push((await inTempDirectory()).cleanup);
    const { streams, stdin } = ttyTestIO();
    const root = createRootHandler(new TestCoreClient(), {
      io: streams.io,
      logger: createSilentLogger(),
      globalConfigAccessor: new TestGlobalConfigAccessor(),
    });

    const outcome = root.route(["node", "agentcore", "project"]);
    await waitFor(() => streams.stdout().includes("manage an AgentCore project"), 5000);
    stdin.write("\x03");

    await expect(outcome).resolves.toBeUndefined();
    expect(streams.stderr()).not.toContain("No AgentCore project found");
  }, 10000);

  test("prints help instead of the TUI under --json", async () => {
    const io = testIO();
    const root = createRootHandler(new TestCoreClient(), {
      io: io.io,
      logger: createSilentLogger(),
      globalConfigAccessor: new TestGlobalConfigAccessor(),
    });

    await root.route(["node", "agentcore", "project", "--json"]);

    expect(io.stdout()).toContain("Usage:");
    expect(io.stdout()).toContain("create");
  });
});
