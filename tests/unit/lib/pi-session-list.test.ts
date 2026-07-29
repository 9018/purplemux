import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { listPiSessions } from '@/lib/pi-session-list';
import { isAllowedJsonlPath, isPiJsonlPath } from '@/lib/path-validation';

const writeSession = async (
  filePath: string,
  sessionId: string,
  cwd: string,
  startedAt: string,
  messages: unknown[],
): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lines = [
    { type: 'session', version: 3, id: sessionId, timestamp: startedAt, cwd },
    ...messages,
  ];
  await fs.writeFile(filePath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
};

describe('listPiSessions', () => {
  it('filters by cwd, extracts active-branch metadata, and sorts by activity', async () => {
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-pi-list-'));
    const cwd = '/tmp/project-a';
    const olderPath = path.join(sessionsRoot, '--tmp-project-a--', 'older.jsonl');
    const latestPath = path.join(sessionsRoot, '--tmp-project-a--', 'latest.jsonl');
    const otherPath = path.join(sessionsRoot, '--tmp-project-b--', 'other.jsonl');

    await writeSession(olderPath, '019faddc-8913-7d86-bfae-59bcfa7fb531', cwd, '2026-07-29T08:00:00.000Z', [
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-29T08:00:01.000Z', message: { role: 'user', content: 'Older prompt' } },
    ]);
    await writeSession(latestPath, '019faddc-8913-7d86-bfae-59bcfa7fb532', cwd, '2026-07-29T09:00:00.000Z', [
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-29T09:00:01.000Z', message: { role: 'user', content: 'First active prompt' } },
      { type: 'message', id: 'a1', parentId: 'u1', timestamp: '2026-07-29T09:00:02.000Z', message: { role: 'assistant', model: 'deepseek-v4', content: [{ type: 'text', text: 'Answer' }], usage: { totalTokens: 12 }, stopReason: 'stop' } },
      { type: 'message', id: 'abandoned', parentId: 'a1', timestamp: '2026-07-29T09:00:03.000Z', message: { role: 'user', content: 'Abandoned prompt' } },
      { type: 'message', id: 'u2', parentId: 'a1', timestamp: '2026-07-29T09:00:04.000Z', message: { role: 'user', content: 'Second active prompt' } },
    ]);
    await writeSession(otherPath, '019faddc-8913-7d86-bfae-59bcfa7fb533', '/tmp/project-b', '2026-07-29T10:00:00.000Z', []);
    await fs.utimes(olderPath, new Date('2026-07-29T08:10:00.000Z'), new Date('2026-07-29T08:10:00.000Z'));
    await fs.utimes(latestPath, new Date('2026-07-29T09:10:00.000Z'), new Date('2026-07-29T09:10:00.000Z'));

    const result = await listPiSessions({ cwd, sessionsRoot });

    expect(result.scannedFiles).toBe(3);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toMatchObject({
      provider: 'pi',
      sessionId: '019faddc-8913-7d86-bfae-59bcfa7fb532',
      jsonlPath: latestPath,
      cwd,
      model: 'deepseek-v4',
      firstUserMessage: 'First active prompt',
      turnCount: 2,
      totalTokens: 12,
    });
  });

  it('recognizes Pi JSONL paths under a configured session root', async () => {
    const oldRoot = process.env.PI_CODING_AGENT_SESSION_DIR;
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-pi-path-'));
    process.env.PI_CODING_AGENT_SESSION_DIR = sessionsRoot;
    try {
      const jsonlPath = path.join(sessionsRoot, 'project', 'session.jsonl');
      expect(isPiJsonlPath(jsonlPath)).toBe(true);
      expect(isAllowedJsonlPath(jsonlPath)).toBe(true);
      expect(isAllowedJsonlPath(path.join(sessionsRoot, '..', 'outside.jsonl'))).toBe(false);
    } finally {
      if (oldRoot === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR;
      else process.env.PI_CODING_AGENT_SESSION_DIR = oldRoot;
    }
  });
});
