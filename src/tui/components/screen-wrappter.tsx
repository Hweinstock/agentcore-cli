import { Box, Text, useStdout } from 'ink';
import type { ReactNode } from 'react';

interface ScreenWrapperProps {
  children: ReactNode;
  footerText?: string;
}

export const ScreenWrapper = ({ children, footerText = '`esc` to go back/exit' }: ScreenWrapperProps): ReactNode => {
  const { stdout } = useStdout();

  // Fallback grid bounds if the stream isn't fully established at boot
  const width = stdout?.columns || 80;
  const height = stdout?.rows || 24;

  // Account for top and bottom visual margins to prevent line overflowing
  const contentHeight = height - 3;

  return (
    <Box width={width} height={height} flexDirection="column" justifyContent="space-between" paddingX={2} paddingY={1}>
      {/* Main Content Viewport Area */}
      <Box
        width="100%"
        height={contentHeight}
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
      >
        {children}
      </Box>

      {/* Sticky Bottom Footer Row */}
      <Box width="100%" justifyContent="flex-start">
        <Text dimColor italic>
          {footerText}
        </Text>
      </Box>
    </Box>
  );
};
