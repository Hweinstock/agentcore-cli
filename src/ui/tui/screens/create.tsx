import { ListSelector } from '../components';
import { goBack, useBack } from '../hooks/use-back';
import { Box, Text, useApp } from 'ink';
import { type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';

export function Create(): ReactElement {
  const navigate = useNavigate();
  useBack();

  const location = useLocation();
  const { exit } = useApp();

  const items = [
    {
      label: 'Add a memory',
      path: '/add/memory',
    },
    {
      label: 'Go back',
    },
  ];
  return (
    <Box>
      <Text>You have added an agent! </Text>
      <ListSelector
        id="create"
        items={items}
        onSelect={item => (item.path ? void navigate(item.path) : void goBack(location, navigate, exit))}
      />
    </Box>
  );
}
