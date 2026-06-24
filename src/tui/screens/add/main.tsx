import { buildScreen } from '../../base-screen';
import { ListSelector } from '../../components';
import { useBack } from '../../hooks/';
import type { RouteEntry } from '../../types';
import { type ReactElement } from 'react';
import { useNavigate } from 'react-router';

function Add({ childrenRoutes }: { childrenRoutes: readonly RouteEntry[] }): ReactElement {
  const navigate = useNavigate();
  useBack();

  const items = childrenRoutes.map(r => ({ label: r.label, action: () => void navigate(r.path) }));
  return <ListSelector id="add" items={items} />;
}

export const AddScreen = buildScreen(Add);
