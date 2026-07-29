import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  parsePiContent,
  readPiEntriesBefore,
  readTailPiEntries,
} from '@/lib/session-parser-pi';

const fixturePath = path.join(process.cwd(), 'tests/fixtures/pi-session-branched.jsonl');

describe('parsePiContent', () => {
  it('renders only the active Pi session branch', async () => {
    const content = await fs.readFile(fixturePath, 'utf-8');
    const parsed = parsePiContent(content);

    expect(parsed.sessionId).toBe('019faddc-8913-7d86-bfae-59bcfa7fb535');
    expect(parsed.cwd).toBe('/tmp/pi-project');
    expect(parsed.entries.map((entry) => entry.type)).toEqual([
      'user-message',
      'assistant-message',
      'user-message',
      'thinking',
      'assistant-message',
      'tool-call',
      'tool-result',
      'context-compacted',
    ]);
    expect(JSON.stringify(parsed.entries)).not.toContain('Do not render me');
    expect(parsed.entries.find((entry) => entry.type === 'tool-call')).toMatchObject({
      toolUseId: 'tool-1',
      toolName: 'bash',
      summary: '$ pwd',
      status: 'success',
    });
  });

  it('ignores an incomplete trailing JSONL record', async () => {
    const content = await fs.readFile(fixturePath, 'utf-8');
    const parsed = parsePiContent(`${content}{"type":"message"`);

    expect(parsed.errorCount).toBe(1);
    expect(parsed.entries.at(-1)?.type).toBe('context-compacted');
  });

  it('maps visible custom and bash execution messages but hides non-display custom messages', () => {
    const lines = [
      { type: 'session', version: 3, id: '019faddc-8913-7d86-bfae-59bcfa7fb535', timestamp: '2026-07-29T12:00:00.000Z', cwd: '/tmp/pi-project' },
      { type: 'message', id: 'c1', parentId: null, timestamp: '2026-07-29T12:00:01.000Z', message: { role: 'custom', customType: 'visible', content: 'Visible note', display: true, timestamp: 1 } },
      { type: 'message', id: 'c2', parentId: 'c1', timestamp: '2026-07-29T12:00:02.000Z', message: { role: 'custom', customType: 'hidden', content: 'Secret note', display: false, timestamp: 2 } },
      { type: 'message', id: 'b1', parentId: 'c2', timestamp: '2026-07-29T12:00:03.000Z', message: { role: 'bashExecution', command: 'ls', output: 'a\nb', exitCode: 0, cancelled: false, truncated: false, timestamp: 3 } },
    ];
    const parsed = parsePiContent(lines.map((line) => JSON.stringify(line)).join('\n') + '\n');

    expect(JSON.stringify(parsed.entries)).toContain('Visible note');
    expect(JSON.stringify(parsed.entries)).not.toContain('Secret note');
    expect(parsed.entries.at(-1)).toMatchObject({ type: 'tool-result', isError: false, summary: '2 lines' });
  });

  it('supports tail and older-entry pagination', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-pi-tail-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      await fs.copyFile(fixturePath, jsonlPath);
      const initial = await readTailPiEntries(jsonlPath, 3);
      expect(initial.entries).toHaveLength(3);
      expect(initial.hasMore).toBe(true);

      const expanded = await readPiEntriesBefore(jsonlPath, initial.startByteOffset, 2);
      expect(expanded.entries.length).toBeGreaterThan(initial.entries.length);
      expect(expanded.entries.at(-1)?.type).toBe('context-compacted');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
