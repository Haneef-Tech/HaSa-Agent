# HASA / CodeAgent

> A free, local-first AI coding agent — rich terminal UI + VS Code extension — sharing **one core engine**. You bring your own API key (Nara, Zen, Gemini, Groq, or any OpenAI-compatible router) and pick from **free models**.

This repo was scaffolded from `opencode-agent-blueprint.md` (Phase 0 → MVP).

## Packages

| Package | Path | Description |
|---|---|---|
| `hasa-core` | `packages/core` | **All agent logic lives here.** Providers (BYOK), agent ReAct loop, tools (file/shell/search/git), session + transcript, permission/sandbox gate. Framework-agnostic. |
| `hasa-agent` | `packages/cli` | Thin terminal client (Ink/React TUI) over `core`. Chat pane, diff view, model picker, status bar. Binary: `hasa`. |
| `hasa-vscode-ext` | `packages/vscode-ext` | Thin VS Code client over `core` via local subprocess (stdio JSON-RPC). Webview chat + native diff editor. |

**Core-first rule:** new features go in `packages/core` first. Clients only render.

## Install for users (no git needed — Node 18+ only)

### Terminal app

```powershell
npm install -g hasa-agent
hasa setup      # pick provider → paste your free key → pick a free model
hasa            # start chatting

# Useful commands
hasa models        # list free models for your provider
hasa models --all  # include paid models
hasa config        # show provider/model/key status (keys redacted)
```

Your key is stored only in `%USERPROFILE%\.hasa\config.json` (Windows) or
`~/.hasa/config.json` (macOS/Linux), owner-only file. Env vars
(`NARA_API_KEY`, `ZEN_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`)
override the file when set. Re-run `hasa setup` anytime to switch
provider, key, or model.

### VS Code extension

1. Install the `.vsix` (`Extensions view → ⋯ → Install from VSIX`) or from the Marketplace once published.
2. `Ctrl+Shift+P` → **HASA: Setup API Key & Model** → pick provider, paste key, pick model.
3. `Ctrl+Shift+P` → **HASA: Open Chat**.

CLI and extension share the same `%USERPROFILE%\.hasa\config.json`, so setting
up in one place configures both.

## Quick start (from source — contributors)

```powershell
# 1. Install (npm workspaces — pnpm optional)
npm install

# 2. Build core first, then everything
npm run build

# 3. Setup (same wizard users get)
node packages/cli/dist/index.js setup

# 4. Run the TUI
node packages/cli/dist/index.js

# 5. Run tests
npm test
```

### Free models

On startup the agent calls the provider's `/models` endpoint, filters for
`prompt_price == 0 && completion_price == 0`, caches for 24h, and shows a
`Free` badge in the model picker (`Ctrl+M`). If offline, it falls back to a
curated list (see `packages/core/src/providers/freeModels.ts`).

Supported providers (all OpenAI-compatible, BYOK):

- `nara` (default — Nara router, `https://router.bynara.id/v1`)
- `zen` (OpenCode Zen, `https://opencode.ai/zen/v1` — key from opencode.ai/auth or `ZEN_API_KEY`)
- `gemini` (Google AI Studio free tier — key from aistudio.google.com/apikey)
- `anthropic`
- `groq`
- `openai-compatible` (any custom `baseUrl` — see `docs/PROVIDERS.md`)

### TUI slash commands (inside `hasa`, no restart needed)

- `/model` — list free models · `/model 3` or `/model gemma` — switch model
- `/key <api-key>` or `/key <provider> <api-key>` — save a key (never echoed)
- `/provider <id>` · `/read <path>` · `/config` · `/new` · `/help`

## VS Code extension (contributors)

```powershell
npm run build:ext
# Produces hasa-vscode-ext.vsix via vsce — install with:
code --install-extension packages/vscode-ext/hasa-vscode-ext.vsix
```

Press `Ctrl+Shift+P` → `HASA: Open Chat`. Diffs open in VS Code's native diff editor (`vscode.diff`).

## Safety

Every destructive action (`write_file`, `edit_file`, `run_shell`) requires an explicit allow: **once / session / always-for-project**. See `docs/PERMISSIONS.md`. All tool calls are logged to `~/.hasa/sessions/*.json`.

Keys are sent **only** to the provider's pinned host — never anywhere else.

## Docs

- `docs/ARCHITECTURE.md` — how core/cli/extension fit together
- `docs/PROVIDERS.md` — adding a new router (e.g. Nara)
- `docs/PERMISSIONS.md` — sandbox model
- `opencode-agent-blueprint.md` (repo root `../`) — original blueprint
