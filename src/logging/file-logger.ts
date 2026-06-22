import type { Logger, LoggingConfig } from './types';
import pino from 'pino';

const wrapPino = (instance: pino.Logger): Logger => ({
  debug: (msg, attrs) => instance.debug(attrs ?? {}, msg),
  info: (msg, attrs) => instance.info(attrs ?? {}, msg),
  warn: (msg, attrs) => instance.warn(attrs ?? {}, msg),
  error: (msg, attrs) => instance.error(attrs ?? {}, msg),
  child: bindings => wrapPino(instance.child(bindings)),
});

export const getFileLogger = (config: LoggingConfig): Logger => {
  const dest = config.filePath ? pino.destination({ dest: config.filePath, mkdir: true }) : undefined;

  const instance = pino({ level: config.level ?? 'info', ...(config.prefix ? { name: config.prefix } : {}) }, dest);

  return wrapPino(instance);
};
