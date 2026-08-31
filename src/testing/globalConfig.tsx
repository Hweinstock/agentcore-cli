import {
  DEFAULT_GLOBAL_CONFIG,
  type GlobalConfig,
  type GlobalConfigAccessor,
} from "../globalConfig";

type TestGlobalConfigAccessorOptions = {
  initialConfigData?: GlobalConfig;
};

/**
 * In-memory GlobalConfigAccessor for tests. Represents an already-installed
 * environment, so isFirstRun is always false.
 */
export class TestGlobalConfigAccessor implements GlobalConfigAccessor {
  private configData: GlobalConfig;

  constructor(options?: TestGlobalConfigAccessorOptions) {
    this.configData = options?.initialConfigData ?? DEFAULT_GLOBAL_CONFIG;
  }

  public async get(): Promise<GlobalConfig> {
    return this.configData;
  }

  public async set(newConfig: GlobalConfig): Promise<GlobalConfig> {
    this.configData = newConfig;
    return this.configData;
  }

  public async isFirstRun(): Promise<boolean> {
    return false;
  }
}
