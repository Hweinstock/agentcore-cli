import { type Result, ValidationError, err, ok } from '../common';
import { getProjectConfigAccessor } from './config-accessor';
import { resolveRunner } from './dev-server';
import type { AddAgentOptions, Project, ProjectManagerContext } from './types';
import path from 'node:path';

interface GetProjectOptions {
  projectName: string;
  path: string;
}

async function resolveAssetsPath(
  context: ProjectManagerContext,
  options: Pick<AddAgentOptions, 'language' | 'protocol' | 'framework'>
): Promise<Result<{ path: string }>> {
  const targetPath = path.join(context.constants.assetsPath, options.language, options.protocol, options.framework);
  const isSupported = await context.env.fs.dirExists(targetPath);

  if (!isSupported)
    return err(
      new ValidationError(
        `an agent with language '${options.language}', protocol '${options.protocol}'', and framework '${options.framework}' is not supported`
      )
    );

  return ok({ path: targetPath });
}

export function getProject(context: ProjectManagerContext, options: GetProjectOptions): Project {
  const { projectName, path: projectPath } = options;

  const config = getProjectConfigAccessor(context, projectPath);
  return {
    deploy: async () => {
      context.logger.info(`deploying project`);
      return ok();
    },
    addAgent: async (options: AddAgentOptions) => {
      context.logger.info(`adding agent with options=${JSON.stringify(options)}`);
      const resolveTemplateResult = await resolveAssetsPath(context, {
        language: options.language,
        protocol: options.protocol,
        framework: options.framework,
      });
      if (!resolveTemplateResult.success) return resolveTemplateResult;
      const templatePath = resolveTemplateResult.data.path;

      const agentDir = path.join(projectPath, 'app', options.agentName);
      const renderResult = await context.agentTemplateRenderer.renderDir(
        path.join(templatePath, 'base'),
        {
          name: options.agentName,
          agentName: options.agentName,
          language: options.language,
          framework: options.framework,
          projectName,
          protocol: options.protocol,
          modelProvider: 'Bedrock',
          hasMemory: options.memory !== 'none',
          hasGateway: false,
          hasConfigBundle: false,
        },
        agentDir
      );

      if (!renderResult.success) {
        await context.env.fs.rm(agentDir, { recursive: true, force: true });
        return renderResult;
      }

      const configUpdateResult = await config.add('agents', options.agentName);

      if (!configUpdateResult.success) return configUpdateResult;

      return ok();
    },
    startDevServer: async input => {
      context.logger.info(`starting dev server for agent=${input.agentName} on port=${String(input.port)}`);

      try {
        // TODO: resolve agent language from config
        const language = 'python';
        const agentDir = path.join(projectPath, 'app', input.agentName);
        context.logger.debug(`agentDir=${agentDir}`);

        const runner = resolveRunner(context, language);
        const devOptions = { agentDir, port: input.port, env: {} };

        context.logger.debug(`running install`);
        const installResult = await runner.setup(devOptions);
        if (!installResult.success) {
          context.logger.debug(`install failed: ${installResult.error.message}`);
          return installResult;
        }

        context.logger.debug(`starting server`);
        const handle = runner.start(devOptions);

        process.on('SIGINT', () => handle.kill());
        process.on('SIGTERM', () => handle.kill());

        return handle.onExit();
      } catch (e) {
        const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
        context.logger.error(`startDevServer threw: ${msg}`);
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    },
    invokeDevServer: async input => {
      context.logger.info(`invoking dev server on port=${String(input.port)} stream=${String(input.stream)}`);

      const httpClient = context.clientRegistry.getHttpClient();
      const url = `http://localhost:${String(input.port)}/invocations`;

      const streamResult = await httpClient.postStream({
        url,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-amzn-bedrock-agentcore-runtime-session-id': 'local-dev-session',
        },
        body: JSON.stringify({ prompt: input.prompt }),
      });
      if (!streamResult.success) return streamResult;

      let response = '';
      let buffer = '';
      for await (const chunk of streamResult.data) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          try {
            const parsed: unknown = JSON.parse(raw);
            const text =
              typeof parsed === 'string'
                ? parsed
                : parsed && typeof parsed === 'object' && 'text' in parsed
                  ? String((parsed as { text: unknown }).text)
                  : null;
            if (text) {
              if (input.stream) process.stdout.write(text);
              response += text;
            }
          } catch {
            if (input.stream) process.stdout.write(raw);
            response += raw;
          }
        }
      }
      if (input.stream) process.stdout.write('\n');

      return ok({ response });
    },
    config,
  };
}
