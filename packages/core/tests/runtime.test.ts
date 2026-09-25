import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectProject } from "../src/runtime/detect.js";
import { extractDevUrl, parseError } from "../src/runtime/errors.js";
import { ProcessManager } from "../src/runtime/processManager.js";
import { toolMap } from "../src/tools/index.js";
import { PermissionGate } from "../src/permissions/gate.js";

describe("detectProject", () => {
  it("detects a vite project from package.json", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hasa-detect-"));
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0", vite: "^5.0.0" }, scripts: { dev: "vite", build: "vite build", test: "vitest run" } }),
    );
    const info = await detectProject(dir);
    expect(info.framework).toBe("vite+react");
    expect(info.devCommand).toContain("dev");
    expect(info.testCommand).toContain("test");
  });

  it("falls back to unknown for empty dirs", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hasa-empty-"));
    const info = await detectProject(dir);
    expect(info.framework).toBe("unknown");
  });
});

describe("errors", () => {
  it("parses module-not-found with file hint", () => {
    const err = parseError("ERROR Module not found: Can't resolve './Login.css'");
    expect(err?.kind).toBe("module-not-found");
    expect(err?.fileHint).toBe("./Login.css");
  });

  it("extracts localhost dev URLs", () => {
    expect(extractDevUrl("Local: http://localhost:5173/")).toBe("http://localhost:5173/");
  });
});

describe("processManager", () => {
  it("runs a one-shot echo and captures logs", async () => {
    const mgr = new ProcessManager();
    const cmd = process.platform === "win32" ? "echo hello-hasa" : "echo hello-hasa";
    await mgr.start("echo-test", cmd, process.cwd());
    await new Promise((r) => setTimeout(r, 800));
    const logs = mgr.logs("echo-test", 20);
    expect(logs).toContain("hello-hasa");
    await mgr.stop("echo-test");
  }, 10000);
});

describe("process tools", () => {
  it("exposes project_detect + process_* + terminal_open + browser_open + create_folder tools", () => {
    const map = toolMap();
    for (const name of ["project_detect", "process_start", "process_logs", "process_status", "process_stop", "terminal_open", "browser_open", "create_folder"]) {
      expect(map.has(name)).toBe(true);
    }
  });

  it("project_detect runs without permission prompts", async () => {
    const map = toolMap();
    const tool = map.get("project_detect");
    if (!tool) throw new Error("missing project_detect");
    const gate = new PermissionGate({ defaultPolicy: "deny", alwaysAllow: [], alwaysDeny: [] });
    const out = await tool.execute({}, { cwd: process.cwd(), gate });
    expect(out.ok).toBe(true);
    expect(out.output).toContain("framework:");
  });

  it("create_folder creates nested dirs inside cwd", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hasa-folder-"));
    const map = toolMap();
    const tool = map.get("create_folder");
    if (!tool) throw new Error("missing create_folder");
    const gate = new PermissionGate({ defaultPolicy: "allow", alwaysAllow: [], alwaysDeny: [], onAsk: async () => "once" });
    const out = await tool.execute({ path: "a/b" }, { cwd: dir, gate });
    expect(out.ok).toBe(true);
    const stat = await fs.stat(path.join(dir, "a", "b"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("browser_open rejects non-http URLs without launching anything", async () => {
    const map = toolMap();
    const tool = map.get("browser_open");
    if (!tool) throw new Error("missing browser_open");
    const gate = new PermissionGate({ defaultPolicy: "deny", alwaysAllow: [], alwaysDeny: [] });
    const out = await tool.execute({ url: "not-a-url" }, { cwd: process.cwd(), gate });
    expect(out.ok).toBe(false);
  });
});
