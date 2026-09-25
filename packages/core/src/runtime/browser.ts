import { spawn } from "node:child_process";

/** Open a URL in the user's default browser. Works on Windows/macOS/Linux. */
export async function openBrowser(url: string): Promise<string> {
  const cleaned = url.trim().replace(/[),.;]+$/, "");
  if (!/^https?:\/\//i.test(cleaned)) throw new Error(`Not a valid http(s) URL: ${url}`);
  const platform = process.platform;
  const args: string[][] =
    platform === "win32"
      ? [["cmd.exe", "/c", "start", "", cleaned]]
      : platform === "darwin"
        ? [["open", cleaned]]
        : [["xdg-open", cleaned], ["sensible-browser", cleaned]];

  let lastError: string | null = null;
  for (const [bin, ...rest] of args) {
    try {
      const child = spawn(bin as string, rest as string[], { detached: true, stdio: "ignore" });
      const ok = await new Promise<boolean>((resolve) => {
        child.once("error", () => resolve(false));
        setTimeout(() => resolve(child.pid !== undefined), 500);
      });
      if (ok) {
        child.unref();
        return `Opened browser: ${cleaned}`;
      }
      lastError = `failed to launch ${bin}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError ?? "Could not open a browser on this system");
}
