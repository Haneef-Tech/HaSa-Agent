/** Permission gate: once / session / always-for-project. Core-first safety. */

export type Decision = "allow" | "deny";
export type AskResult = "once" | "session" | "always" | "deny";

export interface GateOptions {
  defaultPolicy: "ask" | "allow" | "deny";
  alwaysAllow: string[];
  alwaysDeny: string[];
  /** Called when policy == ask and no remembered rule matches. */
  onAsk?: (action: string) => Promise<AskResult>;
}

function matches(action: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (p === action) return true;
    if (p.endsWith("*") && action.startsWith(p.slice(0, -1))) return true;
    return action.includes(p);
  });
}

export class PermissionGate {
  private sessionAllow = new Set<string>();
  private projectAllow: string[];
  private projectDeny: string[];
  private defaultPolicy: "ask" | "allow" | "deny";
  private onAsk?: (action: string) => Promise<AskResult>;

  constructor(opts: GateOptions) {
    this.defaultPolicy = opts.defaultPolicy;
    this.projectAllow = [...opts.alwaysAllow];
    this.projectDeny = [...opts.alwaysDeny];
    this.onAsk = opts.onAsk;
  }

  /** Returns allow/deny. Remembers session/always choices. */
  async check(action: string, destructive: boolean): Promise<Decision> {
    if (matches(action, this.projectDeny)) return "deny";
    if (matches(action, this.projectAllow) || this.sessionAllow.has(action)) return "allow";
    if (!destructive && this.defaultPolicy === "allow") return "allow";
    if (this.defaultPolicy === "deny") return "deny";
    if (this.defaultPolicy === "allow" && !destructive) return "allow";
    if (!this.onAsk) return "deny"; // safe default when no UI to ask
    const ans = await this.onAsk(action);
    if (ans === "once") return "allow";
    if (ans === "session") {
      this.sessionAllow.add(action);
      return "allow";
    }
    if (ans === "always") {
      this.projectAllow.push(action);
      return "allow";
    }
    return "deny";
  }

  rememberSession(action: string): void {
    this.sessionAllow.add(action);
  }

  exportRules(): { alwaysAllow: string[]; alwaysDeny: string[] } {
    return { alwaysAllow: [...this.projectAllow], alwaysDeny: [...this.projectDeny] };
  }
}
