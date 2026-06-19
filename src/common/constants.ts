import path from 'node:path';

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
