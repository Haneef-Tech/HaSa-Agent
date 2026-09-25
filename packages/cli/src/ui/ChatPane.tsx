import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "hasa-core";

export function ChatPane({ messages }: { messages: ChatMessage[] }): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      {messages.map((m, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Text bold color={m.role === "user" ? "green" : m.role === "tool" ? "gray" : "cyan"}>
            {m.role === "user" ? "› you" : m.role === "tool" ? `⚙ ${m.name ?? "tool"}` : "✦ hasa"}
          </Text>
          <Text>{m.content.length > 1500 ? m.content.slice(0, 1500) + "\n…(truncated)" : m.content}</Text>
        </Box>
      ))}
    </Box>
  );
}
