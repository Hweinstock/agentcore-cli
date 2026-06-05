export interface LoggingConfig {
  level?: string;
  filePath?: string;
}

const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

type Log = (messasge: string, attributes?: Record<string, string>) => void;

export interface Logger extends Record<LogLevel, Log> {
  getFilePath: () => string;
}

export const getLogger = (_config?: LoggingConfig): Logger => ({
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  getFilePath: () => 'none',
});
