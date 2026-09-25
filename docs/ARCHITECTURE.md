# Architecture

```
core-engine (packages/core)  ← ALL logic here
   │ providers/  BYOK adapters (OpenRouter, OpenAI, Anthropic, Groq, generic router)
   │ agent/      ReAct loop + prompts + fenced tool-call parser
   │ tools/      read/write/edit/shell/search/git (each: schema + execute + destructive flag)
   │ session/    in-memory history + ~/.hasa/sessions/*.json transcript
   │ permissions/ gate (once / session / always / deny)
   │ rpc.ts      stdio JSON-RPC server (`hasa --rpc`)
          │                    │
   cli (Ink TUI)          vscode-ext (webview + ext host)
   thin renderer          thin renderer via CoreClient → `hasa --rpc`
```

Why: one implementation of agent behavior → CLI and extension stay identical.
Rule: never put agent logic in `cli` or `vscode-ext`.
