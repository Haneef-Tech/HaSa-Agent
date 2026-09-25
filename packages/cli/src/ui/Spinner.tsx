import React, { useEffect, useState } from "react";
import { Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Minimal loading spinner (ink v5 ships no Spinner component). 200ms tick avoids full-tree flicker on Windows consoles. */
export function Spinner(): React.JSX.Element {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % FRAMES.length), 200);
    return () => clearInterval(t);
  }, []);
  return <Text color="yellow">{FRAMES[i]}</Text>;
}
