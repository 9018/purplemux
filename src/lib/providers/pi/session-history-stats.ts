import fs from 'fs/promises';
import type { IAgentSessionHistoryStats } from '@/lib/providers/types';

interface IPiRecord {
  id?: string;
  parentId?: string | null;
  timestamp?: string | number;
  type?: string;
  message?: Record<string, unknown>;
}

const emptyStats = (): IAgentSessionHistoryStats => ({
  toolUsage: {},
  touchedFiles: [],
  lastAssistantText: null,
  lastUserText: null,
  firstUserTs: null,
  lastAssistantTs: null,
  turnDurationMs: null,
});

const timestampMs = (record: IPiRecord): number | null => {
  const raw = record.timestamp ?? record.message?.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
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

export const readPiSessionHistoryStats = async (
  jsonlPath: string,
): Promise<IAgentSessionHistoryStats> => {
  try {
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
    const toolUsage: Record<string, number> = {};
    const touchedFiles = new Set<string>();
    let lastUserText: string | null = null;
    let lastAssistantText: string | null = null;
    let firstUserTs: number | null = null;
    let latestUserTs: number | null = null;
    let lastAssistantTs: number | null = null;

    for (const record of records) {
      const message = record.message;
      if (!message) continue;
      const timestamp = timestampMs(record);
      if (message.role === 'user') {
        const text = textContent(message);
        if (text) lastUserText = text;
        if (timestamp !== null) {
          firstUserTs ??= timestamp;
          latestUserTs = timestamp;
        }
        continue;
      }
      if (message.role !== 'assistant') continue;
      const text = textContent(message);
      if (text) lastAssistantText = text;
      if (timestamp !== null) lastAssistantTs = timestamp;
      for (const block of contentBlocks(message)) {
        if (block.type !== 'toolCall' || typeof block.name !== 'string') continue;
        toolUsage[block.name] = (toolUsage[block.name] ?? 0) + 1;
        if (!['read', 'write', 'edit'].includes(block.name.toLowerCase())) continue;
        const args = typeof block.arguments === 'object' && block.arguments !== null
          ? block.arguments as Record<string, unknown>
          : {};
        const filePath = typeof (args.file_path ?? args.path) === 'string'
          ? String(args.file_path ?? args.path)
          : '';
        if (filePath) touchedFiles.add(filePath);
      }
    }

    return {
      toolUsage,
      touchedFiles: [...touchedFiles],
      lastAssistantText,
      lastUserText,
      firstUserTs,
      lastAssistantTs,
      turnDurationMs: latestUserTs !== null && lastAssistantTs !== null && lastAssistantTs >= latestUserTs
        ? lastAssistantTs - latestUserTs
        : null,
    };
  } catch {
    return emptyStats();
  }
};

