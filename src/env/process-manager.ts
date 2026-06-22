import { type Result, err, ok } from '../common';
import type { EnvironmentAccessorContext } from './accessor';
import { spawn } from 'node:child_process';

export interface ChildProcessHandle {
  kill: () => void;
  onExit: () => Promise<Result>;
}

export interface ProcessManager {
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

export const getProcessManager = (_context: EnvironmentAccessorContext): ProcessManager => ({
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
