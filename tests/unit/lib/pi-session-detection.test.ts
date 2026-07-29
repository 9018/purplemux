import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  findLatestPiSessionForCwd,
  findPiSessionById,
} from '@/lib/providers/pi/session-detection';

const writeSession = async (
  jsonlPath: string,
  sessionId: string,
  cwd: string,
  timestamp: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
  await fs.writeFile(jsonlPath, JSON.stringify({
    type: 'session',
    version: 3,
    id: sessionId,
    timestamp,
    cwd,
  }) + '\n');
};

describe('Pi session detection', () => {
  it('returns the most recently modified Pi session for a cwd across nested directories', async () => {
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-pi-sessions-'));
    const projectCwd = '/tmp/project-a';
    const oldPath = path.join(sessionsRoot, '--tmp-project-a--', 'old.jsonl');
    const latestPath = path.join(sessionsRoot, '--tmp-project-a--', 'nested', 'latest.jsonl');
    const otherPath = path.join(sessionsRoot, '--tmp-project-b--', 'other.jsonl');

    await writeSession(oldPath, 'old-session', projectCwd, '2026-07-29T01:00:00.000Z');
    await writeSession(latestPath, 'latest-session', projectCwd, '2026-07-29T02:00:00.000Z');
    await writeSession(otherPath, 'other-session', '/tmp/project-b', '2026-07-29T03:00:00.000Z');
    await fs.utimes(oldPath, new Date('2026-07-29T01:00:00.000Z'), new Date('2026-07-29T01:00:00.000Z'));
    await fs.utimes(latestPath, new Date('2026-07-29T04:00:00.000Z'), new Date('2026-07-29T04:00:00.000Z'));
    await fs.utimes(otherPath, new Date('2026-07-29T05:00:00.000Z'), new Date('2026-07-29T05:00:00.000Z'));

    const session = await findLatestPiSessionForCwd(projectCwd, { sessionsRoot });

    expect(session).toMatchObject({
      sessionId: 'latest-session',
      jsonlPath: latestPath,
      cwd: projectCwd,
      startedAt: Date.parse('2026-07-29T02:00:00.000Z'),
    });
  });

  it('resolves a Pi session by header id even when the filename does not contain it', async () => {
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-pi-session-id-'));
    const jsonlPath = path.join(sessionsRoot, '--tmp-project-a--', 'timestamped-name.jsonl');
    await writeSession(jsonlPath, 'target-session', '/tmp/project-a', '2026-07-29T03:00:00.000Z');

    const session = await findPiSessionById('target-session', { sessionsRoot });

    expect(session?.sessionId).toBe('target-session');
    expect(session?.jsonlPath).toBe(jsonlPath);
  });
});
