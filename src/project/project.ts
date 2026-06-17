import { ok } from '../common';
import { getProjectConfigAccessor } from './config-accessor';
import type { Project, ProjectManagerContext } from './types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface GetProjectOptions {}

export function getProject(context: ProjectManagerContext, _options: GetProjectOptions): Project {
  return {
    deploy: async () => {
      context.logger.info(`deploying project`);
      return ok(getProject(context, {}));
    },
    addAgent: async () => {
      context.logger.info(`adding agent`);
      return ok(getProject(context, {}));
    },
    config: getProjectConfigAccessor(context),
  };
}
