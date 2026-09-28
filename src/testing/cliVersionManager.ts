import { NpmCliVersionManager } from "../cliVersionManager";
import { PACKAGE_VERSION } from "../constants";
import { createSilentLogger } from "./logging";

export function createTestCliVersionManager(): NpmCliVersionManager {
  return new NpmCliVersionManager({
    currentVersion: PACKAGE_VERSION,
    cacheDirectory: "",
    logger: createSilentLogger(),
    registryVersionFetcher: async () => PACKAGE_VERSION,
    json: {
      read: async (_filePath, schema) =>
        schema.parse({
          latestVersion: PACKAGE_VERSION,
          lastCheckedAt: new Date().toISOString(),
        }),
      write: async (_filePath, data) => data,
    },
  });
}
