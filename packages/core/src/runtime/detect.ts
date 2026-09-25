import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface ProjectInfo {
  framework: string;
  language: string;
  packageManager: "npm" | "pnpm" | "yarn" | "pip" | "other";
  installCommand: string | null;
  devCommand: string | null;
  testCommand: string | null;
  buildCommand: string | null;
  entryFile: string | null;
  notes: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Detect framework + install/dev/test commands from well-known project files. */
export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const pkg = await readJson(path.join(cwd, "package.json"));
  if (pkg) {
    const deps = { ...((pkg["dependencies"] as Record<string, string> ?? {})), ...((pkg["devDependencies"] as Record<string, string> ?? {})) };
    const scripts = (pkg["scripts"] as Record<string, string> ?? {});
    const pm: ProjectInfo["packageManager"] = await exists(path.join(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : await exists(path.join(cwd, "yarn.lock"))
        ? "yarn"
        : "npm";
    const run = (s: string): string | null => (scripts[s] ? `${pm === "npm" ? "npm run" : pm} ${s}` : null);
    let framework = "node";
    if (deps["next"]) framework = "nextjs";
    else if (deps["vite"] || await exists(path.join(cwd, "vite.config.ts")) || await exists(path.join(cwd, "vite.config.js"))) framework = "vite+react";
    else if (deps["react"]) framework = "react";
    else if (deps["express"] || deps["fastify"] || deps["koa"]) framework = "node-server";

    return {
      framework,
      language: "typescript/javascript",
      packageManager: pm,
      installCommand: `${pm === "yarn" ? "yarn install" : pm === "pnpm" ? "pnpm install" : "npm install"}`,
      devCommand: scripts["dev"] ? run("dev") : scripts["start"] ? run("start") : null,
      testCommand: scripts["test"] ? run("test") : null,
      buildCommand: scripts["build"] ? run("build") : null,
      entryFile: (pkg["main"] as string) ?? "src/index.ts",
      notes: `scripts: ${Object.keys(scripts).join(", ") || "(none)"}`,
    };
  }

  if (await exists(path.join(cwd, "requirements.txt")) || await exists(path.join(cwd, "pyproject.toml")) || await exists(path.join(cwd, "app.py"))) {
    const isFlask = await exists(path.join(cwd, "app.py"));
    return {
      framework: isFlask ? "flask" : "python",
      language: "python",
      packageManager: "pip",
      installCommand: await exists(path.join(cwd, "requirements.txt")) ? "pip install -r requirements.txt" : null,
      devCommand: await exists(path.join(cwd, "app.py")) ? "python app.py" : null,
      testCommand: "pytest",
      buildCommand: null,
      entryFile: "app.py",
      notes: "python project",
    };
  }

  if (await exists(path.join(cwd, "pom.xml")) || await exists(path.join(cwd, "build.gradle"))) {
    return {
      framework: "java",
      language: "java",
      packageManager: "other",
      installCommand: null,
      devCommand: null,
      testCommand: await exists(path.join(cwd, "pom.xml")) ? "mvn test" : "./gradlew test",
      buildCommand: await exists(path.join(cwd, "pom.xml")) ? "mvn package" : "./gradlew build",
      entryFile: null,
      notes: "java project",
    };
  }

  if (await exists(path.join(cwd, "go.mod"))) {
    return {
      framework: "go",
      language: "go",
      packageManager: "other",
      installCommand: "go mod download",
      devCommand: "go run .",
      testCommand: "go test ./...",
      buildCommand: "go build ./...",
      entryFile: "main.go",
      notes: "go project",
    };
  }

  if (await exists(path.join(cwd, "Cargo.toml"))) {
    return {
      framework: "rust",
      language: "rust",
      packageManager: "other",
      installCommand: null,
      devCommand: "cargo run",
      testCommand: "cargo test",
      buildCommand: "cargo build",
      entryFile: "src/main.rs",
      notes: "rust project",
    };
  }

  return {
    framework: "unknown",
    language: "unknown",
    packageManager: "other",
    installCommand: null,
    devCommand: null,
    testCommand: null,
    buildCommand: null,
    entryFile: null,
    notes: "no recognized project files (package.json, requirements.txt, pom.xml, go.mod, Cargo.toml)",
  };
}

export function formatProjectInfo(info: ProjectInfo): string {
  return [
    `framework: ${info.framework} (${info.language})`,
    `install: ${info.installCommand ?? "(none)"}`,
    `dev: ${info.devCommand ?? "(none)"}`,
    `test: ${info.testCommand ?? "(none)"}`,
    `build: ${info.buildCommand ?? "(none)"}`,
    `notes: ${info.notes}`,
  ].join("\n");
}
