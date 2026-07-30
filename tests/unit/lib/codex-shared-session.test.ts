import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findSharedCodexSession } from '@/lib/providers/codex/shared-session';
import { createCodexInputLease } from '@/lib/providers/codex/input-lease';

describe('shared Codex session binding', () => {
  it('finds GPTWork binding from a workspace ancestor and validates cwd', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-shared-codex-'));
    const cwd = path.join(root, 'repo');
    await fs.mkdir(path.join(cwd, 'src'), { recursive: true });
    const manifestDir = path.join(root, '.gptwork', 'codex-sessions', 'manifests');
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(path.join(manifestDir, 'control-1.json'), JSON.stringify({
      control_session_id: 'control-1',
      native_session_id: 'native-1',
      native_session_path: '/home/test/.codex/sessions/2026/07/31/rollout-native-1.jsonl',
      cwd,
      tmux_socket: 'purple',
      tmux_session_name: 'pt-gptwork-control-1',
      status: 'running',
    }));

    try {
      await expect(findSharedCodexSession(cwd, { manifestsRoot: path.join(root, '.gptwork', 'codex-sessions', 'manifests') }))
        .resolves.toMatchObject({
          native_session_id: 'native-1',
          native_session_path: '/home/test/.codex/sessions/2026/07/31/rollout-native-1.jsonl',
          tmux_session_name: 'pt-gptwork-control-1',
        });
      await expect(findSharedCodexSession(path.join(root, 'other'), { manifestsRoot: manifestDir }))
        .resolves.toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('serializes GPTWork and purplemux writers through the same native session lease', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-lease-'));
    const first = createCodexInputLease({ root, owner: 'gptwork', ttlMs: 5_000 });
    const second = createCodexInputLease({ root, owner: 'purplemux', ttlMs: 5_000 });

    try {
      const held = await first.acquire('native-shared-1');
      expect(held.acquired).toBe(true);
      const blocked = await second.acquire('native-shared-1');
      expect(blocked.acquired).toBe(false);
      expect(blocked.reason).toBe('busy');
      await expect(second.withLease('native-shared-1', async () => 'not reached'))
        .rejects.toMatchObject({ code: 'codex_session_input_busy' });
      await expect(first.release('native-shared-1', held.token!)).resolves.toBe(true);
      await expect(second.withLease('native-shared-1', async () => 'written')).resolves.toBe('written');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
