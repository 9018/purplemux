import { useEffect, useMemo } from 'react';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useLayoutStore, collectPanes } from '@/hooks/use-layout';
import useWorkspaceLayoutStore from '@/hooks/use-workspace-layout-store';
import type { ILayoutData, IPaneNode } from '@/types/terminal';

/**
 * 사이드바 등에서 모든 워크스페이스의 권위 있는 탭 구성(레이아웃)을 얻기 위한 훅.
 * 활성 워크스페이스는 useLayoutStore의 실시간 레이아웃을, 나머지는 캐시를 사용한다.
 * 미캐시 워크스페이스는 초기 1회 fetch하며, 이후 변경은 use-sync의 layout 이벤트가 캐시를 갱신한다.
 */
export const useWorkspaceLayouts = (): Record<string, IPaneNode[]> => {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const layouts = useWorkspaceLayoutStore((s) => s.layouts);
  const setLayout = useWorkspaceLayoutStore((s) => s.setLayout);
  const storeLayout = useLayoutStore((s) => s.layout);
  const storeWorkspaceId = useLayoutStore((s) => s.workspaceId);

  const wsIds = useMemo(() => workspaces.map((ws) => ws.id).join(','), [workspaces]);

  // 활성 레이아웃을 캐시에 반영해 두어 비활성 전환 시에도 점이 유지되도록 한다
  useEffect(() => {
    if (storeLayout && storeWorkspaceId) setLayout(storeWorkspaceId, storeLayout);
  }, [storeLayout, storeWorkspaceId, setLayout]);

  useEffect(() => {
    const ids = wsIds ? wsIds.split(',') : [];
    const toFetch = ids.filter((id) => {
      if (id === storeWorkspaceId && storeLayout) return false;
      return !useWorkspaceLayoutStore.getState().layouts[id];
    });
    if (toFetch.length === 0) return;

    let cancelled = false;
    Promise.all(
      toFetch.map(async (id) => {
        try {
          const res = await fetch(`/api/layout?workspace=${id}`);
          if (!res.ok) return null;
          return { id, data: (await res.json()) as ILayoutData };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      for (const r of results) {
        if (r?.data?.root) setLayout(r.id, r.data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [wsIds, storeWorkspaceId, storeLayout, setLayout]);

  // 레이아웃을 아직 모르는 워크스페이스는 맵에서 제외해 소비 측이 기존 경로로 폴백하도록 둔다
  return useMemo(() => {
    const map: Record<string, IPaneNode[]> = {};
    for (const ws of workspaces) {
      const layout = ws.id === storeWorkspaceId && storeLayout ? storeLayout : layouts[ws.id];
      if (layout) map[ws.id] = collectPanes(layout.root);
    }
    return map;
  }, [workspaces, storeLayout, storeWorkspaceId, layouts]);
};

export default useWorkspaceLayouts;
