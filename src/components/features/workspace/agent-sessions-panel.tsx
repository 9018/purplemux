import { useCallback, useEffect, useRef, useState } from 'react';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import useAgentSessions, { type IAgentSessionEntry } from '@/hooks/use-agent-sessions';
import AgentSessionListView from '@/components/features/workspace/agent-session-list-view';

interface IAgentSessionsPanelProps {
  sessionName: string;
  cwd?: string;
  className?: string;
  onSelectSession: (session: IAgentSessionEntry) => void | Promise<void>;
  onNewClaudeSession?: () => void;
  onNewCodexSession?: () => void;
  onNewPiSession?: () => void;
}

const AgentSessionsPanel = ({
  sessionName,
  cwd,
  className,
  onSelectSession,
  onNewClaudeSession,
  onNewCodexSession,
  onNewPiSession,
}: IAgentSessionsPanelProps) => {
  const [resumingSessionKey, setResumingSessionKey] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const {
    sessions,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    refetch,
    loadMore,
  } = useAgentSessions({
    tmuxSession: sessionName,
    enabled: !!sessionName,
    cwd,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSelectSession = useCallback((session: IAgentSessionEntry) => {
    if (resumingSessionKey) return;
    setResumingSessionKey(session.key);
    void Promise.resolve(onSelectSession(session)).finally(() => {
      if (!mountedRef.current) return;
      setResumingSessionKey((current) => (current === session.key ? null : current));
    });
  }, [onSelectSession, resumingSessionKey]);

  if (isLoading && sessions.length === 0) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center bg-card', className)}>
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('h-full w-full bg-card', className)}>
      <AgentSessionListView
        sessions={sessions}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        error={error}
        resumingSessionKey={resumingSessionKey}
        onSelectSession={handleSelectSession}
        onRefresh={refetch}
        onLoadMore={loadMore}
        onNewClaudeSession={onNewClaudeSession}
        onNewCodexSession={onNewCodexSession}
        onNewPiSession={onNewPiSession}
      />
    </div>
  );
};

export default AgentSessionsPanel;
