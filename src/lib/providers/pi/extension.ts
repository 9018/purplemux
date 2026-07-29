import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const PURPLEMUX_DIR = path.join(os.homedir(), '.purplemux');
export const PI_EXTENSION_PATH = path.join(PURPLEMUX_DIR, 'pi-extension.ts');

export const PI_EXTENSION_SOURCE = `import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const baseDir = path.join(os.homedir(), ".purplemux");
const readTrim = (filePath: string): string => {
  try { return fs.readFileSync(filePath, "utf8").trim(); } catch { return ""; }
};
const compact = (value: unknown, limit = 500): string => {
  const text = typeof value === "string" ? value.replace(/\\s+/g, " ").trim() : "";
  return text.length > limit ? text.slice(0, limit) + "…" : text;
};
const tmuxSession = (): string => {
  if (process.env.PURPLEMUX_TMUX_SESSION) return process.env.PURPLEMUX_TMUX_SESSION;
  const pane = process.env.TMUX_PANE;
  if (!pane) return "";
  try {
    return execFileSync("tmux", ["display-message", "-p", "-t", pane, "#S"], {
      encoding: "utf8",
      timeout: 1000,
    }).trim();
  } catch { return ""; }
};
const safeArgs = (raw: unknown): Record<string, string> => {
  if (!raw || typeof raw !== "object") return {};
  const args = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ["command", "path", "file_path", "query", "pattern"]) {
    const value = compact(args[key]);
    if (value) result[key] = value;
  }
  return result;
};
const send = async (event: string, ctx: any, details: Record<string, unknown> = {}): Promise<void> => {
  const port = readTrim(path.join(baseDir, "port"));
  const token = readTrim(path.join(baseDir, "cli-token"));
  const session = tmuxSession();
  if (!port || !token || !session || typeof fetch !== "function") return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const sessionManager = ctx?.sessionManager;
    const payload = {
      event,
      sessionId: sessionManager?.getSessionId?.() ?? null,
      jsonlPath: sessionManager?.getSessionFile?.() ?? null,
      cwd: ctx?.cwd ?? sessionManager?.getCwd?.() ?? null,
      ...details,
    };
    await fetch("http://127.0.0.1:" + port + "/api/status/hook?provider=pi&tmuxSession=" + encodeURIComponent(session), {
      method: "POST",
      headers: { "content-type": "application/json", "x-pmux-token": token },
      body: JSON.stringify(payload).slice(0, 8192),
      signal: controller.signal,
    });
  } catch {} finally { clearTimeout(timer); }
};

export default function (pi: any) {
  pi.on("session_start", async (event: any, ctx: any) => send("session_start", ctx, { reason: event.reason }));
  pi.on("session_info_changed", async (event: any, ctx: any) => send("session_info_changed", ctx, { name: compact(event.name, 200) }));
  pi.on("input", async (event: any, ctx: any) => send("input", ctx, { text: compact(event.text, 4000), source: event.source }));
  pi.on("agent_start", async (_event: any, ctx: any) => send("agent_start", ctx));
  pi.on("tool_execution_start", async (event: any, ctx: any) => send("tool_execution_start", ctx, {
    toolCallId: compact(event.toolCallId, 200), toolName: compact(event.toolName, 100), args: safeArgs(event.args),
  }));
  pi.on("tool_execution_end", async (event: any, ctx: any) => send("tool_execution_end", ctx, {
    toolCallId: compact(event.toolCallId, 200), toolName: compact(event.toolName, 100), isError: event.isError === true,
  }));
  pi.on("agent_settled", async (_event: any, ctx: any) => send("agent_settled", ctx));
  pi.on("session_before_compact", async (event: any, ctx: any) => send("session_before_compact", ctx, { reason: event.reason }));
  pi.on("session_compact", async (event: any, ctx: any) => send("session_compact", ctx, { reason: event.reason }));
  pi.on("session_shutdown", async (event: any, ctx: any) => send("session_shutdown", ctx, { reason: event.reason }));
}
`;

export const ensurePiExtension = async (): Promise<string> => {
  await fs.mkdir(PURPLEMUX_DIR, { recursive: true, mode: 0o700 });
  try {
    if (await fs.readFile(PI_EXTENSION_PATH, 'utf-8') === PI_EXTENSION_SOURCE) {
      await fs.chmod(PI_EXTENSION_PATH, 0o700).catch(() => {});
      return PI_EXTENSION_PATH;
    }
  } catch {
    // Write or refresh the generated extension below.
  }
  await fs.writeFile(PI_EXTENSION_PATH, PI_EXTENSION_SOURCE, { mode: 0o700 });
  await fs.chmod(PI_EXTENSION_PATH, 0o700);
  return PI_EXTENSION_PATH;
};

