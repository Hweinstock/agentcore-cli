import path from 'node:path';

// global constants are injected in case tests need to overwrite them.
// Haven't seen a case where this is useful yet, but may be.
export interface GlobalConstants {
  assetsPath: string;
  invokeId: string;
  defaultLogPath: string;
}

export function getGlobalConstants(): GlobalConstants {
  return {
    assetsPath: path.join(__dirname, 'assets'),
    invokeId: crypto.randomUUID(),
    defaultLogPath: `~/.agentcore/logs.txt`,
  };
}
