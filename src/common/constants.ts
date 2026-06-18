import path from 'node:path';

export interface GlobalConstants {
  assetsPath: string;
}

export function getGlobalConstants(): GlobalConstants {
  return {
    assetsPath: path.join(__dirname, '..', '..', 'assets'),
  };
}
