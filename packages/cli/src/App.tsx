import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import {
  apiKeyFor,
  getProvider,
  loadConfig,
  onlyChatModels,
  readCache,
  runAgent,
  writeCache,
  PermissionGate,
  SessionManager,
  type ChatMessage,
  type ModelInfo,
} from "hasa-core";
import { ChatPane } from "./ui/ChatPane.js";
import { DiffView } from "./ui/DiffView.js";
import { Spinner } from "./ui/Spinner.js";
import { ModelPicker } from "./ui/ModelPicker.js";
import { StatusBar } from "./ui/StatusBar.js";
import { runSlash } from "./commands.js";

async function fetchModels(): Promise<{ provider: string; model: string; models: ModelInfo[] }> {
  const cfg = await loadConfig();
  const provider = getProvider(cfg.provider, cfg.providers?.[cfg.provider]?.baseUrl);
  const key = apiKeyFor(cfg, cfg.provider);
  if (!key) return { provider: cfg.provider, model: cfg.model, models: [] };
  const cached = await readCache(cfg.provider);
  if (cached) return { provider: cfg.provider, model: cfg.model, models: onlyChatModels(cached.models) };
  const all = await provider.listModels(key, cfg.providers?.[cfg.provider]?.baseUrl);
  const free = all.filter((m) => m.isFree);
  const show = onlyChatModels(free.length > 0 ? free : all).slice(0, 30);
  await writeCache(cfg.provider, show);
  return { provider: cfg.provider, model: cfg.model, models: show };
}

