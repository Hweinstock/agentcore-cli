import { test, expect, describe } from "bun:test";
import type { CreateABTestResponse } from "@aws-sdk/client-bedrock-agentcore";
import { createRootHandler } from "../../index";
import { createSilentLogger, TestCoreClient, testIO } from "../../../testing";
import { TestGlobalConfigAccessor } from "../../../testing/";

const OK: CreateABTestResponse = {
  abTestId: "orders-v2-abc123",
  abTestArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:ab-test/orders-v2-abc123",
  name: "orders-v2",
  status: "CREATING",
  executionStatus: "NOT_STARTED",
  createdAt: new Date("2026-08-26T10:00:00.000Z"),
} satisfies CreateABTestResponse;

async function run(args: string[], configure?: (core: TestCoreClient) => void) {
  const core = new TestCoreClient();
  core.eval.setAbTestCreateResponse(OK);
  configure?.(core);
  const io = testIO();
  const root = createRootHandler(core, {
    io: io.io,
    logger: createSilentLogger(),
    globalConfigAccessor: new TestGlobalConfigAccessor(),
  });
  await root.route(["node", "agentcore", ...args, "--region", "us-west-2"]);
  return { core, stdout: io.stdout() };
}

const BASE = [
  "eval",
  "ab-test",
  "config-bundle",
  "run",
  "--name",
  "orders-v2",
  "--gateway",
  "orders-gateway-abc123",
  "--control",
  '{"config-bundle":"orders-prompt-abc","bundle-version":"1111"}',
  "--treatment",
  '{"config-bundle":"orders-prompt-abc","bundle-version":"2222"}',
  "--online-eval",
  "online-eval-abc123",
  "--json",
];

describe("eval ab-test config-bundle run", () => {
  test("registers under ab-test → config-bundle", () => {
    const io = testIO();
    const root = createRootHandler(new TestCoreClient(), {
      io: io.io,
      logger: createSilentLogger(),
      globalConfigAccessor: new TestGlobalConfigAccessor(),
    });
    const abTest = root
      .children()
      .find((c) => c.name() === "eval")
      ?.children()
      .find((c) => c.name() === "ab-test");
    expect(abTest?.children().map((c) => c.name())).toContain("config-bundle");
    const cb = abTest?.children().find((c) => c.name() === "config-bundle");
    expect(cb?.children().map((c) => c.name())).toEqual(["run"]);
  });

  test("maps flags to a createConfigBundleABTest call", async () => {
    const { core, stdout } = await run([...BASE, "--treatment-weight", "20"]);
    expect(JSON.parse(stdout).abTestId).toBe("orders-v2-abc123");
    const call = core.eval.calls.find((c) => c.method === "createConfigBundleABTest");
    expect(call?.args[0]).toEqual({
      name: "orders-v2",
      gateway: "orders-gateway-abc123",
      control: { configBundle: "orders-prompt-abc", bundleVersion: "1111" },
      treatment: { configBundle: "orders-prompt-abc", bundleVersion: "2222" },
      onlineEval: "online-eval-abc123",
      treatmentWeight: 20,
      gatewayFilter: undefined,
      roleArn: undefined,
      disableOnCreate: false,
    });
    expect(call?.args[1]).toEqual({ region: "us-west-2" });
  });

  test("passes --gateway-filter through as a GatewayFilter", async () => {
    const { core } = await run([
      ...BASE,
      "--gateway-filter",
      '{"targetPaths":["/orders/checkout"]}',
    ]);
    const call = core.eval.calls.find((c) => c.method === "createConfigBundleABTest");
    expect(call).toBeDefined();
    expect((call!.args[0] as { gatewayFilter?: unknown }).gatewayFilter).toEqual({
      targetPaths: ["/orders/checkout"],
    });
  });

  test("passes --disable-on-create and --role-arn through", async () => {
    const { core } = await run([
      ...BASE,
      "--disable-on-create",
      "--role-arn",
      "arn:aws:iam::123456789012:role/customer-owned",
    ]);
    const call = core.eval.calls.find((c) => c.method === "createConfigBundleABTest");
    const input = call?.args[0] as { disableOnCreate?: boolean; roleArn?: string };
    expect(input.disableOnCreate).toBe(true);
    expect(input.roleArn).toBe("arn:aws:iam::123456789012:role/customer-owned");
  });

  test("rejects equal control/treatment bundle-versions", async () => {
    await expect(
      run([
        "eval",
        "ab-test",
        "config-bundle",
        "run",
        "--name",
        "x",
        "--gateway",
        "g",
        "--control",
        '{"config-bundle":"b","bundle-version":"same"}',
        "--treatment",
        '{"config-bundle":"b","bundle-version":"same"}',
        "--online-eval",
        "o",
        "--json",
      ]),
    ).rejects.toThrow(/must reference a different/);
  });

  test("rejects --treatment-weight outside 1-99", async () => {
    await expect(run([...BASE, "--treatment-weight", "0"])).rejects.toThrow(/1 and 99/);
    await expect(run([...BASE, "--treatment-weight", "100"])).rejects.toThrow(/1 and 99/);
  });

  test.each(["name", "gateway", "control", "treatment", "online-eval"] as const)(
    "requires --%s",
    async (missing) => {
      const args = BASE.filter((_, i, arr) => {
        const prev = arr[i - 1];
        return prev !== `--${missing}` && arr[i] !== `--${missing}`;
      });
      await expect(run(args)).rejects.toThrow(new RegExp(`--${missing}`));
    },
  );

  test("rejects a malformed control JSON shape", async () => {
    await expect(
      run([
        "eval",
        "ab-test",
        "config-bundle",
        "run",
        "--name",
        "x",
        "--gateway",
        "g",
        "--control",
        '{"wrong":"shape"}',
        "--treatment",
        '{"config-bundle":"b","bundle-version":"2"}',
        "--online-eval",
        "o",
        "--json",
      ]),
    ).rejects.toThrow(/--control must be/);
  });
});
