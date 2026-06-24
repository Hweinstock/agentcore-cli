import { getClientRegistry, getGlobalConstants, getJsonDatastore, inMemorySource, ok } from '../common';
import { getEnvironmentAccessor } from '../env';
import { globalConfigSchema } from '../global-config';
import { getNullLogger } from '../logging';
import type { ProgramContext } from '../program-context';
import { getAgentTemplateRenderer, getProjectManager } from '../project';
import { getNullTelemetryClient } from '../telemetry';

export function getTestProgramContext(overrides?: Partial<ProgramContext>): ProgramContext {
  const logger = getNullLogger();
  const telemetryClient = getNullTelemetryClient({ logger });
  const globalConfigAccessor = getJsonDatastore({}, { schema: globalConfigSchema, source: inMemorySource({}) });

  const environmentAccessor = getEnvironmentAccessor(
    { logger, globalConfigAccessor },
    {
      aws: {
        getAccount: () => Promise.resolve(ok({ account: '000000000000' })),
        getRegion: () => Promise.resolve(ok({ region: 'us-east-1' })),
      },
    }
  );

  return {
    globalConstants: getGlobalConstants(),
    fileLogger: logger,
    consoleLogger: logger,
    telemetryClient: getNullTelemetryClient({ logger }),
    globalConfigAccessor,
    environmentAccessor,
    tuiScreenRenderer: { render: () => Promise.resolve(ok()) },
    projectManager: getProjectManager({
      logger,
      telemetryClient,
      globalConfigAccessor,
      env: environmentAccessor,
      constants: getGlobalConstants(),
      clientRegistry: getClientRegistry({ logger }),
      agentTemplateRenderer: getAgentTemplateRenderer({ logger, fs: environmentAccessor.fs }),
    }),
    ...overrides,
  };
}
