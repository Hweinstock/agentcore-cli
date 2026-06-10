import type { GlobalConfigAccessor } from '../../global-config';
import { useBack } from './hooks/use-back';
import { Add, AddGateway, AddMemory, Home, Remove, RemoveGateway, RemoveMemory } from './screens';
import { Create } from './screens';
import type { RouteEntry } from './types';
import { Text } from 'ink';

function Hidden() {
  useBack();
  return <Text>This is a hidden page (press Esc to go back)</Text>;
}

export function getRoutes(_context: { globalConfigAccessor: GlobalConfigAccessor }): readonly RouteEntry[] {
  const addRoutes: RouteEntry[] = [
    {
      path: '/add/memory',
      label: 'Memory',
      render: () => <AddMemory />,
    },
    {
      path: '/add/gateway',
      label: 'Gateway',
      render: () => <AddGateway />,
    },
  ];

  const removeRoutes: RouteEntry[] = [
    {
      path: '/remove/memory',
      label: 'Memory',
      render: () => <RemoveMemory />,
    },
    {
      path: '/remove/gateway',
      label: 'Gateway',
      render: () => <RemoveGateway />,
    },
  ];

  const topLevelRoutes: RouteEntry[] = [
    {
      path: '/add',
      label: 'add',
      render: () => <Add childrenRoutes={addRoutes} />,
    },
    {
      path: '/remove',
      label: 'remove',
      render: () => <Remove childrenRoutes={removeRoutes} />,
    },
    {
      path: '/create',
      label: 'create',
      render: () => <Create />,
    },
  ];

  return [
    {
      path: '/',
      label: 'home',
      render: () => <Home childrenRoutes={topLevelRoutes} />,
    },
    ...topLevelRoutes,
    ...addRoutes,
    ...removeRoutes,
  ];
}
