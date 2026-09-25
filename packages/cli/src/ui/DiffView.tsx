import React from "react";
import { Box, Text } from "ink";

export function DiffView({ file, diff }: { file: string; diff: string }): React.JSX.Element {
  const short = diff.length > 1200 ? diff.slice(0, 1200) + "\n…(truncated)" : diff;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">Diff — {file}</Text>
      <Text wrap="wrap">{short}</Text>
    </Box>
  );
}
