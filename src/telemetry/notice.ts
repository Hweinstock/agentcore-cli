/**
 * Returns the one-time telemetry notice shown on the first run of the CLI,
 * informing the user that anonymous usage analytics are collected and how to
 * opt out.
 */
export function getTelemetryNotice(): string {
  return [
    "",
    "The AgentCore CLI collects aggregated, anonymous usage analytics to help improve the tool.",
    "To opt out:   agentcore config telemetry.enabled false",
    "To audit:     agentcore config telemetry.audit true",
    "",
  ].join("\n");
}

/** Writes the telemetry notice to the given stream, but only on a first run. */
export function printFirstRunNotice(isFirstRun: boolean, out: { write(text: string): void }): void {
  if (isFirstRun) out.write(getTelemetryNotice());
}
