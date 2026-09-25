import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS, toolMap } from "../src/tools/index.js";

describe("tool registry (blueprint: fileEdit/shell/search/git + run-fix-verify)", () => {
  it("exposes all 15 tools with unique names", () => {
    const names = ALL_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "browser_open",
      "create_folder",
      "edit_file",
      "git_commit",
      "git_diff",
      "process_logs",
      "process_start",
      "process_status",
      "process_stop",
      "project_detect",
      "read_file",
      "run_shell",
      "search_code",
      "terminal_open",
      "write_file",
    ]);
    expect(toolMap().size).toBe(15);
  });
  it("marks destructive tools correctly", () => {
    const map = toolMap();
    expect(map.get("read_file")?.destructive).toBe(false);
    expect(map.get("search_code")?.destructive).toBe(false);
    expect(map.get("git_diff")?.destructive).toBe(false);
    expect(map.get("write_file")?.destructive).toBe(true);
    expect(map.get("edit_file")?.destructive).toBe(true);
    expect(map.get("run_shell")?.destructive).toBe(true);
    expect(map.get("git_commit")?.destructive).toBe(true);
    expect(map.get("project_detect")?.destructive).toBe(false);
    expect(map.get("process_logs")?.destructive).toBe(false);
    expect(map.get("process_status")?.destructive).toBe(false);
    expect(map.get("process_start")?.destructive).toBe(true);
    expect(map.get("process_stop")?.destructive).toBe(true);
    expect(map.get("terminal_open")?.destructive).toBe(true);
    expect(map.get("create_folder")?.destructive).toBe(true);
    expect(map.get("browser_open")?.destructive).toBe(false);
  });
  it("every tool has a valid JSON-schema parameter block", () => {
    for (const t of ALL_TOOLS) {
      expect(t.parameters.type).toBe("object");
      expect(typeof t.description.length).toBe("number");
    }
  });
});

describe("transcript helpers", () => {
  it("saves, lists and reloads a transcript in an isolated dir", async () => {
    process.env["HASA_CONFIG_DIR"] = mkdtempSync(join(tmpdir(), "hasa-test-"));
    const { SessionManager } = await import("../src/session/manager.js");
    const { listTranscripts, loadTranscript } = await import("../src/session/transcript.js");
    const s = SessionManager.create(process.cwd(), "nara", "test-model");
    s.add({ role: "user", content: "hi" });
    await s.persist();
    await expect(listTranscripts()).resolves.toContain(s.meta.id);
    const loaded = await loadTranscript(s.meta.id);
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.meta.model).toBe("test-model");
  });
});
