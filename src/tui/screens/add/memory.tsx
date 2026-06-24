import { buildScreen } from '../../base-screen';
import { useBack } from '../../hooks';
import { Box, Text } from 'ink';
import { type ReactElement } from 'react';

function AddMemory(): ReactElement {
  useBack();
  return (
    <Box>
      <Text>This is the add memory screen (press esc to go back)</Text>
    </Box>
  );
}

export const AddMemoryScreen = buildScreen(AddMemory);
