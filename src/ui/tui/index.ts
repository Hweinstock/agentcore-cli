import { type GlobalConfigAccessor, type Logger, type Result, type TelemetryClient, ok } from '../../common';
import type { ProjectBuilder } from '../../project';
import { App } from './App';
import { render } from 'ink';
import React from 'react';

interface ScreenContext {
  logger: Logger;
  telemetryClient: TelemetryClient;
  globalConfigAccessor: GlobalConfigAccessor;
  projectBuilder: ProjectBuilder;
}

export interface RenderTUIOptions {
  /** Path to render on launch (e.g. `/add` or `/add/memory`). If omitted, shows the default home screen. */
  initialPath?: string;
  /** Control whether TUI is rendered inline or in alternate screen. Default: true */
  enterAltScreen?: boolean;
  /** Behavior when pressing escape/back. 'help' navigates to the help screen, 'exit' exits the app. Default: 'help' */
  actionOnBack?: 'help' | 'exit';
  /** Whether the TUI is running in full interactive mode. When false, screens auto-exit after success. Default: true */
  isInteractive?: boolean;
}

export interface TuiScreenRenderer {
  render: (options?: RenderTUIOptions) => Promise<Result>;
}

export function getTuiScreenRenderer(context: ScreenContext): TuiScreenRenderer {
  return {
    render: async (options = {}) => {
      const t = render(
        React.createElement(App, {
          initialPath: options.initialPath ?? '/',
          globalConfigAccessor: context.globalConfigAccessor,
        })
      );
      await t.waitUntilExit();
      return ok();
    },
  };
}
