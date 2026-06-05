import { ListSelector } from '../components/list-selector';
import { useBack } from '../hooks/use-back';
import { type ReactElement } from 'react';
import { useNavigate } from 'react-router';

export interface HomeRoute {
  name: string;
  path: string;
}

export function Home({ routes }: { routes: readonly HomeRoute[] }): ReactElement {
  const navigate = useNavigate();
  useBack();

  const items = routes.map(route => ({ label: route.name, path: route.path }));

  return <ListSelector id="home" items={items} onSelect={item => void navigate(item.path)} />;
}
