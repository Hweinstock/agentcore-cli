import { type Result, wrapInResult } from '../common';
import { ANSI } from './ansi-constants';
import type { TuiScreenRendererContext } from './types';

export interface RenderTUIOptions {
  /** Path to render on launch (e.g. `/add` or `/add/memory`). If omitted, shows the default home screen. */
  initialPath?: string;
  /** Control whether TUI is rendered inline or in alternate screen. Default: true */
  enterAltScreen?: boolean;
  /** Whether the TUI is running in full interactive mode. When false, screens auto-exit after success. Default: true */
  isInteractive?: boolean;
}

export interface TuiScreenRenderer {
  render: (options?: RenderTUIOptions) => Promise<Result>;
}

export function getTuiScreenRenderer(context: TuiScreenRendererContext): TuiScreenRenderer {
  return {
    render: async (options = {}) => {
      /*
       * We load all react-based dependencies dynamically on render to keep CLI path fast, and avoiding pulling them
       * in statically.
       */
      const React = await import('react');
      const { App } = await import('./app');
      const { render } = await import('ink');

      if (options.enterAltScreen !== false) enterAltScreen();

      const instance = render(
        React.createElement(App, {
          initialPath: options.initialPath ?? '/',
          context,
        })
      );
      return wrapInResult(async () => {
        await instance.waitUntilExit();
      })();
    },
  };
}

function enterAltScreen() {
  process.stdout.write(`${ANSI.ENTER_ALT_SCREEN}${ANSI.HIDE_CURSOR}`);

  const exitAltScreen = () => process.stdout.write(`${ANSI.EXIT_ALT_SCREEN}${ANSI.SHOW_CURSOR}`);
  process.on('exit', exitAltScreen);
  process.on('SITINT', exitAltScreen);
  process.on('SIGTERM', exitAltScreen);
}
