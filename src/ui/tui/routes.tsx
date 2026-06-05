import type { GlobalConfigAccessor } from '../../common';
import { useBack } from './hooks/use-back';
import { Home } from './screens';
import { Text } from 'ink';
import type { ReactElement } from 'react';

interface RouteEntry {
  name: string;
  path: string;
  render: () => ReactElement;
  isEnabled?: () => boolean | Promise<boolean>;
}

function Hidden() {
  useBack();
  return <Text>This is a hidden page (press Esc to go back)</Text>;
}

export function getRoutes(_context: { globalConfigAccessor: GlobalConfigAccessor }): readonly RouteEntry[] {
  const topLevelRoutes: RouteEntry[] = [
    {
      path: '/add',
      name: 'add',
      render: () => <Hidden />,
    },
    {
      path: '/remove',
      name: 'remove',
      render: () => <Hidden />,
    },
    {
      path: '/create',
      name: 'create',
      render: () => <Hidden />,
    },
  ];

  return [
    {
      path: '/',
      name: 'home',
      render: () => <Home routes={topLevelRoutes} />,
    },
    ...topLevelRoutes,
  ];
}
