import path from 'path';
import os from 'os';
import { ensureOmpExtension } from '@/lib/providers/omp/extension';
import { runOmpPreflight } from '@/lib/providers/omp/preflight';
import { readPiRuntimeSnapshot } from '@/lib/providers/pi/runtime-snapshot';
import { readPiSessionHistoryStats } from '@/lib/providers/pi/session-history-stats';
import {
  detectActiveSession,
  findLatestSessionInRoot,
  isPiRunning,
  matchesOmpArgs,
  watchSessionsDir,
} from '@/lib/providers/pi/session-detection';
import { getWorkspaceById } from '@/lib/workspace-store';
import type { IAgentProvider } from '@/lib/providers/types';
import type { IAgentState, ITab } from '@/types/terminal';

export const OMP_PROVIDER_ID = 'omp';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OMP_AGENT_DIR = path.join(os.homedir(), '.omp', 'agent');
export const OMP_SESSIONS_ROOT = path.join(OMP_AGENT_DIR, 'sessions');

const shellSingleQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const isValidOmpSessionId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);
type TAgentField = 'sessionId' | 'jsonlPath' | 'summary';

const ensureAgentState = (tab: ITab): IAgentState => {
  if (tab.agentState?.providerId === OMP_PROVIDER_ID) return tab.agentState;
  const state: IAgentState = {
    providerId: OMP_PROVIDER_ID,
    sessionId: null,
    jsonlPath: null,
    summary: null,
  };
  tab.agentState = state;
  return state;
};

const readField = (tab: ITab, field: TAgentField): string | null =>
  tab.agentState?.providerId === OMP_PROVIDER_ID ? tab.agentState[field] ?? null : null;

const writeField = (tab: ITab, field: TAgentField, value: string | null | undefined): void => {
  ensureAgentState(tab)[field] = value ?? null;
};

const sessionIdFromJsonlPath = (jsonlPath: string | null | undefined): string | null => {
  if (!jsonlPath) return null;
  return path.basename(jsonlPath, '.jsonl').match(UUID_RE)?.[0]
    ?? path.basename(jsonlPath, '.jsonl').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
    ?? null;
};

const composeCommand = async (sessionId?: string, workspaceId?: string): Promise<string> => {
  const extensionPath = await ensureOmpExtension();
  const parts = ['omp', '--model', shellSingleQuote('self/deepseek-v4-flash-free:max'),
    '--extension', shellSingleQuote(extensionPath)];
  // omp auto-switches to a temp dir when it starts in $HOME; pin the
  // workspace root explicitly so it never lands in /tmp.
  if (workspaceId) {
    const ws = await getWorkspaceById(workspaceId);
    const root = ws?.directories?.[0];
    if (root) parts.push('--cwd', shellSingleQuote(root), '--allow-home');
  }
  if (sessionId) parts.push('--resume', shellSingleQuote(sessionId));
  return parts.join(' ');
};

export const ompProvider: IAgentProvider = {
  id: OMP_PROVIDER_ID,
  displayName: 'Omp',
  panelType: 'omp-cli',
  matchesProcess: (commandName, args) => commandName === 'omp'
    || (commandName === 'node' && Boolean(args?.some((arg) => arg.includes('oh-my-pi') && arg.endsWith('/cli.js')))),
  isValidSessionId: isValidOmpSessionId,
  detectActiveSession: async (panePid, childPids) => {
    const base = await detectActiveSession(panePid, childPids, {
      agentDir: OMP_AGENT_DIR,
      sessionsRoot: OMP_SESSIONS_ROOT,
    }, matchesOmpArgs);
    if (base.status === 'running' && !base.sessionId && !base.jsonlPath) {
      const latest = await findLatestSessionInRoot(OMP_SESSIONS_ROOT);
      if (latest) return { ...base, sessionId: latest.sessionId, jsonlPath: latest.jsonlPath, cwd: latest.cwd ?? base.cwd };
    }
    return base;
  },
  isAgentRunning: (panePid, childPids) => isPiRunning(panePid, childPids, matchesOmpArgs),
  watchSessions: (panePid, onChange, options) =>
    watchSessionsDir(panePid, onChange, {
      ...options,
      matches: matchesOmpArgs,
      agentDir: OMP_AGENT_DIR,
      sessionsRoot: OMP_SESSIONS_ROOT,
    }),
  buildLaunchCommand: async ({ workspaceId }: { workspaceId?: string | null }) => composeCommand(undefined, workspaceId ?? undefined),
  buildResumeCommand: async (sessionId, { workspaceId }) => {
    if (!isValidOmpSessionId(sessionId)) throw new Error(`Invalid omp session ID format: ${sessionId}`);
    return composeCommand(sessionId, workspaceId ?? undefined);
  },
  readSessionId: (tab) => readField(tab, 'sessionId'),
  writeSessionId: (tab, value) => writeField(tab, 'sessionId', value),
  readJsonlPath: (tab) => readField(tab, 'jsonlPath'),
  writeJsonlPath: (tab, value) => writeField(tab, 'jsonlPath', value),
  readSummary: (tab) => readField(tab, 'summary'),
  writeSummary: (tab, value) => writeField(tab, 'summary', value),
  parsePaneTitle: () => null,
  sessionIdFromJsonlPath,
  readRuntimeSnapshot: readPiRuntimeSnapshot,
  readSessionHistoryStats: readPiSessionHistoryStats,
  preflight: runOmpPreflight,
};