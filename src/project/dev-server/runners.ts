import { ok } from '../../common';
import type { ProjectManagerContext } from '../types';
import type { DevServerRunner } from './types';

export function pythonRunner(context: ProjectManagerContext): DevServerRunner {
  return {
    setup: async options => {
      const { process, fs } = context.env;
      const venvExists = await fs.dirExists(`${options.agentDir}/.venv`);
      if (!venvExists) {
        const venvResult = await process.exec('uv', ['venv'], { cwd: options.agentDir });
        if (!venvResult.success) return venvResult;
      }
      const syncResult = await process.exec('uv', ['sync'], { cwd: options.agentDir });
      if (!syncResult.success) return syncResult;
      return ok();
    },
    start: options => {
      return context.env.process.spawn(
        'uv',
        ['run', 'uvicorn', 'main:app', '--reload', '--port', String(options.port)],
        { cwd: options.agentDir, env: options.env }
      );
    },
  };
}

export function typescriptRunner(context: ProjectManagerContext): DevServerRunner {
  return {
    setup: async options => {
      const { process, fs } = context.env;
      const nodeModulesExists = await fs.dirExists(`${options.agentDir}/node_modules`);
      if (!nodeModulesExists) {
        const installResult = await process.exec('npm', ['install'], { cwd: options.agentDir });
        if (!installResult.success) return installResult;
      }
      return ok();
    },
    start: options => {
      return context.env.process.spawn('npx', ['tsx', 'watch', 'main.ts'], { cwd: options.agentDir, env: options.env });
    },
  };
}
