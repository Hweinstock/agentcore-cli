import type { Logger, LoggingConfig } from './types';

export const getConsoleLogger = (config: LoggingConfig): Logger => ({
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  child: () => getConsoleLogger(config),
});
