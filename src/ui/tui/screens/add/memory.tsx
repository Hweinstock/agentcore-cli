import { useBack } from '../../hooks/use-back';
import { Box, Text } from 'ink';
import { type ReactElement } from 'react';

export function AddMemory(): ReactElement {
  useBack();
  return (
    <Box>
      <Text>This is the add memory screen (press esc to go back)</Text>
    </Box>
  );
}
