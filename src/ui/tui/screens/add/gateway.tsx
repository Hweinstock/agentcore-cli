import { useBack } from '../../hooks/use-back';
import { Box, Text } from 'ink';
import { type ReactElement } from 'react';

export function AddGateway(): ReactElement {
  useBack();
  return (
    <Box>
      <Text>This is the add gateway screen (press esc to go back)</Text>
    </Box>
  );
}
