import {
  type DeepPartial,
  type GlobalConfig,
  type GlobalConfigAccessor,
  type GlobalConfigFileData,
} from "./types";
import type { ReadWriteJson } from "../io";
import type { Logger } from "../logging";
import { globalConfigFileSchema } from "./types";
import { DEFAULT_GLOBAL_CONFIG, applyOverrides } from "./config";
import z from "zod";
import { DeserializationError, InputValidationError } from "../errors";

type DefaultGlobalConfigAccessorConfig = {
  logger: Logger;
  json: ReadWriteJson;
  filePath: string;
};

/**
 * Implements {@link GlobalConfigAccessor} accepting overrides from the given file.
 *
 * @param config - The logger and json datasource to be used by the config. .
 * @returns A {@link GlobalConfigAccessor} instance.
 */
export class DefaultGlobalConfigAccessor implements GlobalConfigAccessor {
  private cachedConfig: GlobalConfig | undefined;
  private firstRun: boolean | undefined;
  private readonly json: ReadWriteJson;
  private readonly filePath: string;
  private readonly logger: Logger;

  constructor(config: DefaultGlobalConfigAccessorConfig) {
    this.json = config.json;
    this.filePath = config.filePath;
    this.logger = config.logger.child({ configFilePath: this.filePath });
    this.logger.info(`creating global config accessor`);
  }

  public async get(): Promise<GlobalConfig> {
    const logger = this.logger.child({ method: "get" });
    logger.debug("reading global config");

    if (this.cachedConfig) return this.cachedConfig;
    logger.debug("no config cached, reading from source");

    const configFileData = await this.readConfigFile();

    // capture first-run state before we populate an installationId below, so a
    // later isFirstRun() call isn't fooled by the id we're about to persist.
    this.firstRun ??= !configFileData.installationId;

    // if no installationId is present, generate one and merge it into the file data
    if (!configFileData.installationId) {
      configFileData.installationId = DEFAULT_GLOBAL_CONFIG.installationId;
      this.logger.info(`no installationId found, persisting one`);

      try {
        await this.writeToConfigFile(configFileData);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        this.logger
          .child({ errorName: error.name, errorMessage: error.message })
          .warn(`failed to write initial config file data`);
        // best effort
      }
    }

    this.cachedConfig = applyOverrides(DEFAULT_GLOBAL_CONFIG, configFileData);
    return this.cachedConfig;
  }

  public async isFirstRun(): Promise<boolean> {
    if (this.firstRun !== undefined) return this.firstRun;

    // A first run is one where no installationId has been persisted yet. A
    // missing (readConfigFile returns {}) or malformed config counts as a first
    // run; a config that exists but is otherwise unreadable does not, so an
    // install that already has an installationId isn't repeatedly nagged.
    try {
      const configFileData = await this.readConfigFile();
      this.firstRun = !configFileData.installationId;
    } catch (e) {
      this.firstRun = e instanceof DeserializationError;
    }

    return this.firstRun;
  }

  public async set(newConfig: GlobalConfig): Promise<GlobalConfig> {
    this.logger.child({ newConfig, method: "set" }).debug("writing global config");

    const configDiff = diff(newConfig, DEFAULT_GLOBAL_CONFIG);
    await this.writeToConfigFile(configDiff);
    this.cachedConfig = newConfig;
    return this.cachedConfig;
  }

  private async writeToConfigFile(data: GlobalConfigFileData): Promise<GlobalConfigFileData> {
    const dataParseResult = globalConfigFileSchema.safeParse(data);
    if (!dataParseResult.success) {
      throw new InputValidationError(z.prettifyError(dataParseResult.error), {
        cause: dataParseResult.error,
      });
    }

    await this.json.write(this.filePath, dataParseResult.data);
    return data;
  }

  private async readConfigFile(): Promise<GlobalConfigFileData> {
    try {
      return await this.json.read(this.filePath, globalConfigFileSchema);
    } catch (e) {
      if (isFileNotFoundError(e)) return {};

      const error = e instanceof Error ? e : new Error(String(e));
      this.logger
        .child({ errorName: error.name, errorMessage: error.message })
        .warn(`failed to read global config file`);
      throw e;
    }
  }
}

function isFileNotFoundError(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}

/** Recursively diffs two objects, comparing leaf values by reference equality. Returns only the fields in a that differ from b */
function diff<T extends Record<string, unknown>>(a: T, b: T): DeepPartial<T> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(a)) {
    const aVal = a[key];
    const bVal = b[key];

    if (isRecord(aVal) && isRecord(bVal)) {
      const nested = diff(aVal, bVal);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else if (aVal !== bVal) {
      result[key] = aVal;
    }
  }

  return result as DeepPartial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
