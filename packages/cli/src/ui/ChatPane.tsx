import React, { memo } from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "hasa-core";

// Short, stable preview per role so huge tool outputs (file content, logs)
// never expand the layout and shake the screen. Full output stays in the transcript.
function preview(m: ChatMessage): string {
  const limit = m.role === "tool" ? 500 : 800;
  const flat = m.content.replace(/\r/g, "");
  if (flat.length <= limit) return flat;
  return flat.slice(0, limit) + "\n…(truncated — full output in session log)";
}

function ChatPaneInner({ messages }: { messages: ChatMessage[] }): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      {messages.map((m, i) => (
        <Box key={`${i}-${m.role}-${(m.name ?? "").slice(0, 24)}`} flexDirection="column" marginBottom={1}>
          <Text bold color={m.role === "user" ? "green" : m.role === "tool" ? "gray" : "cyan"}>
            {m.role === "user" ? "› you" : m.role === "tool" ? `⚙ ${m.name ?? "tool"}` : "✦ hasa"}
          </Text>
          <Text wrap="wrap">{preview(m)}</Text>
        </Box>
      ))}
    </Box>
  );
}

export const ChatPane = memo(ChatPaneInner);
