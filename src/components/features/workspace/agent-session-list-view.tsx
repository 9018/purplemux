import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import PiIcon from '@/components/icons/pi-icon';
import { cn } from '@/lib/utils';
import type { IAgentSessionEntry } from '@/hooks/use-agent-sessions';

type TSessionFilter = 'all' | 'claude' | 'codex' | 'pi';

interface IAgentSessionListViewProps {
  sessions: IAgentSessionEntry[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  resumingSessionKey: string | null;
  onSelectSession: (session: IAgentSessionEntry) => void;
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  onNewSession?: () => void;
  onNewClaudeSession?: () => void;
  onNewCodexSession?: () => void;
  onNewPiSession?: () => void;
}

const formatRelativeTime = (
  dateStr: string,
  t: ReturnType<typeof useTranslations>,
): string => {
  const now = dayjs();
  const target = dayjs(dateStr);
  const diffMinutes = now.diff(target, 'minute');

  if (diffMinutes < 1) return t('justNow');
  if (diffMinutes < 60) return t('minutesAgo', { count: diffMinutes });

  const diffHours = now.diff(target, 'hour');
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });

  const diffDays = now.diff(target, 'day');
  if (diffDays === 1) return t('yesterday');
  if (diffDays < 7) return t('daysAgo', { count: diffDays });

  const diffWeeks = now.diff(target, 'week');
  if (diffWeeks < 4) return t('weeksAgo', { count: diffWeeks });

  const diffMonths = now.diff(target, 'month');
  if (diffMonths < 12) return t('monthsAgo', { count: diffMonths });

  return t('yearsAgo', { count: now.diff(target, 'year') });
};

const handleArrowNavigation = (e: React.KeyboardEvent<HTMLButtonElement>) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
    next?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = e.currentTarget.previousElementSibling as HTMLElement | null;
    prev?.focus();
  }
};

const SessionListSkeleton = () => (
  <div className="flex flex-col">
    {[1, 2, 3].map((i) => (
      <div key={i} className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-2 flex items-center justify-between pl-[18px]">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-8 animate-pulse rounded bg-muted" />
        </div>
      </div>
    ))}
  </div>
);

const AgentIcon = ({ provider }: { provider: IAgentSessionEntry['provider'] }) =>
  provider === 'codex'
    ? <OpenAIIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    : provider === 'pi'
      ? <PiIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      : <ClaudeCodeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;

interface IAgentSessionItemProps {
  session: IAgentSessionEntry;
  isResuming: boolean;
  isDisabled: boolean;
  onSelect: (session: IAgentSessionEntry) => void;
  noMessageLabel: string;
  tSession: ReturnType<typeof useTranslations>;
}

const AgentSessionItem = memo(({
  session,
  isResuming,
  isDisabled,
  onSelect,
  noMessageLabel,
  tSession,
}: IAgentSessionItemProps) => {
  const absoluteTime = dayjs(session.lastActivityAt).format('MM/DD HH:mm');
  const relativeTime = formatRelativeTime(session.lastActivityAt, tSession);
  const displayMessage = session.firstMessage?.trim() || noMessageLabel;
  const providerLabel = session.provider === 'codex' ? 'Codex' : session.provider === 'pi' ? 'Pi' : 'Claude';

  return (
    <button
      type="button"
      className={cn(
        'w-full cursor-pointer border-b border-border/50 py-3 pl-3 pr-4 text-left transition-colors',
        'hover:bg-claude-active/5 focus-visible:bg-claude-active/5 focus:outline-none',
        isDisabled && !isResuming && 'pointer-events-none opacity-50',
        isResuming && 'bg-claude-active/5',
      )}
      onClick={() => onSelect(session)}
      onKeyDown={handleArrowNavigation}
      disabled={isDisabled}
      aria-label={`${providerLabel}: ${displayMessage}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          {isResuming ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-claude-active" />
          ) : (
            <AgentIcon provider={session.provider} />
          )}
          <span className="text-muted-foreground">
            {absoluteTime}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {relativeTime}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-5">
        <span className="min-w-0 truncate text-left text-sm font-medium">
          {displayMessage}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {tSession('turnCount', { count: session.turnCount })}
        </span>
      </div>
    </button>
  );
});

AgentSessionItem.displayName = 'AgentSessionItem';

const AgentSessionListView = ({
  sessions,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  resumingSessionKey,
  onSelectSession,
  onRefresh,
  onLoadMore,
  onNewSession,
  onNewClaudeSession,
  onNewCodexSession,
  onNewPiSession,
}: IAgentSessionListViewProps) => {
  const t = useTranslations('terminal');
  const tSession = useTranslations('session');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<TSessionFilter>('all');

  const handleRefresh = useCallback(async () => {
    await onRefresh();
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [onRefresh]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const isResumeInProgress = !!resumingSessionKey;
  const displayError = error === 'codex'
    ? t('codexSessionsLoadFailed')
    : error === 'pi'
      ? 'Failed to load Pi sessions'
      : error;
  const filteredSessions = useMemo(
    () => sessions.filter((session) => filter === 'all' || session.provider === filter),
    [filter, sessions],
  );
  const filterItems: Array<{ key: TSessionFilter; label: string }> = [
    { key: 'all', label: t('sessions') },
    { key: 'claude', label: 'Claude' },
    { key: 'codex', label: 'Codex' },
    { key: 'pi', label: 'Pi' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium">
            {t('sessions')}
            {sessions.length > 0 &&
              `(${sessions.length}${hasMore ? '+' : ''})`}
          </span>
          <div className="flex h-7 items-center rounded-md border border-border p-0.5">
            {filterItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={cn(
                  'h-6 rounded px-2 text-xs text-muted-foreground transition-colors',
                  filter === item.key && 'bg-accent text-foreground',
                )}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onNewClaudeSession && (
            <Button variant="outline" size="sm" onClick={onNewClaudeSession}>
              <Plus size={12} />
              Claude
            </Button>
          )}
          {onNewCodexSession && (
            <Button variant="outline" size="sm" onClick={onNewCodexSession}>
              <Plus size={12} />
              Codex
            </Button>
          )}
          {onNewPiSession && (
            <Button variant="outline" size="sm" onClick={onNewPiSession}>
              <Plus size={12} />
              Pi
            </Button>
          )}
          {onNewSession && !onNewClaudeSession && !onNewCodexSession && !onNewPiSession && (
            <Button variant="outline" size="sm" onClick={onNewSession}>
              <Plus size={12} />
              {t('newConversation')}
            </Button>
          )}
        </div>
      </div>

      {isLoading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : displayError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">{displayError}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            {t('retryLoad')}
          </Button>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          {filteredSessions.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {tSession('empty.noSession')}
            </div>
          ) : filteredSessions.map((session) => (
            <AgentSessionItem
              key={session.key}
              session={session}
              isResuming={session.key === resumingSessionKey}
              isDisabled={isResumeInProgress}
              onSelect={onSelectSession}
              noMessageLabel={tSession('noMessage')}
              tSession={tSession}
            />
          ))}
          {isLoadingMore && (
            <div className="flex items-center justify-center py-3">
              <Spinner size={14} className="text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentSessionListView;
