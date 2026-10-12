import { afterEach, test, expect, describe } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CommandRunMetricEventKey,
  ProjectKey,
  Router,
  ValueContext,
  createHandler,
} from "../router";
import { createSilentLogger, TestGlobalConfigAccessor, TestIdentityClient } from "../testing";
import { withProject } from "./withProject";
import { FsProjectManager } from "../core/project";
import { ProjectStateError } from "../errors";
import { DefaultTelemetryClient } from "../telemetry";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("withProject", () => {
  test("throws when no project encloses the cwd", async () => {
    const projectManager = new FsProjectManager({
      logger: createSilentLogger(),
      identity: new TestIdentityClient(),
      enableTransactionSearch: async () => {},
    });

    const app = new Router("app", "test");
    app.use(withProject({ projectManager, cwd: "/some/path" }));
    app.handler(
      createHandler({
        name: "check",
        description: "noop",
        handle: async () => {},
      }),
    );

    await expect(app.route(["node", "app", "check"])).rejects.toThrow(/No AgentCore project found/);
  });

  test("defaults to the cwd at invocation time when none is configured", async () => {
    const projectManager = new FsProjectManager({
      logger: createSilentLogger(),
      identity: new TestIdentityClient(),
      enableTransactionSearch: async () => {},
    });

    const app = new Router("app", "test");
    app.use(withProject({ projectManager }));
    app.handler(createHandler({ name: "check", description: "noop", handle: async () => {} }));

    // tmpdir encloses no project, so the message must name the cwd it searched.
    await expect(app.route(["node", "app", "check"])).rejects.toThrow(process.cwd());
  });

  test.each([
    { version: 1, fails: false, expected: true },
    { version: 1, fails: true, expected: true },
    { version: 2, fails: false, expected: false },
    { version: 2, fails: true, expected: false },
  ])(
    "emits v0_project=$expected for version $version when failure=$fails",
    async ({ version, fails, expected }) => {
      const root = await mkdtemp(join(tmpdir(), "agentcore-project-metric-"));
      directories.push(root);
      const configPath = join(root, "agentcore", "agentcore.json");
      const contents = JSON.stringify({ name: "example", version });
      await mkdir(join(root, "agentcore"), { recursive: true });
      await writeFile(configPath, contents);
      const logger = createSilentLogger();
      const projectManager = new FsProjectManager({
        logger,
        identity: new TestIdentityClient(),
        enableTransactionSearch: async () => {},
      });
      const recorded: Record<string, string | number | boolean>[] = [];
      const telemetryClient = new DefaultTelemetryClient({
        logger,
        globalConfigAccessor: new TestGlobalConfigAccessor(),
        sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        currentVersion: "1.0.0",
        metricSinks: [
          {
            getName: () => "test",
            send: (_name, _value, attributes) => recorded.push(attributes),
            shutdown: async () => {},
          },
        ],
      });
      const event = telemetryClient.createMetricEvent("cli.command_run", {
        exit_reason: "success",
      });
      const app = new Router("agentcore", "test");
      app.use(withProject({ projectManager, cwd: root }));
      app.handler(
        createHandler({
          name: "status",
          description: "check",
          handle: async (ctx) => {
            if (!fails) return;
            if (version === 1) {
              await projectManager.removeAllResources(ctx.require(ProjectKey));
              return;
            }
            throw new ProjectStateError("operation failed");
          },
        }),
      );
      const route = app.route(
        ["node", "agentcore", "status"],
        ValueContext.EmptyContext().withValue(CommandRunMetricEventKey, event),
      );
      if (fails) {
        await expect(route).rejects.toThrow(version === 1 ? "read-only" : "operation failed");
        event.setAttributes({ exit_reason: "failure" });
      } else {
        await route;
      }
      await event.emit(10);
      await telemetryClient.shutdown();

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        command_path: "/agentcore/status",
        exit_reason: fails ? "failure" : "success",
        v0_project: expected,
      });
      expect(await readFile(configPath, "utf8")).toBe(contents);
    },
  );
});
