import { useState, useEffect, memo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTabStore from '@/hooks/use-tab-store';
import { ackNotificationInput } from '@/hooks/use-agent-status';
import { optionNumber, stripNumberPrefix } from '@/lib/permission-prompt';

interface IPermissionPromptItemProps {
  sessionName: string;
  tabId?: string;
  silent?: boolean;
}

const fetchPermissionOptions = async (session: string): Promise<string[]> => {
  try {
    const res = await fetch(`/api/tmux/permission-options?session=${encodeURIComponent(session)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.options ?? [];
  } catch {
    return [];
  }
};

const optionInput = (label: string, optionIndex: number): string =>
  optionNumber(label) ?? String(optionIndex + 1);

const sendSelection = async (session: string, optionIndex: number, label: string): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, input: optionInput(label, optionIndex) }),
    });
    return res.ok;
  } catch {
    return false;
  }
};


const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000];

type TPhase = 'loading' | 'ready' | 'failed';

const PROMPT_MOTION = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const },
};

const PermissionPromptItem = ({ sessionName, tabId, silent = false }: IPermissionPromptItemProps) => {
  const t = useTranslations('timeline');
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [phase, setPhase] = useState<TPhase>('loading');
  const [dismissed, setDismissed] = useState(false);
  const cliState = useTabStore((s) => tabId ? s.tabs[tabId]?.cliState : undefined);
  const lastEventSeq = useTabStore((s) => tabId ? s.tabs[tabId]?.lastEvent?.seq : undefined);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dep 변경 시 상태 리셋 후 재fetch가 이 이펙트의 목적
    setLocalSelected(null);
    setOptions([]);
    setPhase('loading');
    setDismissed(false);

    const maxRetries = silent ? 0 : RETRY_DELAYS_MS.length;

    const attempt = async (retryIndex: number) => {
      const fetched = await fetchPermissionOptions(sessionName);
      if (cancelled) return;
      if (fetched.length > 0) {
        setOptions(fetched);
        setPhase('ready');
        return;
      }
      if (retryIndex >= maxRetries) {
        setPhase('failed');
        return;
      }
      timer = setTimeout(() => attempt(retryIndex + 1), RETRY_DELAYS_MS[retryIndex]);
    };

    attempt(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionName, cliState, lastEventSeq, silent]);

  const isSelectable = localSelected === null;

  const handleSelect = useCallback(
    async (idx: number) => {
      if (localSelected !== null) return;

      setLocalSelected(idx);
      const ok = await sendSelection(sessionName, idx, options[idx] ?? '');
      if (!ok) {
        setLocalSelected(null);
        toast.error(t('selectionFailed'));
        return;
      }
      if (tabId && lastEventSeq !== undefined) {
        ackNotificationInput(tabId, lastEventSeq);
      }
      setDismissed(true);
    },
    [sessionName, localSelected, options, t, tabId, lastEventSeq],
  );

  const renderContent = () => {
    if (dismissed) return null;

    if (phase === 'loading') {
      if (silent) return null;
      return (
        <motion.div key="loading" {...PROMPT_MOTION} className="mt-2">
          <div className="flex items-center gap-2 rounded-lg border border-claude-active/20 bg-claude-active/5 px-4 py-3 text-xs text-claude-active">
            <Loader2 size={14} className="animate-spin" />
            <span>{t('permissionLoading')}</span>
          </div>
        </motion.div>
      );
    }

    if (phase === 'failed') {
      if (silent) return null;
      return (
        <motion.div key="failed" {...PROMPT_MOTION} className="mt-2">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>{t('permissionParseFailed')}</span>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div key="ready" {...PROMPT_MOTION} className="mt-2">
        <div className="rounded-lg border border-claude-active/20 bg-claude-active/5 px-4 py-3">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-claude-active">
            <ShieldCheck size={14} />
            <span>{t('permissionRequired')}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {options.map((label, idx) => {
              const isSelected = localSelected === idx;
              const dimmed = localSelected !== null && !isSelected;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!isSelectable}
                  onClick={() => handleSelect(idx)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    isSelected
                      ? 'border-claude-active/40 bg-claude-active/10'
                      : dimmed
                        ? 'border-border/30 opacity-50'
                        : 'border-border/50',
                    isSelectable && 'cursor-pointer hover:border-claude-active/30 hover:bg-claude-active/5',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium',
                      isSelected
                        ? 'bg-claude-active text-white'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{stripNumberPrefix(label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    );
  };

  return <AnimatePresence initial={false}>{renderContent()}</AnimatePresence>;
};

export default memo(PermissionPromptItem);
