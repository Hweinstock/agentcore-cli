import type { EnvironmentAccessor } from '../env';
import type { GlobalConfigAccessor } from '../global-config';
import type { Logger } from '../logging';
import type { ProjectManager } from '../project';
import type { TelemetryClient } from '../telemetry';
import type { ReactElement } from 'react';

export interface TuiScreenRendererContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  environmentAccessor: EnvironmentAccessor;
  projectManager: ProjectManager;
}

export interface RouteEntry {
  label: string;
  path: string;
  render: () => ReactElement;
}
