import fs from 'fs/promises';
import { createReadStream, type Dirent } from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import type {
  IAgentSessionDetectionOptions,
  IAgentSessionWatchOptions,
  ISessionWatcher,
} from '@/lib/providers/types';
import {
  getChildPids,
  getProcessArgs,
  getProcessCwd,
  getProcessStartTimeMs,
  isProcessRunning,
} from '@/lib/process-utils';
import type { ISessionInfo } from '@/types/timeline';

const PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');
const DEFAULT_SESSIONS_ROOT = path.join(PI_AGENT_DIR, 'sessions');
const SETTINGS_PATH = path.join(PI_AGENT_DIR, 'settings.json');
const PID_POLL_INTERVAL = 10_000;
const SESSION_PROCESS_GRACE_MS = 60_000;

const NOT_RUNNING: ISessionInfo = {
  status: 'not-running',
  sessionId: null,
  jsonlPath: null,
  pid: null,
  startedAt: null,
  cwd: null,
};

export interface IPiSessionMeta {
  sessionId: string;
  jsonlPath: string;
  cwd: string | null;
  startedAt: number | null;
  mtimeMs: number | null;
}

interface IFindPiSessionOptions {
  sessionsRoot?: string;
}

const parseTimestamp = (raw: unknown): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const readFirstLine = async (jsonlPath: string): Promise<string | null> => {
  const stream = createReadStream(jsonlPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) return line;
    return null;
  } finally {
    rl.close();
    stream.destroy();
  }
};

const readPiSessionMeta = async (jsonlPath: string): Promise<IPiSessionMeta | null> => {
  const firstLine = await readFirstLine(jsonlPath);
  if (!firstLine) return null;
  try {
    const parsed = JSON.parse(firstLine) as {
      type?: string;
      id?: string;
      cwd?: string;
      timestamp?: string | number;
    };
    if (parsed.type !== 'session' || typeof parsed.id !== 'string' || !parsed.id) return null;
    return {
      sessionId: parsed.id,
      jsonlPath,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : null,
      startedAt: parseTimestamp(parsed.timestamp),
      mtimeMs: null,
    };
  } catch {
    return null;
  }
};

const listJsonlFiles = async (root: string): Promise<string[]> => {
  const result: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        result.push(entryPath);
      }
    }));
  };
  await visit(root);
  return result;
};

const withMtime = async (meta: IPiSessionMeta): Promise<IPiSessionMeta> => {
  try {
    const stat = await fs.stat(meta.jsonlPath);
    return { ...meta, mtimeMs: stat.mtimeMs };
  } catch {
    return meta;
  }
};

export const resolvePiSessionsRoot = async (): Promise<string> => {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) {
    return path.resolve(process.env.PI_CODING_AGENT_SESSION_DIR);
  }
  try {
    const settings = JSON.parse(await fs.readFile(SETTINGS_PATH, 'utf-8')) as { sessionDir?: unknown };
    if (typeof settings.sessionDir === 'string' && settings.sessionDir.trim()) {
      return path.resolve(settings.sessionDir.replace(/^~(?=$|\/)/, os.homedir()));
    }
  } catch {
    // Use Pi's default session location.
  }
  return DEFAULT_SESSIONS_ROOT;
};

