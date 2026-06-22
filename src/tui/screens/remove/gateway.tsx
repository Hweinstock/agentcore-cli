import { buildScreen } from '../../base-screen';
import { useBack } from '../../hooks/use-back';
import { Box, Text } from 'ink';
import { type ReactElement } from 'react';

function RemoveGateway(): ReactElement {
  useBack();
  return (
    <Box>
      <Text>This is the remove gateway screen (press esc to go back)</Text>
    </Box>
  );
}

export const RemoveGatewayScreen = buildScreen(RemoveGateway);
