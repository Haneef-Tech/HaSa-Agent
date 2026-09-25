import React from "react";
import { Box, Text } from "ink";
import type { ModelInfo } from "hasa-core";

export function ModelPicker({ models, active }: { models: ModelInfo[]; active: string }): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold>Models (Ctrl+M to close)</Text>
      {models.map((m) => (
        <Text key={`${m.provider}:${m.id}`} color={m.id === active ? "green" : undefined}>
          {m.id === active ? "● " : "○ "}[{m.provider}] {m.name}
          {m.isFree ? "  [Free]" : ""} ({Math.round(m.contextLength / 1000)}k)
        </Text>
      ))}
    </Box>
  );
}
