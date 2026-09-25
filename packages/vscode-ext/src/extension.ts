import * as vscode from "vscode";
import { CoreClient, defaultCliEntry } from "./coreClient.js";
import { PROVIDER_IDS, configPath, readStoredConfig, writeStoredConfig } from "./setup.js";
import { getWebviewHtml } from "./webview/html.js";

let client: CoreClient | undefined;

/** Guided setup: provider → key → model, saved to the shared ~/.hasa/config.json. */
async function runSetupFlow(): Promise<void> {
  const stored = await readStoredConfig();
  const provider =
    (await vscode.window.showQuickPick(PROVIDER_IDS, {
      placeHolder: "Choose your model provider (bring your own free API key)",
    })) ?? stored.provider ??
    "nara";
  if (!PROVIDER_IDS.includes(provider)) return;

  let baseUrl = stored.providers?.[provider]?.baseUrl ?? "";
  if (provider === "openai-compatible") {
    const url = await vscode.window.showInputBox({
      prompt: "Router base URL (e.g. https://your-router-host/v1)",
      value: baseUrl,
      validateInput: (v) => (v.startsWith("https://") ? undefined : "Must start with https://"),
    });
    if (!url) return;
    baseUrl = url;
  }

  const hasKey = Boolean(stored.apiKeys?.[provider]);
  const keyChoice =
    (await vscode.window.showQuickPick(hasKey ? ["Keep existing key", "Enter a new key"] : ["Enter a new key"], {
      placeHolder: hasKey ? `A key for ${provider} is already saved` : `Paste your ${provider} API key`,
    })) ?? (hasKey ? "Keep existing key" : undefined);
  if (!keyChoice) return;
  let apiKey = stored.apiKeys?.[provider] ?? "";
  if (keyChoice === "Enter a new key") {
    const entered = await vscode.window.showInputBox({
      prompt: `Paste your ${provider} API key (stored only on this machine)`,
      password: true,
      validateInput: (v) => (v.trim().length > 0 ? undefined : "Key cannot be empty"),
    });
    if (!entered) return;
    apiKey = entered.trim();
  }

  // Save provider+key first so core can list models with them.
  await writeStoredConfig({
    provider,
    apiKeys: { [provider]: apiKey },
    ...(baseUrl ? { providers: { [provider]: { baseUrl } } } : {}),
  });

  // Fetch models through core and let the user pick (free first).
  let models: Array<{ id: string; name: string; isFree: boolean; provider: string }> = [];
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "HASA: fetching models…" }, async () => {
      models = (await client?.listModels()) ?? [];
    });
  } catch {
    models = [];
  }
  const free = models.filter((m) => m.isFree);
  const choices = (free.length > 0 ? free : models).slice(0, 30);
  if (choices.length > 0) {
    const picked = await vscode.window.showQuickPick(
      choices.map((m) => ({ label: `${m.id}${m.isFree ? "  [Free]" : ""}`, detail: m.name, id: m.id })),
      { placeHolder: "Choose your model" },
    );
    if (picked) await writeStoredConfig({ model: picked.id });
  } else {
    const manual = await vscode.window.showInputBox({ prompt: "No models returned — type a model id manually", value: stored.model ?? "" });
    if (manual) await writeStoredConfig({ model: manual.trim() });
  }

  void vscode.window.showInformationMessage(`HASA ready: ${provider} — run "HASA: Open Chat" to start. (Config: ${configPath()})`);
}

export function activate(context: vscode.ExtensionContext): void {
  client = new CoreClient(defaultCliEntry(context.extensionPath));
  client.start();

  const setup = vscode.commands.registerCommand("hasa.setup", () => runSetupFlow());

  const openChat = vscode.commands.registerCommand("hasa.openChat", async () => {
    const panel = vscode.window.createWebviewPanel("hasa.chat", "HASA Chat", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = getWebviewHtml();
    const history: Array<{ role: string; content: string }> = [];

    panel.webview.onDidReceiveMessage(async (msg: { type: string; text?: string }) => {
      if (msg.type === "send" && msg.text) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        history.push({ role: "user", content: msg.text });
        panel.webview.postMessage({ type: "assistantDelta", text: "⏳ working…" });
        try {
          const text = await client?.chat(msg.text, cwd, history);
          history.push({ role: "assistant", content: text ?? "" });
          panel.webview.postMessage({ type: "assistant", text });
          // If the answer mentions a file path, offer native diff: keep it simple —
          // user can run "HASA: Show Diff" via command palette.
        } catch (err) {
          panel.webview.postMessage({ type: "assistant", text: `Error: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
      if (msg.type === "models") {
        try {
          panel.webview.postMessage({ type: "models", models: await client?.listModels() });
        } catch {
          panel.webview.postMessage({ type: "models", models: [] });
        }
      }
    });
  });

  const showDiff = vscode.commands.registerCommand("hasa.showDiff", async () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc) {
      void vscode.window.showInformationMessage("Open a file first, then run HASA: Show Diff.");
      return;
    }
    const left = vscode.Uri.parse(`untitled:hasa-before-${Date.now()}`);
    // Native diff editor — feels built-in.
    await vscode.commands.executeCommand("vscode.diff", left, doc.uri, "HASA diff preview");
  });

  context.subscriptions.push(setup, openChat, showDiff);
}

export function deactivate(): void {
  client?.stop();
}
