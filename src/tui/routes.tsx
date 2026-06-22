import type { GlobalConfigAccessor } from '../global-config';
import {
  AddGatewayScreen,
  AddMemoryScreen,
  AddScreen,
  CreateScreen,
  HomeScreen,
  RemoveGatewayScreen,
  RemoveMemoryScreen,
  RemoveScreen,
} from './screens';
import type { RouteEntry } from './types';

export function getRoutes(_context: { globalConfigAccessor: GlobalConfigAccessor }): readonly RouteEntry[] {
  const addRoutes: RouteEntry[] = [
    {
      path: '/add/memory',
      label: 'Memory',
      render: () => <AddMemoryScreen />,
    },
    {
      path: '/add/gateway',
      label: 'Gateway',
      render: () => <AddGatewayScreen />,
    },
  ];

  const removeRoutes: RouteEntry[] = [
    {
      path: '/remove/memory',
      label: 'Memory',
      render: () => <RemoveMemoryScreen />,
    },
    {
      path: '/remove/gateway',
      label: 'Gateway',
      render: () => <RemoveGatewayScreen />,
    },
  ];

  const topLevelRoutes: RouteEntry[] = [
    {
      path: '/add',
      label: 'add',
      render: () => <AddScreen childrenRoutes={addRoutes} />,
    },
    {
      path: '/remove',
      label: 'remove',
      render: () => <RemoveScreen childrenRoutes={removeRoutes} />,
    },
    {
      path: '/create',
      label: 'create',
      render: () => <CreateScreen />,
    },
  ];

  return [
    {
      path: '/',
      label: 'home',
      render: () => <HomeScreen childrenRoutes={topLevelRoutes} />,
    },
    ...topLevelRoutes,
    ...addRoutes,
    ...removeRoutes,
  ];
}
