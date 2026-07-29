import path from 'path';
import { ensurePiExtension } from '@/lib/providers/pi/extension';
import { runPiPreflight } from '@/lib/providers/pi/preflight';
import { readPiRuntimeSnapshot } from '@/lib/providers/pi/runtime-snapshot';
import { readPiSessionHistoryStats } from '@/lib/providers/pi/session-history-stats';
import {
  detectActiveSession,
  isPiRunning,
  watchSessionsDir,
} from '@/lib/providers/pi/session-detection';
import type { IAgentProvider } from '@/lib/providers/types';
import type { IAgentState, ITab } from '@/types/terminal';

export const PI_PROVIDER_ID = 'pi';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const shellSingleQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const isValidPiSessionId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);
type TAgentField = 'sessionId' | 'jsonlPath' | 'summary';

const ensureAgentState = (tab: ITab): IAgentState => {
  if (tab.agentState?.providerId === PI_PROVIDER_ID) return tab.agentState;
  const state: IAgentState = {
    providerId: PI_PROVIDER_ID,
    sessionId: null,
    jsonlPath: null,
    summary: null,
  };
  tab.agentState = state;
  return state;
};

const readField = (tab: ITab, field: TAgentField): string | null =>
  tab.agentState?.providerId === PI_PROVIDER_ID ? tab.agentState[field] ?? null : null;

const writeField = (tab: ITab, field: TAgentField, value: string | null | undefined): void => {
  ensureAgentState(tab)[field] = value ?? null;
};

const sessionIdFromJsonlPath = (jsonlPath: string | null | undefined): string | null => {
  if (!jsonlPath) return null;
  return path.basename(jsonlPath, '.jsonl').match(UUID_RE)?.[0]
    ?? path.basename(jsonlPath, '.jsonl').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
    ?? null;
};

const composeCommand = async (sessionId?: string): Promise<string> => {
  const extensionPath = await ensurePiExtension();
  const parts = ['pi', '--extension', shellSingleQuote(extensionPath)];
  if (sessionId) parts.push('--session', shellSingleQuote(sessionId));
  return parts.join(' ');
};

export const piProvider: IAgentProvider = {
  id: PI_PROVIDER_ID,
  displayName: 'Pi',
  panelType: 'pi-cli',
  matchesProcess: (commandName, args) => commandName === 'pi'
    || (commandName === 'node' && Boolean(args?.some((arg) => arg.includes('pi-coding-agent') && arg.endsWith('/cli.js')))),
  isValidSessionId: isValidPiSessionId,
  detectActiveSession,
  isAgentRunning: isPiRunning,
  watchSessions: watchSessionsDir,
  buildLaunchCommand: () => composeCommand(),
  buildResumeCommand: async (sessionId) => {
    if (!isValidPiSessionId(sessionId)) throw new Error(`Invalid pi session ID format: ${sessionId}`);
    return composeCommand(sessionId);
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
  preflight: runPiPreflight,
};
