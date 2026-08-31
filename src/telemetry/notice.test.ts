import { test, describe, expect } from "bun:test";
import { getTelemetryNotice, printFirstRunNotice } from "./notice";

describe("getTelemetryNotice", () => {
  test("tells the user analytics are collected and how to opt out", () => {
    const notice = getTelemetryNotice();

    expect(notice).toContain("collects aggregated, anonymous usage analytics");
    expect(notice).toContain("agentcore config telemetry.enabled false");
  });
});

describe("printFirstRunNotice", () => {
  const collect = () => {
    const written: string[] = [];
    return { written, out: { write: (text: string) => void written.push(text) } };
  };

  test("writes the notice on a first run", () => {
    const { written, out } = collect();

    printFirstRunNotice(true, out);

    expect(written).toEqual([getTelemetryNotice()]);
  });

  test("writes nothing when it is not a first run", () => {
    const { written, out } = collect();

    printFirstRunNotice(false, out);

    expect(written).toEqual([]);
  });
});
