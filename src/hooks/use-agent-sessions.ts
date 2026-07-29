import { useCallback, useMemo } from 'react';
import useSessionList from '@/hooks/use-session-list';
import { useCodexSessions } from '@/hooks/use-codex-sessions';
import { usePiSessions } from '@/hooks/use-pi-sessions';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';
import type { IPiSessionEntry } from '@/lib/pi-session-list';
import type { ISessionMeta } from '@/types/timeline';

export type TAgentSessionProvider = 'claude' | 'codex' | 'pi';

export interface IAgentSessionEntry {
  provider: TAgentSessionProvider;
  sessionId: string;
  key: string;
  startedAt: string;
  lastActivityAt: string;
  firstMessage: string | null;
  turnCount: number;
}

interface IUseAgentSessionsOptions {
  tmuxSession: string;
  enabled: boolean;
  cwd?: string;
}

interface IUseAgentSessionsReturn {
  sessions: IAgentSessionEntry[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const fromClaudeSession = (session: ISessionMeta): IAgentSessionEntry => ({
  provider: 'claude',
  sessionId: session.sessionId,
  key: `claude:${session.sessionId}`,
  startedAt: session.startedAt,
  lastActivityAt: session.lastActivityAt,
  firstMessage: session.firstMessage || null,
  turnCount: session.turnCount,
});

const fromCodexSession = (session: ICodexSessionEntry): IAgentSessionEntry => ({
  provider: 'codex',
  sessionId: session.sessionId,
  key: `codex:${session.jsonlPath}`,
  startedAt: new Date(session.startedAt).toISOString(),
  lastActivityAt: new Date(session.lastActivityAt || session.startedAt).toISOString(),
  firstMessage: session.firstUserMessage,
  turnCount: session.turnCount,
});

const fromPiSession = (session: IPiSessionEntry): IAgentSessionEntry => ({
  provider: 'pi',
  sessionId: session.sessionId,
  key: `pi:${session.jsonlPath}`,
  startedAt: new Date(session.startedAt).toISOString(),
  lastActivityAt: new Date(session.lastActivityAt || session.startedAt).toISOString(),
  firstMessage: session.firstUserMessage,
  turnCount: session.turnCount,
});

const useAgentSessions = ({
  tmuxSession,
  enabled,
  cwd,
}: IUseAgentSessionsOptions): IUseAgentSessionsReturn => {
  const claude = useSessionList({
    tmuxSession,
    enabled,
    cwd,
  });

  const codex = useCodexSessions(cwd, enabled && !!cwd);
  const pi = usePiSessions(cwd, enabled && !!cwd);

  const sessions = useMemo(() => {
    const merged = [
      ...claude.sessions.map(fromClaudeSession),
      ...codex.sessions.map(fromCodexSession),
      ...pi.sessions.map(fromPiSession),
    ];

    merged.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );

    return merged;
  }, [claude.sessions, codex.sessions, pi.sessions]);

  const refetch = useCallback(async () => {
    await Promise.all([
      claude.refetch(),
      codex.refresh(),
      pi.refresh(),
    ]);
  }, [claude, codex, pi]);

  return {
    sessions,
    isLoading: claude.isLoading || codex.isLoading || pi.isLoading,
    isLoadingMore: claude.isLoadingMore,
    hasMore: claude.hasMore,
    error: claude.error || (codex.error ? 'codex' : pi.error ? 'pi' : null),
    refetch,
    loadMore: claude.loadMore,
  };
};

export default useAgentSessions;
