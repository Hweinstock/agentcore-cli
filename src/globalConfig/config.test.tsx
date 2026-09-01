import { test, describe, afterEach, expect } from "bun:test";
import { DEFAULT_GLOBAL_CONFIG, applyOverrides } from "./config";

describe("applyOverrides", () => {
  afterEach(() => {
    delete process.env.AGENTCORE_TELEMETRY_DISABLED;
  });

  test("applies overrides on top of defaults", () => {
    const result = applyOverrides(DEFAULT_GLOBAL_CONFIG, {
      telemetry: { enabled: false, audit: true },
    });
    expect(result.telemetry.enabled).toBe(false);
    expect(result.telemetry.audit).toBe(true);
    expect(result.telemetry.endpoint).toBe(DEFAULT_GLOBAL_CONFIG.telemetry.endpoint);
  });

  test.each(["true", "TRUE", "1", " 1 "])(
    "AGENTCORE_TELEMETRY_DISABLED=%p disables telemetry over enabled config",
    (value) => {
      process.env.AGENTCORE_TELEMETRY_DISABLED = value;
      const result = applyOverrides(DEFAULT_GLOBAL_CONFIG, { telemetry: { enabled: true } });
      expect(result.telemetry.enabled).toBe(false);
    },
  );

  test("AGENTCORE_TELEMETRY_DISABLED does not affect audit", () => {
    process.env.AGENTCORE_TELEMETRY_DISABLED = "1";
    const result = applyOverrides(DEFAULT_GLOBAL_CONFIG, { telemetry: { audit: true } });
    expect(result.telemetry.audit).toBe(true);
  });

  test.each(["false", "0", "", "no"])(
    "AGENTCORE_TELEMETRY_DISABLED=%p leaves telemetry enabled",
    (value) => {
      process.env.AGENTCORE_TELEMETRY_DISABLED = value;
      const result = applyOverrides(DEFAULT_GLOBAL_CONFIG, { telemetry: { enabled: true } });
      expect(result.telemetry.enabled).toBe(true);
    },
  );
});
