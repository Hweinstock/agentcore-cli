import type { GlobalConfigAccessor } from '../../common';
import { getRoutes } from './routes';
import { MemoryRouter, Route, Routes } from 'react-router';

export interface AppProps {
  /** The path the in-memory router starts on. Defaults to the home screen. */
  initialPath?: string;
  globalConfigAccessor: GlobalConfigAccessor;
}

export function App({ initialPath = '/', globalConfigAccessor }: AppProps) {
  const routes = getRoutes({ globalConfigAccessor });
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        {routes.map(r => (
          <Route key={r.path} path={r.path} element={r.render()} />
        ))}
      </Routes>
    </MemoryRouter>
  );
}
