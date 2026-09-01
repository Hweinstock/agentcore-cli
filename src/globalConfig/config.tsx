import type { DeepPartial, GlobalConfig } from "./types";

/**
 * Default values for the global config. Includes a unique installationId for each process.
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  telemetry: {
    enabled: true,
    audit: false,
    endpoint: "https://telemetry.agentcore.aws.dev",
  },
  installationId: crypto.randomUUID(),
};

/** Returns true when AGENTCORE_TELEMETRY_DISABLED is set to "true" or "1". */
function telemetryDisabledByEnv(): boolean {
  const value = process.env.AGENTCORE_TELEMETRY_DISABLED?.toLowerCase().trim();
  return value === "true" || value === "1";
}

/**
 * Applies the given overrides from a partial config on top of the provided defaults and returns the merged result.
 * The AGENTCORE_TELEMETRY_DISABLED env var takes precedence over both overrides and defaults for telemetry.enabled.
 */
export function applyOverrides(
  defaults: GlobalConfig,
  overrides: DeepPartial<GlobalConfig>,
): GlobalConfig {
  return {
    telemetry: {
      enabled: telemetryDisabledByEnv()
        ? false
        : (overrides.telemetry?.enabled ?? defaults.telemetry.enabled),
      audit: overrides.telemetry?.audit ?? defaults.telemetry.audit,
      endpoint: overrides.telemetry?.endpoint ?? defaults.telemetry.endpoint,
    },
    installationId: overrides.installationId ?? defaults.installationId,
  };
}