export const findLatestPiSessionForCwd = async (
  cwd: string,
  options: IFindPiSessionOptions = {},
): Promise<IPiSessionMeta | null> => {
  const root = options.sessionsRoot ?? await resolvePiSessionsRoot();
  const candidates = await Promise.all((await listJsonlFiles(root)).map(async (jsonlPath) => {
    try {
      const stat = await fs.stat(jsonlPath);
      return { jsonlPath, mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }));
  candidates.sort((a, b) => (b?.mtimeMs ?? -1) - (a?.mtimeMs ?? -1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    const meta = await readPiSessionMeta(candidate.jsonlPath);
    if (meta?.cwd === cwd) return { ...meta, mtimeMs: candidate.mtimeMs };
  }
  return null;
};

export const findPiSessionById = async (
  sessionId: string,
  options: IFindPiSessionOptions = {},
): Promise<IPiSessionMeta | null> => {
  const root = options.sessionsRoot ?? await resolvePiSessionsRoot();
  for (const jsonlPath of await listJsonlFiles(root)) {
    const meta = await readPiSessionMeta(jsonlPath);
    if (meta?.sessionId === sessionId) return withMtime(meta);
  }
  return null;
};

const collectDescendants = async (panePid: number, preloaded?: number[]): Promise<number[]> => {
  const direct = preloaded ?? await getChildPids(panePid);
  if (direct.length === 0) return [];
  const grandchildren = (await Promise.all(direct.map(getChildPids))).flat();
  return [...direct, ...grandchildren];
};

const matchesPiArgs = (args: string): boolean => {
  const normalized = args.toLowerCase();
  return /(?:^|\s|\/)pi(?:\s|$)/.test(normalized)
    || normalized.includes('pi-coding-agent')
    || normalized.includes('@mariozechner/pi-coding-agent');
};

const extractSessionArgument = (args: string): string | null =>
  args.match(/(?:^|\s)--session(?:=|\s+)["']?([^\s"']+)/)?.[1] ?? null;

const findPiProcess = async (
  pids: number[],
): Promise<{ pid: number; cwd: string | null; args: string } | null> => {
  for (const pid of pids) {
    const args = await getProcessArgs(pid);
    if (!args || !matchesPiArgs(args)) continue;
    return { pid, cwd: await getProcessCwd(pid), args };
  }
  return null;
};

const isLikelySessionForProcess = async (pid: number, meta: IPiSessionMeta): Promise<boolean> => {
  if (meta.startedAt === null) return false;
  const processStartedAt = await getProcessStartTimeMs(pid, { timeoutMs: 1_000 });
  return !processStartedAt || meta.startedAt >= processStartedAt - SESSION_PROCESS_GRACE_MS;
};

const runningInfo = (
  processInfo: { pid: number; cwd: string | null },
  meta?: IPiSessionMeta | null,
): ISessionInfo => ({
  status: 'running',
  sessionId: meta?.sessionId ?? null,
  jsonlPath: meta?.jsonlPath ?? null,
  pid: processInfo.pid,
  startedAt: meta?.startedAt ?? null,
  cwd: meta?.cwd ?? processInfo.cwd,
});

export const isPiRunning = async (panePid: number, preloadedChildPids?: number[]): Promise<boolean> => {
  const descendants = await collectDescendants(panePid, preloadedChildPids);
  return (await findPiProcess(descendants)) !== null;
};

export const detectActiveSession = async (
  panePid: number,
  preloadedChildPids?: number[],
  options: IAgentSessionDetectionOptions = {},
): Promise<ISessionInfo> => {
  try {
    await fs.access(PI_AGENT_DIR);
  } catch {
    return { ...NOT_RUNNING, status: 'not-initialized' };
  }

  const found = await findPiProcess(await collectDescendants(panePid, preloadedChildPids));
  if (!found) return NOT_RUNNING;

  const sessionArg = extractSessionArgument(found.args);
  if (sessionArg) {
    const byId = await findPiSessionById(sessionArg);
    if (byId) return runningInfo(found, byId);
    try {
      const explicitPath = path.resolve(found.cwd ?? process.cwd(), sessionArg);
      const byPath = await readPiSessionMeta(explicitPath);
      if (byPath) return runningInfo(found, await withMtime(byPath));
    } catch {
      // Fall through to cwd discovery.
    }
  }

  if (found.cwd && (options.allowCwdFallback || !sessionArg)) {
    const latest = await findLatestPiSessionForCwd(found.cwd);
    if (latest && await isLikelySessionForProcess(found.pid, latest)) return runningInfo(found, latest);
  }
  return runningInfo(found);
};

export const watchSessionsDir = (
  panePid: number,
  onChange: (info: ISessionInfo) => void,
  options: IAgentSessionWatchOptions = {},
): ISessionWatcher => {
  let stopped = false;
  let currentPid: number | null = null;
  let previousKey = '';

  const poll = async () => {
    if (stopped) return;
    if (currentPid && !await isProcessRunning(currentPid)) currentPid = null;
    const info = await detectActiveSession(panePid, undefined, { allowCwdFallback: true });
    currentPid = info.pid;
    const key = `${info.status}:${info.pid ?? ''}:${info.sessionId ?? ''}:${info.jsonlPath ?? ''}`;
    if (key !== previousKey) {
      previousKey = key;
      onChange(info);
    }
  };

  const timer = setInterval(poll, PID_POLL_INTERVAL);
  if (!options.skipInitial) void poll();
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
};
