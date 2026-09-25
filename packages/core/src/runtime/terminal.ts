import { spawn } from "node:child_process";

/** Open a VISIBLE OS terminal window running `command` in `cwd`. Detached — HASA can't capture its output. */
export async function openVisibleTerminal(id: string, command: string, cwd: string): Promise<string> {
  const platform = process.platform;

  if (platform === "win32") {
    // `start "title" /D path cmd /k command` opens a new console window and keeps it open.
    // Spawn via cmd.exe detached so HASA's own TUI is not blocked.
    const title = `HASA: ${id}`;
    const child = spawn("cmd.exe", ["/c", "start", title, "/D", cwd, "cmd.exe", "/k", command], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return `Opened new terminal window "${title}" running: ${command}`;
  }

  if (platform === "darwin") {
    const script = `tell application "Terminal" to do script "cd ${JSON.stringify(cwd)} && ${command}"`;
    const child = spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" });
    child.unref();
    return `Opened macOS Terminal running: ${command}`;
  }

  // Linux: try common terminal emulators in order.
  const candidates: string[][] = [
    ["x-terminal-emulator", "-e", `bash -c ${JSON.stringify(`cd ${JSON.stringify(cwd)} && ${command}; exec bash`)}`],
    ["gnome-terminal", "--", "bash", "-c", `cd ${JSON.stringify(cwd)} && ${command}; exec bash`],
    ["konsole", "-e", "bash", "-c", `cd ${JSON.stringify(cwd)} && ${command}; exec bash`],
    ["xterm", "-e", "bash", "-c", `cd ${JSON.stringify(cwd)} && ${command}; exec bash`],
  ];
  for (const [bin, ...args] of candidates) {
    try {
      const child = spawn(bin as string, args as string[], { cwd, detached: true, stdio: "ignore" });
      await new Promise<void>((resolve) => {
        child.once("error", () => resolve());
        setTimeout(() => resolve(), 400);
      });
      if (child.pid !== undefined) {
        child.unref();
        return `Opened terminal (${bin}) running: ${command}`;
      }
    } catch {
      // try next emulator
    }
  }
  throw new Error("No terminal emulator found (tried x-terminal-emulator, gnome-terminal, konsole, xterm)");
}
