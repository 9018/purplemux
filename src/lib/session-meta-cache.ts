import type { ISessionMeta } from '@/types/timeline';

export type TMetaCacheProviderId = 'claude' | 'codex' | 'pi';

interface ICacheEntry {
  meta: ISessionMeta;
  mtime: number;
  cachedAt: number;
}

const CACHE_TTL = 30_000;

const composeKey = (providerId: TMetaCacheProviderId, sessionId: string): string =>
  `${providerId}:${sessionId}`;

export interface IMetaCache {
  get: (providerId: TMetaCacheProviderId, sessionId: string) => ISessionMeta | undefined;
  set: (providerId: TMetaCacheProviderId, sessionId: string, meta: ISessionMeta, mtime: number) => void;
  isStale: (providerId: TMetaCacheProviderId, sessionId: string, currentMtime: number) => boolean;
  clear: () => void;
}

export const createMetaCache = (): IMetaCache => {
  const store = new Map<string, ICacheEntry>();

  const get = (providerId: TMetaCacheProviderId, sessionId: string): ISessionMeta | undefined => {
    const key = composeKey(providerId, sessionId);
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > CACHE_TTL) {
      store.delete(key);
      return undefined;
    }
    return entry.meta;
  };

  const set = (providerId: TMetaCacheProviderId, sessionId: string, meta: ISessionMeta, mtime: number) => {
    store.set(composeKey(providerId, sessionId), { meta, mtime, cachedAt: Date.now() });
  };

  const isStale = (providerId: TMetaCacheProviderId, sessionId: string, currentMtime: number): boolean => {
    const key = composeKey(providerId, sessionId);
    const entry = store.get(key);
    if (!entry) return true;
    if (Date.now() - entry.cachedAt > CACHE_TTL) {
      store.delete(key);
      return true;
    }
    return entry.mtime !== currentMtime;
  };

  const clear = () => {
    store.clear();
  };

  return { get, set, isStale, clear };
};
