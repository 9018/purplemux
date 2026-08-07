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
import { piHookEvents } from '@/lib/providers/pi/hook-events';

const PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');
const DEFAULT_SESSIONS_ROOT = path.join(PI_AGENT_DIR, 'sessions');
const SETTINGS_PATH = path.join(PI_AGENT_DIR, 'settings.json');
const PID_POLL_INTERVAL = 10_000;
const SESSION_PROCESS_GRACE_MS = 60_000;
const SESSION_PROCESS_LEAD_MS = 30_000;

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
  // omp/pi session files may open with a "title" record before the session
  // record; scan the first N lines instead of assuming line 1 is the session.
  const MAX_SCAN_LINES = 40;
  const stream = createReadStream(jsonlPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let scanned = 0;
  try {
    for await (const line of rl) {
      if (++scanned > MAX_SCAN_LINES) break;
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          id?: string;
          cwd?: string;
          timestamp?: string | number;
        };
        if (parsed.type !== 'session' || typeof parsed.id !== 'string' || !parsed.id) continue;
        return {
          sessionId: parsed.id,
          jsonlPath,
          cwd: typeof parsed.cwd === 'string' ? parsed.cwd : null,
          startedAt: parseTimestamp(parsed.timestamp),
          mtimeMs: null,
        };
      } catch {
        continue;
      }
    }
    return null;
  } finally {
    rl.close();
    stream.destroy();
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

const isWithinRoot = (candidate: string, root: string): boolean => {
  const resolved = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolved.startsWith(resolvedRoot + path.sep);
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
  // omp sessions keep their launch-time cwd in the meta; when the live process
  // has cd'd elsewhere, fall back to the newest session in the same root.
  if (options.sessionsRoot && candidates[0]) {
    const meta = await readPiSessionMeta(candidates[0].jsonlPath);
    if (meta) return { ...meta, mtimeMs: candidates[0].mtimeMs };
  }
  return null;
};

export const findLatestSessionInRoot = async (root: string): Promise<IPiSessionMeta | null> => {
  const files = await listJsonlFiles(root);
  let best: { meta: IPiSessionMeta; mtimeMs: number } | null = null;
  for (const jsonlPath of files) {
    try {
      const meta = await readPiSessionMeta(jsonlPath);
      if (!meta) continue;
      const stat = await fs.stat(jsonlPath);
      if (!best || stat.mtimeMs > best.mtimeMs) best = { meta, mtimeMs: stat.mtimeMs };
    } catch {
      // skip unreadable session files
    }
  }
  return best ? { ...best.meta, mtimeMs: best.mtimeMs } : null;
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
    || normalized.includes('@mariozechner/pi-coding-agent')
    || (normalized.includes('pi-coding-agent') && !normalized.includes('oh-my-pi'));
};

export const matchesOmpArgs = (args: string): boolean => {
  const normalized = args.toLowerCase();
  return /(?:^|\s|\/)omp(?:\s|$)/.test(normalized)
    || normalized.includes('oh-my-pi')
    || normalized.includes('@oh-my-pi/pi-coding-agent');
};

type TAgentArgsMatcher = (args: string) => boolean;

const extractSessionArgument = (args: string): string | null =>
  args.match(/(?:^|\s)(?:--session|--resume)(?:=|\s+)["']?([^\s"']+)/)?.[1] ?? null;

const findPiProcess = async (
  pids: number[],
  matches = matchesPiArgs as TAgentArgsMatcher,
): Promise<{ pid: number; cwd: string | null; args: string } | null> => {
  for (const pid of pids) {
    const args = await getProcessArgs(pid);
    if (!args || !matches(args)) continue;
    return { pid, cwd: await getProcessCwd(pid), args };
  }
  return null;
};

const findCwdSessionCandidates = async (cwd: string, root: string): Promise<IPiSessionMeta[]> => {
  const metas: { meta: IPiSessionMeta; mtimeMs: number }[] = [];
  for (const jsonlPath of await listJsonlFiles(root)) {
    try {
      const meta = await readPiSessionMeta(jsonlPath);
      if (!meta || meta.cwd !== cwd) continue;
      const stat = await fs.stat(jsonlPath);
      metas.push({ meta, mtimeMs: stat.mtimeMs });
    } catch {
      // skip unreadable session files
    }
  }
  metas.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return metas.map((m) => ({ ...m.meta, mtimeMs: m.mtimeMs }));
};

const isLikelySessionForProcess = async (pid: number, meta: IPiSessionMeta): Promise<boolean> => {
  if (meta.startedAt === null) return false;
  const processStartedAt = await getProcessStartTimeMs(pid, { timeoutMs: 1_000 });
  if (!processStartedAt) return true;
  // A fresh launch writes its session file right around process start. A
  // session created significantly *after* the process started belongs to a
  // different process (e.g. another tab on the same cwd) — reject it so
  // per-tab detection doesn't leak across shared workspaces.
  if (meta.startedAt > processStartedAt + SESSION_PROCESS_LEAD_MS) return false;
  return meta.startedAt >= processStartedAt - SESSION_PROCESS_GRACE_MS;
};

const runningInfo = (
  processInfo: { pid: number; cwd: string | null },
  meta?: IPiSessionMeta | null,
  explicit = false,
): ISessionInfo => ({
  status: 'running',
  sessionId: meta?.sessionId ?? null,
  jsonlPath: meta?.jsonlPath ?? null,
  pid: processInfo.pid,
  startedAt: meta?.startedAt ?? null,
  cwd: meta?.cwd ?? processInfo.cwd,
  explicit,
});

export const isPiRunning = async (panePid: number, preloadedChildPids?: number[], matches?: TAgentArgsMatcher): Promise<boolean> => {
  const descendants = await collectDescendants(panePid, preloadedChildPids);
  return (await findPiProcess(descendants, matches)) !== null;
};

export const detectActiveSession = async (
  panePid: number,
  preloadedChildPids?: number[],
  options: IAgentSessionDetectionOptions = {},
  matches?: TAgentArgsMatcher,
): Promise<ISessionInfo> => {
  try {
    await fs.access(options.agentDir ?? PI_AGENT_DIR);
  } catch {
    return { ...NOT_RUNNING, status: 'not-initialized' };
  }

  const found = await findPiProcess(await collectDescendants(panePid, preloadedChildPids), matches);
  if (!found) return NOT_RUNNING;

  const sessionArg = extractSessionArgument(found.args);
  if (sessionArg) {
    const byId = await findPiSessionById(sessionArg, { sessionsRoot: options.sessionsRoot });
    if (byId) return runningInfo(found, byId, true);
    try {
      const explicitPath = path.resolve(found.cwd ?? process.cwd(), sessionArg);
      const sessionsRoot = options.sessionsRoot ?? await resolvePiSessionsRoot();
      const byPath = isWithinRoot(explicitPath, sessionsRoot) ? await readPiSessionMeta(explicitPath) : null;
      if (byPath) return runningInfo(found, await withMtime(byPath), true);
    } catch {
      // Fall through to cwd discovery.
    }
  }

  if (found.cwd && (options.allowCwdFallback || !sessionArg)) {
    const root = options.sessionsRoot ?? await resolvePiSessionsRoot();
    // Several tabs may share the same cwd. Walk the cwd's sessions from newest
    // to oldest and pick the first one whose start time matches this process's
    // start window, so each tab lands on its own session instead of always the
    // newest (or the first-opened) one.
    for (const cand of await findCwdSessionCandidates(found.cwd, root)) {
      if (await isLikelySessionForProcess(found.pid, cand)) return runningInfo(found, cand, false);
    }
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
  const watchedSession = options.tmuxSession;

  const handleSessionInfo = (tmuxSession: string, info: ISessionInfo) => {
    if (stopped || !watchedSession || tmuxSession !== watchedSession) return;
    currentPid = info.pid;
    previousKey = `${info.status}:${info.pid ?? ''}:${info.sessionId ?? ''}:${info.jsonlPath ?? ''}`;
    onChange(info);
  };
  if (watchedSession) piHookEvents.on('session-info', handleSessionInfo);

  const poll = async () => {
    if (stopped) return;
    if (currentPid && !await isProcessRunning(currentPid)) currentPid = null;
    const info = await detectActiveSession(panePid, undefined, {
      allowCwdFallback: true,
      sessionsRoot: options.sessionsRoot,
      agentDir: options.agentDir,
    }, options.matches);
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
      if (watchedSession) piHookEvents.off('session-info', handleSessionInfo);
    },
  };
};
