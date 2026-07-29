import useSWR from 'swr';
import { useCallback } from 'react';
import type { IPiSessionEntry } from '@/lib/pi-session-list';

interface IPiSessionsResponse {
  sessions: IPiSessionEntry[];
  scannedDirs: number;
  scannedFiles: number;
}

const fetcher = async (url: string): Promise<IPiSessionsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request-failed-${res.status}`);
  return await res.json() as IPiSessionsResponse;
};

export const usePiSessions = (cwd: string | null | undefined, enabled: boolean) => {
  const key = enabled && cwd ? `/api/pi/sessions?cwd=${encodeURIComponent(cwd)}` : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<IPiSessionsResponse, Error>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  const refresh = useCallback(async () => { await mutate(); }, [mutate]);
  return {
    sessions: data?.sessions ?? [],
    isLoading: Boolean(key) && isLoading,
    isValidating,
    error: error ?? null,
    refresh,
  };
};

