import { memo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OpenAIIcon from '@/components/icons/openai-icon';
import PiIcon from '@/components/icons/pi-icon';
import { cn } from '@/lib/utils';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';

interface ICodexSessionListViewProps {
  provider?: 'codex' | 'pi';
  sessions: ICodexSessionEntry[];
  isLoading: boolean;
  error: string | null;
  resumingSessionId: string | null;
  onSelectSession: (session: ICodexSessionEntry) => void;
  onRefresh: () => Promise<void>;
  onNewSession?: () => void;
  className?: string;
}

const formatRelativeTime = (
  ms: number,
  tTime: ReturnType<typeof useTranslations>,
): string => {
  const now = dayjs();
  const target = dayjs(ms);
  const diffMinutes = now.diff(target, 'minute');

  if (diffMinutes < 1) return tTime('justNow');
  if (diffMinutes < 60) return tTime('minutesAgo', { count: diffMinutes });

  const diffHours = now.diff(target, 'hour');
  if (diffHours < 24) return tTime('hoursAgo', { count: diffHours });

  const diffDays = now.diff(target, 'day');
  if (diffDays === 1) return tTime('yesterday');
  if (diffDays < 7) return tTime('daysAgo', { count: diffDays });

  const diffWeeks = now.diff(target, 'week');
  if (diffWeeks < 4) return tTime('weeksAgo', { count: diffWeeks });

  const diffMonths = now.diff(target, 'month');
  if (diffMonths < 12) return tTime('monthsAgo', { count: diffMonths });

  return tTime('yearsAgo', { count: now.diff(target, 'year') });
};

interface ICodexSessionItemProps {
  session: ICodexSessionEntry;
  isResuming: boolean;
  isDisabled: boolean;
  onSelect: (session: ICodexSessionEntry) => void;
  noMessageLabel: string;
  tSession: ReturnType<typeof useTranslations>;
  tTime: ReturnType<typeof useTranslations>;
}

const CodexSessionItem = memo(({
  session,
  isResuming,
  isDisabled,
  onSelect,
  noMessageLabel,
  tSession,
  tTime,
}: ICodexSessionItemProps) => {
  const activityAt = session.lastActivityAt || session.startedAt;
  const absoluteTime = dayjs(activityAt).format('MM/DD HH:mm');
  const relative = formatRelativeTime(activityAt, tTime);
  const message = session.firstUserMessage?.trim() || noMessageLabel;
  const turnLabel = tSession('turnCount', { count: session.turnCount });
  const ariaLabel = [
    message,
    absoluteTime,
    relative,
    turnLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={() => onSelect(session)}
      className={cn(
        'w-full cursor-pointer border-b border-border/50 py-3 pl-1 pr-4 text-left transition-colors',
        'hover:bg-claude-active/5 focus-visible:bg-claude-active/5 focus:outline-none',
        isResuming && 'bg-claude-active/5',
        isDisabled && !isResuming && 'pointer-events-none opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          {isResuming ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-claude-active" />
          ) : (
            <span className="inline-block h-1.5 w-1.5 shrink-0" />
          )}
          <span className="text-muted-foreground">
            {absoluteTime}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {relative}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-[12px]">
        <span className="min-w-0 truncate text-left text-sm font-medium">
          {message}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {turnLabel}
        </span>
      </div>
    </button>
  );
});

CodexSessionItem.displayName = 'CodexSessionItem';

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
          <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
    ))}
  </div>
);

const CodexSessionListView = ({
  provider = 'codex',
  sessions,
  isLoading,
  error,
  resumingSessionId,
  onSelectSession,
  onRefresh,
  onNewSession,
  className,
}: ICodexSessionListViewProps) => {
  const t = useTranslations('terminal');
  const tSession = useTranslations('session');
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    await onRefresh();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [onRefresh]);

  const isResumeInProgress = !!resumingSessionId;
  const isPi = provider === 'pi';

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">
          {isPi ? 'Pi sessions' : t('codexSessionList')}
          {sessions.length > 0 && `(${sessions.length})`}
        </span>
        {onNewSession && (
          <Button variant="outline" size="sm" onClick={onNewSession}>
            <Plus size={12} />
            {t('newConversation')}
          </Button>
        )}
      </div>

      {isLoading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={24} className="text-ui-red" />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            {t('codexRetry')}
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
          {isPi ? <PiIcon size={40} className="text-muted-foreground/50" /> : <OpenAIIcon size={40} className="text-muted-foreground/50" />}
          <p className="text-sm text-muted-foreground">{isPi ? 'No Pi sessions found' : t('codexSessionsEmpty')}</p>
          {onNewSession && (
            <Button size="sm" onClick={onNewSession}>
              <Plus className="h-3.5 w-3.5" />
              {isPi ? 'Pi' : t('codexNewConversation')}
            </Button>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {sessions.map((session) => (
            <CodexSessionItem
              key={session.jsonlPath}
              session={session}
              isResuming={session.sessionId === resumingSessionId}
              isDisabled={isResumeInProgress}
              onSelect={onSelectSession}
              noMessageLabel={tSession('noMessage')}
              tSession={tSession}
              tTime={tSession}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CodexSessionListView;
