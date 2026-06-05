import type { Logger, LoggingConfig } from '../common';

// TODO: this should handle escape codes, and common rendering patterns for printing text to the console.
export const getConsoleLogger = (config: LoggingConfig): Logger => ({
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  child: (prefix: string) => getConsoleLogger({ ...config, prefix: `[${prefix}]` }),
});
