import { summarizeToolCall } from '@/lib/session-parser';
import type { IAgentHookTranslation } from '@/lib/providers/types';
import type { TToolName } from '@/types/timeline';

const SUMMARY_LIMIT = 80;

export interface IPiHookPayload {
  event?: unknown;
  sessionId?: unknown;
  jsonlPath?: unknown;
  cwd?: unknown;
  reason?: unknown;
  text?: unknown;
  name?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  args?: unknown;
  isError?: unknown;
}

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const compact = (value: string, limit = SUMMARY_LIMIT): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
};

const summarizeTool = (toolName: string, rawArgs: unknown): string => {
  const args = typeof rawArgs === 'object' && rawArgs !== null
    ? rawArgs as Record<string, unknown>
    : {};
  const safeArgs: Record<string, unknown> = {};
  for (const key of ['command', 'path', 'file_path', 'query', 'pattern']) {
    if (typeof args[key] === 'string') safeArgs[key] = args[key];
  }
  const normalizedName = toolName === 'bash' ? 'Bash' : toolName;
  return compact(summarizeToolCall(normalizedName as TToolName, safeArgs), 200);
};

export const translatePiHookEvent = (payload: IPiHookPayload): IAgentHookTranslation => {
  const eventName = stringValue(payload.event);
  if (!eventName) return {};
  const sessionId = stringValue(payload.sessionId);
  const jsonlPath = stringValue(payload.jsonlPath);
  const cwd = stringValue(payload.cwd);
  const meta: NonNullable<IAgentHookTranslation['meta']> = {};
  if (sessionId) meta.sessionId = sessionId;
  if (jsonlPath) meta.jsonlPath = jsonlPath;

  if (eventName === 'session_start') {
    const isNew = payload.reason === 'new';
    if (isNew) meta.clearMessages = true;
    return {
      meta,
      event: { kind: 'session-start' },
      sessionInfo: {
        status: 'running',
        sessionId,
        jsonlPath,
        pid: null,
        startedAt: null,
        cwd,
      },
      clearSession: isNew,
    };
  }
  if (eventName === 'session_info_changed') {
    const name = stringValue(payload.name);
    if (name) meta.agentSummary = compact(name);
    return Object.keys(meta).length > 0 ? { meta } : {};
  }
  if (eventName === 'input') {
    const text = stringValue(payload.text);
    if (text) {
      meta.lastUserMessage = text;
      meta.agentSummary = compact(text);
    }
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'prompt-submit' } };
  }
  if (eventName === 'agent_start') {
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'prompt-submit' } };
  }
  if (eventName === 'tool_execution_start') {
    const toolName = stringValue(payload.toolName) ?? 'Tool';
    return {
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
      event: { kind: 'summary-update', summary: summarizeTool(toolName, payload.args) },
    };
  }
  if (eventName === 'tool_execution_end') {
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'summary-update', summary: null } };
  }
  if (eventName === 'agent_settled') {
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'stop' } };
  }
  if (eventName === 'session_before_compact') {
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'pre-compact' } };
  }
  if (eventName === 'session_compact') {
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'post-compact' } };
  }
  if (eventName === 'session_shutdown') {
    return { ...(Object.keys(meta).length > 0 ? { meta } : {}), event: { kind: 'interrupt' } };
  }
  return {};
};

/** Parse the session record from a jsonl file to obtain its sessionId. */
export const readHookSessionMeta = async (jsonlPath: string): Promise<{ sessionId: string; jsonlPath: string } | null> => {
  try {
    const { createReadStream } = await import('node:fs');
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }), crlfDelay: Infinity });
    let scanned = 0;
    try {
      for await (const line of rl) {
        if (++scanned > 40) break;
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { type?: string; id?: string };
          if (parsed.type === 'session' && typeof parsed.id === 'string' && parsed.id) {
            return { sessionId: parsed.id, jsonlPath };
          }
        } catch {
          // skip malformed lines
        }
      }
    } finally {
      rl.close();
    }
    return null;
  } catch {
    return null;
  }
};

export const processHookSessionSwitch = async (targetFile: string): Promise<{ sessionId: string; jsonlPath: string } | null> => {
  return readHookSessionMeta(targetFile);
};

