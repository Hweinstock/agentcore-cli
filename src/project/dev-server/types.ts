import type { Result } from '../../common';
import type { ChildProcessHandle } from '../../env';

export interface DevServerOptions {
  agentDir: string;
  port: number;
  env: Record<string, string>;
}

/**
 * depending on the language, framework, etc. the running logic may be different. For each different setup, we can implement the following interface.
 */
export interface DevServerRunner {
  setup: (options: DevServerOptions) => Promise<Result>;
  start: (options: DevServerOptions) => ChildProcessHandle;
}
