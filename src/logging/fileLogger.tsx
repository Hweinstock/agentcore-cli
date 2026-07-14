import pino from "pino";
import { type AsyncLogger, type LoggerBindings, type LogLevel } from "./types";

export interface FileLoggerConfig {
  filePath: string;
  maxSizeInMB?: number;
  maxFileCount?: number;
  bindings?: LoggerBindings;
  logLevel: LogLevel;
}

function wrapPinoLogger(pinoLogger: pino.Logger): AsyncLogger {
  const log =
    (level: pino.Level) =>
    (...args: string[]) =>
      pinoLogger[level](args.join(" "));
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: (bindings) => wrapPinoLogger(pinoLogger.child(bindings)),
    // we convert pino's flush method that accepts a callback into a promise to make it easier to work with.
    // Note: we also treat flush as best-effort and swallow errors
    flush: () => new Promise<void>((resolve) => pinoLogger.flush(() => resolve())),
  };
}

/**
 * Creates a logger that writes structured JSON to a rotating file.
 *
 * @param config - Logger configuration (file path, rotation limits, level).
 * @returns A {@link AsyncLogger} that writes to a rotating file via pino.
 */
export function createFileLogger(config: FileLoggerConfig): AsyncLogger {
  const maxSizeInMB = config.maxSizeInMB ?? 10;
  const maxFileCount = config.maxFileCount ?? 5;
  const bindings = config.bindings ?? {};
  return wrapPinoLogger(
    pino({
      level: config.logLevel,
      base: undefined, // omit pid and hostname
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      transport: {
        target: "pino-roll",
        options: {
          extension: ".log",
          dateFormat: "yyyy-MM-dd'T'HH-mm-ss",
          // Rotate when file reaches {maxSizeInMB} MB, and start deleting once we have {maxFileCount} files
          size: `${maxSizeInMB}m`,
          limit: { count: maxFileCount },
          file: config.filePath,
          mkdir: true,
        },
      },
    }),
  ).child(bindings);
}
