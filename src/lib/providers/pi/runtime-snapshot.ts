import fs from 'fs/promises';
import { summarizeToolCall } from '@/lib/session-parser';
import type { IAgentRuntimeSnapshot } from '@/lib/providers/types';
import type { ICurrentAction } from '@/types/status';
import type { TToolName } from '@/types/timeline';

const MAX_SNIPPET_LENGTH = 200;
const STALE_MS_AWAITING_API = 90_000;

interface IPiRecord {
  id?: string;
  parentId?: string | null;
  timestamp?: string | number;
  type?: string;
  message?: Record<string, unknown>;
}

const emptySnapshot = (): IAgentRuntimeSnapshot => ({
  idle: false,
  stale: false,
  lastAssistantSnippet: null,
  currentAction: null,
  reset: false,
  lastEntryTs: null,
  staleMs: 0,
  interrupted: false,
});

const compact = (text: string): string => {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > MAX_SNIPPET_LENGTH ? `${value.slice(0, MAX_SNIPPET_LENGTH)}…` : value;
};

const timestampMs = (record: IPiRecord): number | null => {
  const raw = record.timestamp ?? record.message?.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const contentBlocks = (message: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(message.content)
    ? message.content.filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null)
    : [];

const textContent = (message: Record<string, unknown>): string => {
  if (typeof message.content === 'string') return message.content;
  return contentBlocks(message)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('\n');
};

const activeBranch = (records: IPiRecord[]): IPiRecord[] => {
  const withIds = records.filter((record): record is IPiRecord & { id: string } => typeof record.id === 'string');
  if (withIds.length === 0) return records;
  const byId = new Map(withIds.map((record) => [record.id, record]));
  const branch: IPiRecord[] = [];
  const seen = new Set<string>();
  let cursor: IPiRecord | undefined = withIds.at(-1);
  while (cursor?.id && !seen.has(cursor.id)) {
    branch.push(cursor);
    seen.add(cursor.id);
    cursor = typeof cursor.parentId === 'string' ? byId.get(cursor.parentId) : undefined;
  }
  return branch.reverse();
};

const toolAction = (block: Record<string, unknown>): ICurrentAction | null => {
  if (typeof block.name !== 'string') return null;
  const name = block.name === 'bash' ? 'Bash' : block.name;
  const args = typeof block.arguments === 'object' && block.arguments !== null
    ? block.arguments as Record<string, unknown>
    : {};
  return { toolName: name as TToolName, summary: summarizeToolCall(name as TToolName, args) };
};

export const readPiRuntimeSnapshot = async (
  jsonlPath: string,
  _options: { force?: boolean } = {},
): Promise<IAgentRuntimeSnapshot> => {
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return { ...emptySnapshot(), idle: true };
    const records = activeBranch((await fs.readFile(jsonlPath, 'utf-8'))
      .split('\n')
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          const record = JSON.parse(line) as IPiRecord;
          return record.type === 'session' ? [] : [record];
        } catch {
          return [];
        }
      }));

    const completedCalls = new Set<string>();
    let lastAssistantSnippet: string | null = null;
    let lastAssistantIndex = -1;
    let lastUserIndex = -1;
    let currentAction: ICurrentAction | null = null;
    let terminalIdle = false;
    let interrupted = false;

    for (let index = 0; index < records.length; index += 1) {
      const message = records[index].message;
      if (!message) continue;
      if (message.role === 'user') lastUserIndex = index;
      if (message.role === 'toolResult' && typeof message.toolCallId === 'string') {
        completedCalls.add(message.toolCallId);
      }
      if (message.role !== 'assistant') continue;
      lastAssistantIndex = index;
      const text = textContent(message);
      if (text) lastAssistantSnippet = compact(text);
      const stopReason = typeof message.stopReason === 'string' ? message.stopReason : '';
      terminalIdle = stopReason === 'stop' || stopReason === 'error' || stopReason === 'aborted';
      interrupted = stopReason === 'error' || stopReason === 'aborted';
    }

    for (let index = records.length - 1; index >= 0 && !terminalIdle; index -= 1) {
      const message = records[index].message;
      if (message?.role !== 'assistant') continue;
      const blocks = contentBlocks(message);
      for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
        const block = blocks[blockIndex];
        if (block.type === 'toolCall' && typeof block.id === 'string' && !completedCalls.has(block.id)) {
          currentAction = toolAction(block);
          break;
        }
      }
      if (currentAction) break;
    }

    const lastEntryTs = records.length > 0 ? timestampMs(records.at(-1)!) : null;
    const reset = lastUserIndex > lastAssistantIndex;
    const waitingForAgent = reset && !currentAction;
    const elapsed = Date.now() - stat.mtimeMs;
    const stale = waitingForAgent && elapsed <= STALE_MS_AWAITING_API;
    const idle = terminalIdle || (waitingForAgent && elapsed > STALE_MS_AWAITING_API);

    return {
      idle,
      stale,
      lastAssistantSnippet,
      currentAction,
      reset,
      lastEntryTs,
      staleMs: waitingForAgent ? STALE_MS_AWAITING_API : 0,
      interrupted,
    };
  } catch {
    return emptySnapshot();
  }
};

