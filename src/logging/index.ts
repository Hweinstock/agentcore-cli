export interface LoggingConfig {
  level?: string;
  filePath?: string;
  prefix?: string;
}

const _LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

type LogLevel = (typeof _LOG_LEVEL)[keyof typeof _LOG_LEVEL];

type Log = (messasge: string, attributes?: Record<string, string>) => void;

export interface Logger extends Record<LogLevel, Log> {
  child: (prefix: string) => Logger;
}

export interface FileLogger extends Logger {
  getFilePath: () => string;
}

export const getNullLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: (_val: string) => getNullLogger(),
});

// TODO: implement this as an actual file logger on top of some logging library.
export const getFileLogger = (_config: LoggingConfig): FileLogger => ({
  ...getNullLogger(),
  getFilePath: () => 'none',
});