export function App(): React.JSX.Element {
  const { exit } = useApp();
  const { stdin, setRawMode } = useStdin();
  const [provider, setProvider] = useState("…");
  const [model, setModel] = useState("…");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm HASA. Ask me to read, edit, or explain code. Type and press Enter." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [session] = useState(() => SessionManager.create(process.cwd(), "nara", "model"));
  const choicesRef = useRef<ModelInfo[]>([]);
  // Pending file-write approval: agent loop waits until the user presses y/n.
  const [pendingDiff, setPendingDiff] = useState<{ file: string; diff: string } | null>(null);
  const diffResolver = useRef<((ok: boolean) => void) | null>(null);
  // Live task indicator: which tool is running right now (null = thinking).
  const [currentTool, setCurrentTool] = useState<string | null>(null);

  useEffect(() => {
    void fetchModels().then((r) => {
      setProvider(r.provider);
      setModel(r.model);
      setModels(r.models);
      session.meta.provider = r.provider;
      session.meta.model = r.model;
    });
    setRawMode?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      setInput("");
      // Slash commands (/model, /key, /provider, /config, /new, /help) never reach the agent.
      const slash = await runSlash(trimmed, {
        provider,
        setProvider,
        setModel,
        setModels,
        newSession: () => setMessages([{ role: "assistant", content: "New session started." }]),
        takeChoices: () => choicesRef.current,
        stashChoices: (c) => {
          choicesRef.current = c;
        },
      });
      if (slash.handled) {
        setMessages((m) => [...m, ...slash.replies]);
        return;
      }
      setBusy(true);
      try {
        const cfg = await loadConfig();
        const p = getProvider(cfg.provider, cfg.providers?.[cfg.provider]?.baseUrl);
        const key = apiKeyFor(cfg, cfg.provider);
        if (!key) {
          setMessages((m) => [...m, { role: "assistant", content: "No API key found. Set OPENROUTER_API_KEY or fill ~/.hasa/config.json (see README)." }]);
          return;
        }
        const gate = new PermissionGate({
          defaultPolicy: cfg.permissions?.defaultPolicy ?? "ask",
          alwaysAllow: cfg.permissions?.alwaysAllow ?? [],
          alwaysDeny: cfg.permissions?.alwaysDeny ?? [],
          // TUI auto-allows reads, asks (allow-once) for writes via confirmDiff below.
          onAsk: async () => "once",
        });
        const history = messages.filter((m) => m.role === "user" || m.role === "assistant");
        const full = [...history, { role: "user", content: trimmed } as ChatMessage];
        const text = await runAgent(trimmed, history, {
          provider: p,
          model: cfg.model,
          apiKey: key,
          baseUrl: cfg.providers?.[cfg.provider]?.baseUrl,
          cwd: process.cwd(),
          toolCtx: {
            cwd: process.cwd(),
            gate,
            // Show the real diff and block until the user presses y (allow) or n (deny).
            confirmDiff: (file, diff) =>
              new Promise<boolean>((resolve) => {
                diffResolver.current = resolve;
                setPendingDiff({ file, diff });
              }),
          },
          events: {
            onToolStart: (c) => {
              setCurrentTool(c.name);
              setMessages((m) => [...m, { role: "tool", content: `running ${c.name}…`, name: c.name }]);
            },
            onToolEnd: (c, out, ok) => {
              setCurrentTool(null);
              setMessages((m) => [...m, { role: "tool", content: `[${c.name} ${ok ? "ok" : "failed"}] ${out.slice(0, 2000)}`, name: c.name }]);
            },
          },
        });
        setMessages((m) => [...m, { role: "assistant", content: text }]);
        for (const mm of full) session.add(mm);
        session.add({ role: "assistant", content: text });
        await session.persist();
      } catch (err) {
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
      } finally {
        setBusy(false);
        setCurrentTool(null);
      }
    },
    [messages, provider, session],
  );

  useInput((ch, key) => {
    // A file write is waiting for approval — y allows, n/Esc denies.
    if (pendingDiff) {
      if (ch === "y" || ch === "Y") {
        diffResolver.current?.(true);
        diffResolver.current = null;
        setPendingDiff(null);
      } else if (ch === "n" || ch === "N" || key.escape) {
        diffResolver.current?.(false);
        diffResolver.current = null;
        setPendingDiff(null);
        setMessages((m) => [...m, { role: "tool", content: "User rejected the diff — file not written." }]);
      }
      if (key.ctrl && ch === "c") exit();
      return;
    }
    if (key.ctrl && ch === "c") exit();
    if (key.ctrl && ch === "n") {
      setMessages([{ role: "assistant", content: "New session started." }]);
      return;
    }
    if (key.ctrl && ch === "m") {
      setShowModels((s) => !s);
      return;
    }
    if (key.ctrl && ch === "k") {
      setShowPalette((s) => !s);
      return;
    }
    if (key.return && !busy) {
      void submit(input);
      return;
    }
    if (key.backspace || key.delete) {
      setInput((s) => s.slice(0, -1));
      return;
    }
    if (ch && !key.ctrl && !key.meta) setInput((s) => (s + ch).slice(0, 4000));
  });

  void stdin;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="magenta">HASA — coding agent ({provider}/{model})</Text>
      <Box borderStyle="single" flexDirection="column" paddingX={1}>
        <ChatPane messages={messages.slice(-25)} />
      </Box>
      {showModels && <ModelPicker models={models} active={model} />}
      {pendingDiff && (
        <Box flexDirection="column">
          <DiffView file={pendingDiff.file} diff={pendingDiff.diff} />
          <Text bold color="yellow">Allow this change? Press y (write) or n (skip)</Text>
        </Box>
      )}
      {showPalette && (
        <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
          <Text bold>Commands (Ctrl+K to close)</Text>
          <Text>Ctrl+N — new session · Ctrl+M — model picker · Ctrl+C — quit · Enter — send</Text>
        </Box>
      )}
      <Box marginTop={1}>
        {busy ? (
          <Box>
            <Spinner />
            <Text color="yellow">{currentTool ? ` building with ${currentTool}…` : " thinking…"}</Text>
          </Box>
        ) : (
          <Box>
            <Text color="green">› </Text>
            <Text>{input + "█"}</Text>
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <StatusBar provider={provider} model={model} session={session.meta.id} busy={busy} />
      </Box>
    </Box>
  );
}
