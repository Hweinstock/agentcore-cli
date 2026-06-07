import { ListSelector } from '../../components/list-selector';
import { useBack } from '../../hooks/use-back';
import type { RouteEntry } from '../../types';
import { type ReactElement } from 'react';
import { useNavigate } from 'react-router';

export function Add({ childrenRoutes }: { childrenRoutes: readonly RouteEntry[] }): ReactElement {
  const navigate = useNavigate();
  useBack();
  return <ListSelector id="add" items={childrenRoutes} onSelect={item => void navigate(item.path)} />;
}
