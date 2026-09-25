/** Small regex helpers shared by ProcessManager and process_* tools. */

/** Matches "Can't resolve './Login.css'", TS2307, Python tracebacks, etc. */
export interface ParsedError {
  kind: string;
  fileHint: string | null;
  message: string;
}

const PATTERNS: { kind: string; re: RegExp; fileGroup: number | null }[] = [
  { kind: "module-not-found", re: /Module not found:\s*Can't resolve\s*'([^']+)'/, fileGroup: 1 },
  { kind: "module-not-found", re: /Cannot find module\s+'([^']+)'/, fileGroup: 1 },
  { kind: "typescript", re: /(TS\d{4,5}):\s*(.+)/, fileGroup: null },
  { kind: "python-traceback", re: /File "([^"]+)", line (\d+),?/, fileGroup: 1 },
  { kind: "port-in-use", re: /(EADDRINUSE|Port \d+ is (already )?in use)/i, fileGroup: null },
  { kind: "import-error", re: /(ImportError|ModuleNotFoundError):\s*(.+)/, fileGroup: null },
  { kind: "generic-error", re: /(Error|FAILED|failed|Exception):\s*(.+)/, fileGroup: null },
];

export function parseError(output: string): ParsedError | null {
  const tail = output.slice(-8000);
  for (const p of PATTERNS) {
    const m = p.re.exec(tail);
    if (m) {
      return {
        kind: p.kind,
        fileHint: p.fileGroup !== null && m[p.fileGroup] ? (m[p.fileGroup] as string) : null,
        message: m[0].slice(0, 1000),
      };
    }
  }
  return null;
}

/** Detects dev-server URLs like "Local: http://localhost:5173/" in process output. */
export function extractDevUrl(output: string): string | null {
  const m = /(https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s]*)?)/i.exec(output)
    ?? /(https?:\/\/[^\s]+)/.exec(output);
  if (!m) return null;
  // Only treat localhost URLs (or explicit Local:/Network: vite lines) as "open in browser" candidates.
  const url = m[1] ?? null;
  if (!url) return null;
  if (/localhost|127\.0\.0\.1/i.test(url)) return url.replace(/[),.;]+$/, "");
  // For non-localhost URLs (deployed previews) still return them — the UI decides.
  if (/Local:\s*https?:\/\//i.test(output)) return url.replace(/[),.;]+$/, "");
  return /localhost|127\.0\.0\.1/.test(output) ? url.replace(/[),.;]+$/, "") : null;
}
