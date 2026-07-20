import { test, expect, describe } from "bun:test";
import { Router, createHandler } from "../router";
import { createProjectManager } from "../core/project";
import { createSilentLogger } from "../testing";
import { withProject } from "./withProject";

describe("withProject", () => {
  test("throws not implemented", async () => {
    const projectManager = createProjectManager({ logger: createSilentLogger() });

    const app = new Router("app", "test");
    app.use(withProject({ projectManager, cwd: "/some/path" }));
    app.handler(
      createHandler({
        name: "check",
        description: "noop",
        handle: async () => {},
      }),
    );

    await expect(app.route(["node", "app", "check"])).rejects.toThrow(/not implemented/);
  });
});
