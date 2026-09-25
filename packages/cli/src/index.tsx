#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./App.js";

const args = process.argv.slice(2);
const [cmd, ...rest] = args;

if (args.includes("--rpc")) {
  // Thin-client mode: the VS Code extension spawns this binary and talks JSON-RPC over stdio.
  const core = await import("hasa-core");
  const rpc = core as unknown as { startRpcServer: () => Promise<void> };
  await rpc.startRpcServer();
} else if (cmd === "setup") {
  const { runSetup } = await import("./setup.js");
  try {
    await runSetup();
  } catch (err) {
    console.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
} else if (cmd === "models") {
  const { runModels } = await import("./setup.js");
  try {
    await runModels(rest.includes("--all"));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
} else if (cmd === "config") {
  const { runConfigShow } = await import("./setup.js");
  await runConfigShow();
} else if (cmd === "doctor") {
  const { runDoctor } = await import("./doctor.js");
  try {
    await runDoctor();
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
} else if (cmd === "--help" || cmd === "-h" || cmd === "help" || cmd === "--version" || cmd === "-v") {
  const { printHelp } = await import("./setup.js");
  printHelp();
} else if (cmd === undefined) {
  render(<App />);
} else {
  console.error(`Unknown command "${cmd}". Run \`hasa --help\`.`);
  process.exitCode = 1;
}
