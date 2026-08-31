import z from "zod";

/** Recursively marks all fields of a given shape as required */
export type DeepRequired<T> = {
  [P in keyof T]-?: DeepRequired<T[P]>;
};

/** Recursively marks all fields of a given shape as optional */
export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

/**
 * Schema for the global config file. All fields should be optional with defaults defined.
 */
export const globalConfigFileSchema = z.object({
  telemetry: z
    .object({
      enabled: z.boolean().optional(),
      endpoint: z.string().optional(),
      audit: z.boolean().optional(),
    })
    .optional(),
  installationId: z.uuid().optional(),
});

/** The raw shape stored on disk for overriding defaults. */
export type GlobalConfigFileData = z.infer<typeof globalConfigFileSchema>;

/** The fully resolved config after applying defaults — all fields required. */
export type GlobalConfig = DeepRequired<GlobalConfigFileData>;

/** Manages access to a set of configuration values for the CLI  */
export interface GlobalConfigAccessor {
  /** Returns the current global config, with defaults applied. */
  get(): Promise<GlobalConfig>;
  /** Validates and persists a new config. Throws on invalid shape. */
  set(newConfig: GlobalConfig): Promise<GlobalConfig>;
  /**
   * Returns true on the first run of the CLI, i.e. when no installationId has
   * yet been persisted to the config file. Reflects the state before {@link get}
   * populates an installationId, so the result is stable across the process.
   */
  isFirstRun(): Promise<boolean>;
}
