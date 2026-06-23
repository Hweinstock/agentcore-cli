import { type Result, collect, ok } from '../common';
import { getDefaultProjectConfig } from './config-accessor';
import { getProject } from './project';
import type { Project, ProjectManagerContext } from './types';
import path from 'node:path';

interface ScaffoldProjectOptions {
  outputDir: string;
  projectName: string;
  targets: { account: string; region: string }[];
  noInstall?: boolean;
}

export async function scaffoldProject(
  context: ProjectManagerContext,
  options: ScaffoldProjectOptions
): Promise<Result<Project>> {
  context.logger.info(`scaffolding project with options=${JSON.stringify(options)}`);

  const agentcoreDir = path.join(options.outputDir, 'agentcore');
  const appDir = path.join(options.outputDir, 'app');
  const cliDir = path.join(agentcoreDir, '.cli');

  const dirs = [agentcoreDir, appDir, cliDir];

  const files: { path: string; content: string }[] = [
    {
      path: path.join(agentcoreDir, 'agentcore.json'),
      content: JSON.stringify(getDefaultProjectConfig(), null, 2),
    },
    {
      path: path.join(agentcoreDir, 'aws-targets.json'),
      content: JSON.stringify({ targets: options.targets }, null, 2),
    },
    {
      path: path.join(agentcoreDir, '.env.local'),
      content: '',
    },
    {
      path: path.join(options.outputDir, '.gitignore'),
      content: 'node_modules/\n.env.local\nagentcore/.cli/\n',
    },
    {
      path: path.join(options.outputDir, 'README.md'),
      content: `# ${options.projectName}\n`,
    },
  ];

  const directoryCreationResult = collect(
    await Promise.all(dirs.map(d => context.env.fs.mkdir(d, { recursive: true })))
  );
  if (!directoryCreationResult.success) return directoryCreationResult;

  const fileCreationResult = collect(
    await Promise.all(files.map(f => context.env.fs.writeFile(f.path, f.content, 'utf8')))
  );
  if (!fileCreationResult.success) return fileCreationResult;

  const cdkResult = await context.env.fs.cp(
    path.join(context.constants.assetsPath, 'cdk'),
    path.join(agentcoreDir, 'cdk'),
    { recursive: true }
  );
  if (!cdkResult.success) return cdkResult;

  const cdkPath = path.join(agentcoreDir, 'cdk');
  const renames = [
    { from: path.join(cdkPath, 'gitignore.template'), to: path.join(cdkPath, '.gitignore') },
    { from: path.join(cdkPath, 'npmignore.template'), to: path.join(cdkPath, '.npmignore') },
  ];

  const renameResult = collect(await Promise.all(renames.map(r => context.env.fs.rename(r.from, r.to))));
  if (!renameResult.success) return renameResult;

  if (!options.noInstall) {
    const npmInstallStart = Date.now();
    const npmInstallResult = await context.env.process.exec('npm', ['install'], { cwd: cdkPath });
    context.logger.info(`npm install completed in ${Date.now() - npmInstallStart}ms`);

    if (!npmInstallResult.success) return npmInstallResult;
  }

  return ok(getProject(context, { path: options.outputDir, projectName: options.projectName }));
}
