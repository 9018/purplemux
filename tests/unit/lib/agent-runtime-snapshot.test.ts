import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readClaudeRuntimeSnapshot } from '@/lib/providers/claude/runtime-snapshot';
import { readCodexRuntimeSnapshot } from '@/lib/providers/codex/runtime-snapshot';
import { readPiRuntimeSnapshot } from '@/lib/providers/pi/runtime-snapshot';

const writeJsonl = async (lines: unknown[]): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-runtime-snapshot-'));
  const filePath = path.join(dir, 'session.jsonl');
  await fs.writeFile(filePath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf-8');
  return filePath;
};

describe('agent runtime snapshots', () => {
  it('keeps Claude JSONL snapshot behavior behind the Claude provider', async () => {
    const jsonlPath = await writeJsonl([
      {
        timestamp: '2026-05-02T07:37:01.000Z',
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Claude finished the task.' }],
          stop_reason: 'end_turn',
        },
      },
    ]);

    const snapshot = await readClaudeRuntimeSnapshot(jsonlPath);

    expect(snapshot).toMatchObject({
      idle: true,
      stale: false,
      lastAssistantSnippet: 'Claude finished the task.',
      currentAction: { toolName: null, summary: 'Claude finished the task.' },
    });
  });

  it('reads Codex assistant snippets from event_msg agent_message records', async () => {
    const jsonlPath = await writeJsonl([
      {
        timestamp: '2026-05-02T07:37:01.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'implement it' },
      },
      {
        timestamp: '2026-05-02T07:37:02.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Codex finished the task.' },
      },
      {
        timestamp: '2026-05-02T07:37:03.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete' },
      },
    ]);

    const snapshot = await readCodexRuntimeSnapshot(jsonlPath);

    expect(snapshot).toMatchObject({
      idle: true,
      stale: false,
      lastAssistantSnippet: 'Codex finished the task.',
      currentAction: null,
      reset: false,
    });
  });

  it('reports Codex in-flight command actions from unmatched exec begin events', async () => {
    const jsonlPath = await writeJsonl([
      {
        timestamp: '2026-05-02T07:38:01.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'run tests' },
      },
      {
        timestamp: '2026-05-02T07:38:02.000Z',
        type: 'event_msg',
        payload: { type: 'exec_command_begin', call_id: 'exec-1', command: 'pnpm test' },
      },
    ]);

    const snapshot = await readCodexRuntimeSnapshot(jsonlPath);

    expect(snapshot.idle).toBe(false);
    expect(snapshot.currentAction).toEqual({ toolName: 'Bash', summary: '$ pnpm test' });
  });

  it('marks Codex snapshots as reset when a user message follows the last assistant output', async () => {
    const jsonlPath = await writeJsonl([
      {
        timestamp: '2026-05-02T07:39:01.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Previous answer.' },
      },
      {
        timestamp: '2026-05-02T07:39:02.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'next task' },
      },
    ]);

    const snapshot = await readCodexRuntimeSnapshot(jsonlPath);

    expect(snapshot.reset).toBe(true);
    expect(snapshot.lastAssistantSnippet).toBe('Previous answer.');
    expect(snapshot.currentAction).toBeNull();
  });

  it('reports Pi in-flight tool calls until their tool result is recorded', async () => {
    const jsonlPath = await writeJsonl([
      { type: 'session', version: 3, id: 'pi-session', timestamp: '2026-07-29T10:00:00.000Z', cwd: '/tmp/project' },
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-29T10:00:01.000Z', message: { role: 'user', content: 'run tests' } },
      {
        type: 'message', id: 'a1', parentId: 'u1', timestamp: '2026-07-29T10:00:02.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Running the test suite.' },
            { type: 'toolCall', id: 'tool-1', name: 'bash', arguments: { command: 'pnpm test' } },
          ],
          stopReason: 'toolUse',
        },
      },
    ]);

    const snapshot = await readPiRuntimeSnapshot(jsonlPath);

    expect(snapshot).toMatchObject({
      idle: false,
      stale: false,
      lastAssistantSnippet: 'Running the test suite.',
      currentAction: { toolName: 'Bash', summary: '$ pnpm test' },
      reset: false,
    });
  });

  it('marks Pi idle after a completed tool result and final assistant response', async () => {
    const jsonlPath = await writeJsonl([
      { type: 'session', version: 3, id: 'pi-session', timestamp: '2026-07-29T10:01:00.000Z', cwd: '/tmp/project' },
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-29T10:01:01.000Z', message: { role: 'user', content: 'run tests' } },
      { type: 'message', id: 'a1', parentId: 'u1', timestamp: '2026-07-29T10:01:02.000Z', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'tool-1', name: 'bash', arguments: { command: 'pnpm test' } }], stopReason: 'toolUse' } },
      { type: 'message', id: 'r1', parentId: 'a1', timestamp: '2026-07-29T10:01:03.000Z', message: { role: 'toolResult', toolCallId: 'tool-1', toolName: 'bash', content: [{ type: 'text', text: 'passed' }], isError: false } },
      { type: 'message', id: 'a2', parentId: 'r1', timestamp: '2026-07-29T10:01:04.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'All tests passed.' }], stopReason: 'stop' } },
    ]);

    const snapshot = await readPiRuntimeSnapshot(jsonlPath);

    expect(snapshot).toMatchObject({
      idle: true,
      stale: false,
      lastAssistantSnippet: 'All tests passed.',
      currentAction: null,
      interrupted: false,
    });
  });
});
