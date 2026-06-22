import { buildScreen } from '../base-screen';
import { ListSelector } from '../components';
import { useBack } from '../hooks';
import { Box, Text, useApp } from 'ink';
import { type ReactElement } from 'react';
import { useNavigate } from 'react-router';

function Create(): ReactElement {
  const navigate = useNavigate();

  const { exit } = useApp();
  useBack();

  const items = [
    {
      label: 'Add a memory',
      action: () => navigate('/add/memory'),
    },
    {
      label: 'Exit',
      action: () => exit(),
    },
  ];
  return (
    <Box flexDirection="column" gap={1}>
      <Text>You have added an agent!</Text>
      <Box>
        <ListSelector id="create" items={items} />
      </Box>
    </Box>
  );
}

export const CreateScreen = buildScreen(Create);
