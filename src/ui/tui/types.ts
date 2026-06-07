import type { GlobalConfigAccessor, Logger, TelemetryClient } from '../../common';
import type { ProjectBuilder } from '../../project';
import type { ReactElement } from 'react';

export interface TuiScreenContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  projectBuilder: ProjectBuilder;
}

export interface RouteEntry {
  label: string;
  path: string;
  render: () => ReactElement;
}
