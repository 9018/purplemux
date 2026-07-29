import fs from 'fs/promises';
import { summarizeToolCall, summarizeToolResult } from '@/lib/session-parser';
import type {
  IChunkReadResult,
  IParseResult,
  ITimelineAssistantMessage,
  ITimelineContextCompacted,
  ITimelineEntry,
  ITimelineThinking,
  ITimelineToolCall,
  ITimelineToolResult,
  ITimelineUserMessage,
} from '@/types/timeline';

interface IPiHeader {
  type: 'session';
  id?: string;
  cwd?: string;
  timestamp?: string;
}

interface IPiRecord {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: Record<string, unknown>;
  summary?: string;
  tokensBefore?: number;
}

interface IParsedLine {
  record: IPiRecord;
  offset: number;
  lineIndex: number;
}

export interface IPiParseResult extends IParseResult {
  sessionId: string | null;
  cwd: string | null;
}

const timestampMs = (raw: unknown): number => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const textFromContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: string; text?: string } => typeof block === 'object' && block !== null)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n');
};

const imagesFromContent = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (typeof block !== 'object' || block === null) return [];
    const item = block as Record<string, unknown>;
    if (item.type !== 'image' || typeof item.data !== 'string' || typeof item.mimeType !== 'string') return [];
    return [`data:${item.mimeType};base64,${item.data}`];
  });
};

const usageFromMessage = (message: Record<string, unknown>): ITimelineAssistantMessage['usage'] | undefined => {
  const raw = message.usage;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const usage = raw as Record<string, unknown>;
  const input = typeof usage.input === 'number' ? usage.input : 0;
  const output = typeof usage.output === 'number' ? usage.output : 0;
  const cacheRead = typeof usage.cacheRead === 'number' ? usage.cacheRead : undefined;
  const cacheWrite = typeof usage.cacheWrite === 'number' ? usage.cacheWrite : undefined;
  return {
    input_tokens: input,
    output_tokens: output,
    ...(cacheRead !== undefined ? { cache_read_input_tokens: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cache_creation_input_tokens: cacheWrite } : {}),
  };
};

const activeBranch = (lines: IParsedLine[]): IParsedLine[] => {
  if (lines.length === 0) return [];
  const idLines = lines.filter((line) => typeof line.record.id === 'string' && line.record.id);
  if (idLines.length === 0) return lines;

  const byId = new Map(idLines.map((line) => [line.record.id as string, line]));
  const branch: IParsedLine[] = [];
  const seen = new Set<string>();
  let cursor: IParsedLine | undefined = idLines.at(-1);

  while (cursor?.record.id && !seen.has(cursor.record.id)) {
    branch.push(cursor);
    seen.add(cursor.record.id);
    const parentId = cursor.record.parentId;
    cursor = typeof parentId === 'string' ? byId.get(parentId) : undefined;
  }

  return branch.reverse();
};

const mapMessage = (
  line: IParsedLine,
  completedToolCalls: Map<string, boolean>,
): ITimelineEntry[] => {
  const message = line.record.message;
  if (!message) return [];
  const role = message.role;
  const timestamp = timestampMs(line.record.timestamp ?? message.timestamp);
  const baseId = line.record.id ?? `line-${line.lineIndex}`;

  if (role === 'user') {
    const text = textFromContent(message.content);
    const images = imagesFromContent(message.content);
    return [{
      id: `${baseId}-user`,
      type: 'user-message',
      timestamp,
      text,
      ...(images.length > 0 ? { images } : {}),
    } satisfies ITimelineUserMessage];
  }

  if (role === 'assistant') {
    const content = Array.isArray(message.content) ? message.content : [];
    const usage = usageFromMessage(message);
    const result: ITimelineEntry[] = [];
    for (let index = 0; index < content.length; index += 1) {
      const raw = content[index];
      if (typeof raw !== 'object' || raw === null) continue;
      const block = raw as Record<string, unknown>;
      if (block.type === 'text' && typeof block.text === 'string') {
        result.push({
          id: `${baseId}-text-${index}`,
          type: 'assistant-message',
          timestamp,
          markdown: block.text,
          stopReason: typeof message.stopReason === 'string' ? message.stopReason : null,
          model: typeof message.model === 'string' ? message.model : undefined,
          usage,
        } satisfies ITimelineAssistantMessage);
      } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
        result.push({
          id: `${baseId}-thinking-${index}`,
          type: 'thinking',
          timestamp,
          thinking: block.thinking,
        } satisfies ITimelineThinking);
      } else if (block.type === 'toolCall' && typeof block.id === 'string' && typeof block.name === 'string') {
        const args = typeof block.arguments === 'object' && block.arguments !== null
          ? block.arguments as Record<string, unknown>
          : {};
        result.push({
          id: `${baseId}-tool-${block.id}`,
          type: 'tool-call',
          timestamp,
          toolUseId: block.id,
          toolName: block.name,
          summary: summarizeToolCall(block.name === 'bash' ? 'Bash' : block.name, args),
          status: completedToolCalls.has(block.id)
            ? completedToolCalls.get(block.id) ? 'success' : 'error'
            : 'pending',
        } satisfies ITimelineToolCall);
      }
    }
    return result;
  }

  if (role === 'toolResult' && typeof message.toolCallId === 'string') {
    const content = message.content;
    return [{
      id: `${baseId}-result`,
      type: 'tool-result',
      timestamp,
      toolUseId: message.toolCallId,
      isError: message.isError === true,
      summary: summarizeToolResult(Array.isArray(content) ? content : textFromContent(content), message.isError === true),
    } satisfies ITimelineToolResult];
  }

  if (role === 'bashExecution' && typeof message.command === 'string') {
    const toolUseId = `bash-${baseId}`;
    const isError = message.cancelled === true || (typeof message.exitCode === 'number' && message.exitCode !== 0);
    return [
      {
        id: `${baseId}-bash-call`,
        type: 'tool-call',
        timestamp,
        toolUseId,
        toolName: 'Bash',
        summary: summarizeToolCall('Bash', { command: message.command }),
        status: isError ? 'error' : 'success',
      } satisfies ITimelineToolCall,
      {
        id: `${baseId}-bash-result`,
        type: 'tool-result',
        timestamp,
        toolUseId,
        isError,
        summary: summarizeToolResult(typeof message.output === 'string' ? message.output : '', isError),
      } satisfies ITimelineToolResult,
    ];
  }

  if (role === 'custom' && message.display === true) {
    const markdown = textFromContent(message.content);
    if (!markdown) return [];
    return [{
      id: `${baseId}-custom`,
      type: 'assistant-message',
      timestamp,
      markdown,
      model: typeof message.customType === 'string' ? message.customType : undefined,
    } satisfies ITimelineAssistantMessage];
  }

  if (role === 'branchSummary' && typeof message.summary === 'string') {
    return [{
      id: `${baseId}-branch-summary`,
      type: 'assistant-message',
      timestamp,
      markdown: message.summary,
      model: 'branch-summary',
    } satisfies ITimelineAssistantMessage];
  }

  if (role === 'compactionSummary') {
    return [{
      id: `${baseId}-compaction`,
      type: 'context-compacted',
      timestamp,
      beforeTokens: typeof message.tokensBefore === 'number' ? message.tokensBefore : undefined,
    } satisfies ITimelineContextCompacted];
  }

  return [];
};

