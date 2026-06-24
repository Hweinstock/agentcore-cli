import { buildScreen } from '../../base-screen';
import { useBack } from '../../hooks/';
import { Box, Text } from 'ink';
import { type ReactElement } from 'react';

function AddGateway(): ReactElement {
  useBack();
  return (
    <Box>
      <Text>This is the add gateway screen (press esc to go back)</Text>
    </Box>
  );
}

export const AddGatewayScreen = buildScreen(AddGateway);
