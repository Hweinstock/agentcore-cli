import { buildScreen } from '../../base-screen';
import { useBack } from '../../hooks';
import { Box, Text } from 'ink';
import { type ReactElement } from 'react';

function RemoveMemory(): ReactElement {
  useBack();
  return (
    <Box>
      <Text>This is the remove memory screen (press esc to go back)</Text>
    </Box>
  );
}

export const RemoveMemoryScreen = buildScreen(RemoveMemory);
