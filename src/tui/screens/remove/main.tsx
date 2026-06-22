import { buildScreen } from '../../base-screen';
import { ListSelector } from '../../components/list-selector';
import { useBack } from '../../hooks/use-back';
import type { RouteEntry } from '../../types';
import { type ReactElement } from 'react';
import { useNavigate } from 'react-router';

function Remove({ childrenRoutes }: { childrenRoutes: readonly RouteEntry[] }): ReactElement {
  const navigate = useNavigate();
  useBack();

  const items = childrenRoutes.map(r => ({ label: r.label, action: () => void navigate(r.path) }));
  return <ListSelector id="remove" items={items} />;
}

export const RemoveScreen = buildScreen(Remove);
