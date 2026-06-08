import type { GlobalConfigAccessor, Logger, TelemetryClient } from '../../common';
import type { ProjectManager } from '../../project';
import type { ReactElement } from 'react';

export interface TuiScreenRendererContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  projectManager: ProjectManager;
}

export interface RouteEntry {
  label: string;
  path: string;
  render: () => ReactElement;
}
