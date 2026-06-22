import type { GlobalConstants } from './common';
import type { EnvironmentAccessor } from './env';
import type { GlobalConfigAccessor } from './global-config';
import type { Logger } from './logging';
import type { ProjectManager } from './project';
import type { TelemetryClient } from './telemetry';
import type { TuiScreenRenderer } from './tui';

export interface ProgramContext {
  globalConstants: GlobalConstants;
  consoleLogger: Logger;
  fileLogger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  tuiScreenRenderer: TuiScreenRenderer;
  environmentAccessor: EnvironmentAccessor;
  projectManager: ProjectManager;
}
