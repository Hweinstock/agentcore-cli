import { type Result, type ResultWrapped, err, ok, wrapInResult } from '../common';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';

interface EnvironmentAccessorContext {
  logger: Logger;
  globalConfigAccessor: GlobalConfigAccessor;
}

interface AWSEnvironmentAccessor {
  getAccount: () => Promise<Result<{ account: string }>>;
  getRegion: () => Promise<Result<{ region?: string }>>;
}

interface FilesystemAccessor {
  dirExists: (path: string) => Promise<boolean>;
  mkdir: ResultWrapped<typeof fs.mkdir>;
  writeFile: ResultWrapped<typeof fs.writeFile>;
  readFile: (path: string, encoding: BufferEncoding) => Promise<Result<string>>;
  readdir: (path: string, options: { withFileTypes: true }) => Promise<Result<import('node:fs').Dirent[]>>;
  cp: ResultWrapped<typeof fs.cp>;
  rm: ResultWrapped<typeof fs.rm>;
  rename: ResultWrapped<typeof fs.rename>;
}

export interface ChildProcessHandle {
  kill: () => void;
  onExit: () => Promise<Result>;
}

interface ProcessManager {
  cwd: () => string;
  exec: (
    command: string,
    args: string[],
    options?: { cwd?: string }
  ) => Promise<Result<{ stdout: string; stderr: string }>>;
  spawn: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string> }
  ) => ChildProcessHandle;
}

export interface EnvironmentAccessor {
  aws: AWSEnvironmentAccessor;
  fs: FilesystemAccessor;
  process: ProcessManager;

  readEnvVar: (key: string, fallback?: string) => Result<{ value: string }>;

  validateNodeVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
  validateUvVersion: () => Promise<Result<{ satisfied: boolean; version: string }>>;
}

const getProcessManager = (_context: EnvironmentAccessorContext): ProcessManager => ({
  cwd: () => process.cwd(),
  spawn: (command, args, options) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      stdio: 'inherit',
    });

    return {
      kill: () => child.kill(),
      onExit: () =>
        new Promise(resolve => {
          child.on('close', code => {
            if (code !== 0 && code !== null) {
              resolve(err(new Error(`${command} exited with code ${code}`)));
            } else {
              resolve(ok());
            }
          });
          child.on('error', e => resolve(err(e)));
        }),
    };
  },
  exec: (command, args, options) => {
    return new Promise(resolve => {
      const child = spawn(command, args, { cwd: options?.cwd, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', code => {
        if (code !== 0) {
          resolve(
            err(new Error(`${command} ${args.join(' ')} exited with code=${code} stdout=${stdout} stderr=${stderr}`))
          );
        } else {
          resolve(ok({ stdout, stderr }));
        }
      });

      child.on('error', e => {
        resolve(err(e));
      });
    });
  },
});

const getAWSEnvironmentAccessor = (_context: EnvironmentAccessorContext): AWSEnvironmentAccessor => ({
  getAccount: async () => ok({ account: '1111111111' }),
  getRegion: async () => ok({ region: 'us-east-1' }),
});

const getFilesystemAccessor = (_context: EnvironmentAccessorContext): FilesystemAccessor => ({
  dirExists: async (path: string) => {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: wrapInResult(fs.mkdir),
  writeFile: wrapInResult(fs.writeFile),
  readFile: async (filePath, encoding) => {
    try {
      const data = await fs.readFile(filePath, encoding);
      return ok(data);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
  readdir: async (dirPath, options) => {
    try {
      const entries = await fs.readdir(dirPath, options);
      return ok(entries);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  },
  cp: wrapInResult(fs.cp),
  rename: wrapInResult(fs.rename),
  rm: wrapInResult(fs.rm),
});

export const getEnvironmentAccessor = (context: EnvironmentAccessorContext): EnvironmentAccessor => {
  return {
    aws: getAWSEnvironmentAccessor(context),
    fs: getFilesystemAccessor(context),
    readEnvVar: (key, fallback) => {
      const value = process.env[key];

      if (value !== undefined) {
        return ok({ value });
      }

      if (fallback !== undefined) {
        context.logger.warn(`Failed to find value for ${key}, using fallback=${fallback}`);
        return ok({ value: fallback });
      }

      return err(new Error(`Missing env key ${key}`));
    },
    process: getProcessManager(context),
    validateNodeVersion: async () => ok({ satisfied: true, version: '20' }),
    validateUvVersion: async () => ok({ satisfied: true, version: '2' }),
  };
};
