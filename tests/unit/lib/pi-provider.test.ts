import fs from 'fs/promises';
import { describe, expect, it } from 'vitest';
import { ensurePiExtension, PI_EXTENSION_PATH } from '@/lib/providers/pi/extension';
import { piProvider } from '@/lib/providers/pi';

const SESSION_ID = '019faddc-8913-7d86-bfae-59bcfa7fb535';

describe('piProvider', () => {
  it('matches the Pi executable and node package process', () => {
    expect(piProvider.matchesProcess('pi')).toBe(true);
    expect(piProvider.matchesProcess('node', ['/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js'])).toBe(true);
    expect(piProvider.matchesProcess('node', ['/tmp/server.js'])).toBe(false);
  });

  it('builds extension-backed launch and resume commands', async () => {
    const launch = await piProvider.buildLaunchCommand({});
    const resume = await piProvider.buildResumeCommand(SESSION_ID, {});

    expect(launch).toContain("pi --extension '");
    expect(launch).toContain(PI_EXTENSION_PATH);
    expect(resume).toContain(`--session '${SESSION_ID}'`);
  });

  it('rejects invalid session ids', async () => {
    await expect(piProvider.buildResumeCommand("bad'; rm -rf /", {})).rejects.toThrow('Invalid pi session ID');
  });

  it('writes a private extension containing all lifecycle hooks', async () => {
    const extensionPath = await ensurePiExtension();
    const [source, stat] = await Promise.all([fs.readFile(extensionPath, 'utf-8'), fs.stat(extensionPath)]);

    expect(stat.mode & 0o777).toBe(0o700);
    expect(source).toContain('x-pmux-token');
    expect(source).toContain('session_start');
    expect(source).toContain('agent_settled');
    expect(source).toContain('tool_execution_start');
    expect(source).toContain('session_shutdown');
  });
});
