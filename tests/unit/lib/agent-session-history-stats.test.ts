import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readClaudeSessionHistoryStats } from '@/lib/providers/claude/session-history-stats';
import { readCodexSessionHistoryStats } from '@/lib/providers/codex/session-history-stats';
import { readPiSessionHistoryStats } from '@/lib/providers/pi/session-history-stats';

const writeJsonl = async (lines: unknown[]): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-history-stats-'));
  const filePath = path.join(dir, 'session.jsonl');
  await fs.writeFile(filePath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf-8');
  return filePath;
};

describe('agent session history stats', () => {
  it('preserves Claude history stats parsing', async () => {
    const jsonlPath = await writeJsonl([
      {
        timestamp: '2026-05-02T07:37:01.000Z',
        type: 'user',
        message: { content: [{ type: 'text', text: 'Please edit a file' }] },
      },
      {
        timestamp: '2026-05-02T07:37:02.000Z',
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Edit', input: { file_path: '/workspace/app.ts', old_string: 'a', new_string: 'b' } },
            { type: 'text', text: 'Updated the file.' },
          ],
        },
      },
      {
        timestamp: '2026-05-02T07:37:03.000Z',
        type: 'system',
        subtype: 'turn_duration',
        durationMs: 2000,
      },
    ]);

    const stats = await readClaudeSessionHistoryStats(jsonlPath);

    expect(stats).toMatchObject({
      lastUserText: 'Please edit a file',
      lastAssistantText: 'Updated the file.',
      firstUserTs: Date.parse('2026-05-02T07:37:01.000Z'),
      lastAssistantTs: Date.parse('2026-05-02T07:37:02.000Z'),
      turnDurationMs: 2000,
      toolUsage: { Edit: 1 },
      touchedFiles: ['/workspace/app.ts'],
    });
  });

  it('extracts Codex prompt, result, tools, and touched files', async () => {
    const jsonlPath = await writeJsonl([
      {
        timestamp: '2026-05-02T07:38:01.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Implement Codex stats' },
      },
      {
        timestamp: '2026-05-02T07:38:02.000Z',
        type: 'event_msg',
        payload: { type: 'exec_command_begin', call_id: 'exec-1', command: 'pnpm test' },
      },
      {
        timestamp: '2026-05-02T07:38:03.000Z',
        type: 'event_msg',
        payload: { type: 'exec_command_end', call_id: 'exec-1', exit_code: 0, duration: { secs: 1, nanos: 500_000_000 } },
      },
      {
        timestamp: '2026-05-02T07:38:04.000Z',
        type: 'response_item',
        payload: {
          type: 'custom_tool_call',
          call_id: 'patch-1',
          name: 'apply_patch',
          input: '*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch\n',
        },
      },
      {
        timestamp: '2026-05-02T07:38:05.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Implemented Codex stats.' },
      },
      {
        timestamp: '2026-05-02T07:38:06.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete' },
      },
    ]);

    const stats = await readCodexSessionHistoryStats(jsonlPath);

    expect(stats).toMatchObject({
      lastUserText: 'Implement Codex stats',
      lastAssistantText: 'Implemented Codex stats.',
      firstUserTs: Date.parse('2026-05-02T07:38:01.000Z'),
      lastAssistantTs: Date.parse('2026-05-02T07:38:05.000Z'),
      turnDurationMs: 1500,
      toolUsage: { Bash: 1, apply_patch: 1 },
      touchedFiles: ['src/app.ts'],
    });
  });

  it('extracts Pi prompt, result, tools, touched files, and turn duration', async () => {
    const jsonlPath = await writeJsonl([
      { type: 'session', version: 3, id: 'pi-session', timestamp: '2026-07-29T11:00:00.000Z', cwd: '/tmp/project' },
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-29T11:00:01.000Z', message: { role: 'user', content: 'Implement Pi stats' } },
      {
        type: 'message', id: 'a1', parentId: 'u1', timestamp: '2026-07-29T11:00:02.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: '/workspace/input.ts' } },
            { type: 'toolCall', id: 'write-1', name: 'write', arguments: { file_path: '/workspace/output.ts' } },
            { type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: '/workspace/input.ts' } },
          ],
          stopReason: 'toolUse',
        },
      },
      { type: 'message', id: 'r1', parentId: 'a1', timestamp: '2026-07-29T11:00:03.000Z', message: { role: 'toolResult', toolCallId: 'edit-1', toolName: 'edit', content: [{ type: 'text', text: 'done' }], isError: false } },
      { type: 'message', id: 'a2', parentId: 'r1', timestamp: '2026-07-29T11:00:05.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Implemented Pi stats.' }], stopReason: 'stop' } },
    ]);

    const stats = await readPiSessionHistoryStats(jsonlPath);

    expect(stats).toMatchObject({
      lastUserText: 'Implement Pi stats',
      lastAssistantText: 'Implemented Pi stats.',
      firstUserTs: Date.parse('2026-07-29T11:00:01.000Z'),
      lastAssistantTs: Date.parse('2026-07-29T11:00:05.000Z'),
      turnDurationMs: 4000,
      toolUsage: { read: 1, write: 1, edit: 1 },
      touchedFiles: ['/workspace/input.ts', '/workspace/output.ts'],
    });
  });
});
