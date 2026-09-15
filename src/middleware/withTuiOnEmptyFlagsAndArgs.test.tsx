import { describe, expect, test } from "bun:test";
import z from "zod";
import { withTuiOnEmptyFlagsAndArgs } from "./withTuiOnEmptyFlagsAndArgs";
import { Router, createHandler, flag } from "../router";
import { JsonKey } from "../handlers/keys";
import { TestCoreClient, testIO } from "../testing";

// route runs a command tree whose leaf flags all carry defaults. The branch the
// middleware takes is observable through whether the leaf handler runs.
function route(
  args: string[],
  supportedTuiCommands?: string[],
): { ran: () => boolean; routed: Promise<void> } {
  let handled = false;
  const leaf = createHandler({
    name: "leaf",
    description: "a leaf with only defaulted flags",
    flags: [
      flag("template", "defaulted enum", z.enum(["a", "b"]).default("a")),
      flag("skip-thing", "defaulted boolean", z.boolean().default(false)),
    ],
    handle: async () => {
      handled = true;
    },
  });

  const root = new Router("agentcore", "test root")
    .groupFlags(JsonKey)
    .use(withTuiOnEmptyFlagsAndArgs(new TestCoreClient(), testIO().io))
    .handler(leaf);
  if (supportedTuiCommands) {
    root.supportedTuiCommands(...supportedTuiCommands);
  }

  return { ran: () => handled, routed: root.route(["node", "agentcore", "leaf", ...args]) };
}

describe("withTuiOnEmptyFlagsAndArgs", () => {
  test("runs the handler for a bare non-TTY invocation", async () => {
    const { ran, routed } = route([]);

    await routed;
    expect(ran()).toBe(true);
  });

  test("runs an unsupported bare command through its normal handler", async () => {
    const { ran, routed } = route([], []);

    await routed;
    expect(ran()).toBe(true);
  });

  test.each([
    ["a defaulted boolean flag", ["--skip-thing"]],
    ["a defaulted value flag", ["--template", "b"]],
    ["--json", ["--json"]],
  ])("runs the handler when %s is passed explicitly", async (_label, args) => {
    const { ran, routed } = route(args);

    await routed;
    expect(ran()).toBe(true);
  });
});
