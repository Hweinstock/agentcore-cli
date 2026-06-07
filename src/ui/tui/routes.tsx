import type { GlobalConfigAccessor } from '../../common';
import { useBack } from './hooks/use-back';
import { Add, AddMemory, Home, Remove, RemoveMemory } from './screens';
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
  ];

  const removeRoutes: RouteEntry[] = [
    {
      path: '/remove/memory',
      label: 'Memory',
      render: () => <RemoveMemory />,
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
