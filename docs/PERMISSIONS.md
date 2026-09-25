# Permissions / sandbox

Every tool declares `destructive: boolean`. Reads (`read_file`, `search_code`, `git_diff`) run freely; writes/shell (`write_file`, `edit_file`, `run_shell`, `git_commit`) go through `PermissionGate.check()`:

1. `alwaysDeny` patterns (e.g. `rm -rf /`) → deny, no prompt.
2. `alwaysAllow` / remembered `session` allows → allow.
3. `defaultPolicy: ask` → `onAsk(action)` → UI returns `once | session | always | deny`.
   - CLI: auto-`once` for now (diff preview shown via `confirmDiff` hook).
   - Extension: defaults to deny until you wire a VS Code approval dialog (TODO in `extension.ts`).
4. No `onAsk` handler → **deny** (safe default for headless/RPC).

Shell extra: blocklist regex (`rm -rf /`, fork bombs, `mkfs`, `format C:`), 30s default timeout (max 120s), 4MB output cap, cwd-jailed. File tools jail paths to `cwd` (reject `..` escapes).

All tool calls append to `~/.hasa/sessions/*.json`.
