import { describe, expect, it } from 'vitest';
import { translatePiHookEvent } from '@/lib/providers/pi/hook-handler';

describe('translatePiHookEvent', () => {
  it('maps settled events to provider stop state', () => {
    expect(translatePiHookEvent({ event: 'agent_settled' }).event).toEqual({ kind: 'stop' });
  });

  it('publishes session metadata and a running session on start', () => {
    const translation = translatePiHookEvent({
      event: 'session_start',
      sessionId: '019faddc-8913-7d86-bfae-59bcfa7fb535',
      jsonlPath: '/tmp/pi-session.jsonl',
      cwd: '/tmp/project',
      reason: 'resume',
    });

    expect(translation.meta).toMatchObject({
      sessionId: '019faddc-8913-7d86-bfae-59bcfa7fb535',
      jsonlPath: '/tmp/pi-session.jsonl',
    });
    expect(translation.sessionInfo).toMatchObject({
      status: 'running',
      sessionId: '019faddc-8913-7d86-bfae-59bcfa7fb535',
      jsonlPath: '/tmp/pi-session.jsonl',
      cwd: '/tmp/project',
    });
    expect(translation.event).toEqual({ kind: 'session-start' });
  });

  it('captures user input and caps its summary', () => {
    const text = `  ${'prompt '.repeat(30)}\nwith whitespace  `;
    const translation = translatePiHookEvent({ event: 'input', text });

    expect(translation.meta?.lastUserMessage).toBe(text.trim());
    expect(translation.meta?.agentSummary?.length).toBeLessThanOrEqual(80);
    expect(translation.event).toEqual({ kind: 'prompt-submit' });
  });

  it('sanitizes tool summaries without serializing unrelated arguments', () => {
    const translation = translatePiHookEvent({
      event: 'tool_execution_start',
      toolName: 'bash',
      args: { command: 'pnpm test\necho ignored', secret: 'do-not-leak' },
    });

    expect(translation.event).toEqual({ kind: 'summary-update', summary: '$ pnpm test' });
    expect(JSON.stringify(translation)).not.toContain('do-not-leak');
  });

  it('maps compaction and shutdown and ignores unknown events', () => {
    expect(translatePiHookEvent({ event: 'session_before_compact' }).event).toEqual({ kind: 'pre-compact' });
    expect(translatePiHookEvent({ event: 'session_compact' }).event).toEqual({ kind: 'post-compact' });
    expect(translatePiHookEvent({ event: 'session_shutdown', reason: 'quit' }).event).toEqual({ kind: 'interrupt' });
    expect(translatePiHookEvent({ event: 'future_event' })).toEqual({});
  });
});
