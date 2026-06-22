import { err, getGlobalConstants, getJsonDatastore, inMemorySource, ok } from '../common';
import { getEnvironmentAccessor } from '../env/accessor';
import { globalConfigSchema } from '../global-config';
import { getNullLogger } from '../logging';
import type { ProgramContext } from '../program-context';
import type { ProjectManager } from '../project';
import type { Project } from '../project/types';
import { getNullTelemetryClient } from '../telemetry/client';
import { getInMemoryProject } from './in-memory-project';

export function getTestProgramContext(overrides?: Partial<ProgramContext>): ProgramContext {
  const logger = getNullLogger();
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

  let project: Project | undefined;
  const projectManager: ProjectManager = {
    create: async () => {
      project = getInMemoryProject();
      return ok(project);
    },
    find: () => (project ? Promise.resolve(ok(project)) : Promise.resolve(err(new Error('no project')))),
  };

  return {
    globalConstants: getGlobalConstants(),
    fileLogger: logger,
    consoleLogger: logger,
    telemetryClient: getNullTelemetryClient({ logger }),
    globalConfigAccessor,
    environmentAccessor,
    tuiScreenRenderer: { render: () => Promise.resolve(ok()) },
    projectManager,
    ...overrides,
  };
}
