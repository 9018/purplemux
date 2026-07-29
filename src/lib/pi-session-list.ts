import fs from 'fs/promises';
import path from 'path';
import { parsePiContent } from '@/lib/session-parser-pi';
import { resolvePiSessionsRoot } from '@/lib/providers/pi/session-detection';

const MAX_FIRST_MESSAGE_LENGTH = 200;

export interface IPiSessionEntry {
  provider: 'pi';
  sessionId: string;
  jsonlPath: string;
  startedAt: number;
  lastActivityAt: number;
  cwd: string | null;
  model: string | null;
  firstUserMessage: string | null;
  turnCount: number;
  totalTokens: number | null;
}

interface IListPiSessionsOptions {
  cwd: string;
  sessionsRoot?: string;
}

interface IListPiSessionsResult {
  sessions: IPiSessionEntry[];
  scannedDirs: number;
  scannedFiles: number;
}

interface IPiRecord {
  type?: string;
  id?: string;
  parentId?: string | null;
  message?: Record<string, unknown>;
}

const listJsonlFiles = async (root: string): Promise<{ files: string[]; dirs: number }> => {
  const files: string[] = [];
  let dirs = 0;
  const visit = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    dirs += 1;
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(entryPath);
    }));
  };
  await visit(root);
  return { files, dirs };
};

const activeBranch = (records: IPiRecord[]): IPiRecord[] => {
  const withIds = records.filter((record): record is IPiRecord & { id: string } => typeof record.id === 'string');
  if (withIds.length === 0) return records;
  const byId = new Map(withIds.map((record) => [record.id, record]));
  const result: IPiRecord[] = [];
  const seen = new Set<string>();
  let cursor: IPiRecord | undefined = withIds.at(-1);
  while (cursor?.id && !seen.has(cursor.id)) {
    result.push(cursor);
    seen.add(cursor.id);
    cursor = typeof cursor.parentId === 'string' ? byId.get(cursor.parentId) : undefined;
  }
  return result.reverse();
};

const extractModelAndTokens = (content: string): { model: string | null; totalTokens: number | null } => {
  const records: IPiRecord[] = content.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const record = JSON.parse(line) as IPiRecord;
      return record.type === 'session' ? [] : [record];
    } catch {
      return [];
    }
  });
  let model: string | null = null;
  let totalTokens = 0;
  let hasUsage = false;
  for (const record of activeBranch(records)) {
    const message = record.message;
    if (message?.role !== 'assistant') continue;
    if (typeof message.model === 'string') model = message.model;
    if (typeof message.usage !== 'object' || message.usage === null) continue;
    const usage = message.usage as Record<string, unknown>;
    if (typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens)) {
      totalTokens += usage.totalTokens;
      hasUsage = true;
    } else {
      const sum = ['input', 'output', 'cacheRead', 'cacheWrite']
        .reduce((value, key) => value + (typeof usage[key] === 'number' ? Number(usage[key]) : 0), 0);
      if (sum > 0) {
        totalTokens += sum;
        hasUsage = true;
      }
    }
  }
  return { model, totalTokens: hasUsage ? totalTokens : null };
};

const readEntry = async (jsonlPath: string): Promise<IPiSessionEntry | null> => {
  try {
    const [content, stat] = await Promise.all([fs.readFile(jsonlPath, 'utf-8'), fs.stat(jsonlPath)]);
    const parsed = parsePiContent(content);
    if (!parsed.sessionId) return null;
    const userEntries = parsed.entries.filter((entry) => entry.type === 'user-message');
    const firstUser = userEntries[0];
    const firstUserMessage = firstUser?.type === 'user-message' && firstUser.text.trim()
      ? firstUser.text.trim().slice(0, MAX_FIRST_MESSAGE_LENGTH)
      : null;
    const headerLine = content.split('\n').find((line) => line.trim());
    const header = headerLine ? JSON.parse(headerLine) as { timestamp?: unknown } : {};
    const startedAt = typeof header.timestamp === 'string' ? Date.parse(header.timestamp) : Number(header.timestamp);
    const { model, totalTokens } = extractModelAndTokens(content);
    return {
      provider: 'pi',
      sessionId: parsed.sessionId,
      jsonlPath,
      startedAt: Number.isFinite(startedAt) ? startedAt : stat.birthtimeMs,
      lastActivityAt: stat.mtimeMs,
      cwd: parsed.cwd,
      model,
      firstUserMessage,
      turnCount: userEntries.length,
      totalTokens,
    };
  } catch {
    return null;
  }
};

export const listPiSessions = async ({
  cwd,
  sessionsRoot,
}: IListPiSessionsOptions): Promise<IListPiSessionsResult> => {
  const root = sessionsRoot ?? await resolvePiSessionsRoot();
  const scanned = await listJsonlFiles(root);
  const parsed = await Promise.all(scanned.files.map(readEntry));
  const sessions = parsed
    .filter((entry): entry is IPiSessionEntry => entry !== null && entry.cwd === cwd)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return { sessions, scannedDirs: scanned.dirs, scannedFiles: scanned.files.length };
};

