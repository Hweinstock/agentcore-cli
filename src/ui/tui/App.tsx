import { TuiScreenContextProvider } from './context-provider.tsx';
import { getRoutes } from './routes';
import type { TuiScreenRendererContext } from './types.ts';
import { MemoryRouter, Route, Routes } from 'react-router';

export interface AppProps {
  /** The path the in-memory router starts on. Defaults to the home screen. */
  initialPath?: string;
  context: TuiScreenRendererContext;
}

export function App({ initialPath = '/', context }: AppProps) {
  const routes = getRoutes({ globalConfigAccessor: context.globalConfigAccessor });
  return (
    <TuiScreenContextProvider context={context}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          {routes.map(r => (
            <Route key={r.path} path={r.path} element={r.render()} />
          ))}
        </Routes>
      </MemoryRouter>
    </TuiScreenContextProvider>
  );
}
