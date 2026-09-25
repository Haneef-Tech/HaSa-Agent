import React from "react";
import { Box, Text } from "ink";

export function StatusBar({ provider, model, session, busy }: { provider: string; model: string; session: string; busy: boolean }): React.JSX.Element {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        {busy ? "⏳ working…  " : "● ready  "}| {provider} / {model} | session {session.slice(-8)} | Ctrl+N new · Ctrl+M models · Ctrl+K commands · Ctrl+C quit
      </Text>
    </Box>
  );
}
