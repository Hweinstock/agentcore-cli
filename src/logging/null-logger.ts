import type { Logger } from './types';

export const getNullLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => getNullLogger(),
});
