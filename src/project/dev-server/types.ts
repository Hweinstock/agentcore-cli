import type { Result } from '../../common';
import type { ChildProcessHandle } from '../../env';

export interface DevServerOptions {
  agentDir: string;
  port: number;
  env: Record<string, string>;
}

export interface DevServerRunner {
  install: (options: DevServerOptions) => Promise<Result>;
  start: (options: DevServerOptions) => ChildProcessHandle;
}
