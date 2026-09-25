import React from "react";
import { Box, Text } from "ink";

export function DiffView({ file, diff }: { file: string; diff: string }): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">Diff — {file}</Text>
      <Text>{diff.slice(0, 3000)}</Text>
    </Box>
  );
}