export const parsePiContent = (content: string): IPiParseResult => {
  const rawLines = content.split('\n');
  const parsedLines: IParsedLine[] = [];
  let header: IPiHeader | null = null;
  let byteOffset = 0;
  let errorCount = 0;

  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    const lineOffset = byteOffset;
    byteOffset += Buffer.byteLength(raw, 'utf-8') + (index < rawLines.length - 1 ? 1 : 0);
    if (!raw.trim()) continue;
    try {
      const record = JSON.parse(raw) as IPiRecord;
      if (record.type === 'session' && header === null) {
        header = record as IPiHeader;
      } else {
        parsedLines.push({ record, offset: lineOffset, lineIndex: index });
      }
    } catch {
      errorCount += 1;
    }
  }

  const branch = activeBranch(parsedLines);
  const completedToolCalls = new Map<string, boolean>();
  for (const line of branch) {
    const message = line.record.message;
    if (message?.role === 'toolResult' && typeof message.toolCallId === 'string') {
      completedToolCalls.set(message.toolCallId, message.isError !== true);
    }
  }

  const entries: ITimelineEntry[] = [];
  const entryLineOffsets: number[] = [];
  for (const line of branch) {
    let mapped: ITimelineEntry[] = [];
    if (line.record.type === 'message') {
      mapped = mapMessage(line, completedToolCalls);
    } else if (line.record.type === 'compaction') {
      mapped = [{
        id: `${line.record.id ?? `line-${line.lineIndex}`}-compaction`,
        type: 'context-compacted',
        timestamp: timestampMs(line.record.timestamp),
        beforeTokens: typeof line.record.tokensBefore === 'number' ? line.record.tokensBefore : undefined,
      } satisfies ITimelineContextCompacted];
    } else if (line.record.type === 'branch_summary' && typeof line.record.summary === 'string') {
      mapped = [{
        id: `${line.record.id ?? `line-${line.lineIndex}`}-branch-summary`,
        type: 'assistant-message',
        timestamp: timestampMs(line.record.timestamp),
        markdown: line.record.summary,
        model: 'branch-summary',
      } satisfies ITimelineAssistantMessage];
    }
    entries.push(...mapped);
    entryLineOffsets.push(...mapped.map(() => line.offset));
  }

  return {
    entries,
    entryLineOffsets,
    lastOffset: Buffer.byteLength(content, 'utf-8'),
    totalLines: rawLines.filter((line) => line.trim()).length,
    errorCount,
    sessionId: header?.id ?? null,
    cwd: header?.cwd ?? null,
  };
};

export const readTailPiEntries = async (
  filePath: string,
  maxEntries: number,
): Promise<IChunkReadResult> => {
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = parsePiContent(content);
  const startIndex = Math.max(0, parsed.entries.length - maxEntries);
  const startByteOffset = parsed.entryLineOffsets[startIndex] ?? 0;
  return {
    entries: parsed.entries.slice(startIndex),
    startByteOffset,
    fileSize: parsed.lastOffset,
    hasMore: startIndex > 0,
    errorCount: parsed.errorCount,
  };
};

export const readPiEntriesBefore = async (
  filePath: string,
  beforeOffset: number,
  maxEntries: number,
): Promise<IChunkReadResult> => {
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = parsePiContent(content);
  const boundary = parsed.entryLineOffsets.findIndex((offset) => offset >= beforeOffset);
  const boundaryIndex = boundary === -1 ? parsed.entries.length : boundary;
  const startIndex = Math.max(0, boundaryIndex - maxEntries);
  return {
    entries: parsed.entries.slice(startIndex),
    startByteOffset: parsed.entryLineOffsets[startIndex] ?? 0,
    fileSize: parsed.lastOffset,
    hasMore: startIndex > 0,
    errorCount: parsed.errorCount,
  };
};
