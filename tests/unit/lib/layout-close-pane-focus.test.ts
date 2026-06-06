import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findPane } from '@/lib/layout-tree';
import type { ILayoutData, ITab } from '@/types/terminal';
import { useLayoutStore } from '@/hooks/use-layout';

const tab = (id: string, order: number): ITab => ({
  id,
  order,
  name: id,
  sessionName: `session-${id}`,
});

const makeLayout = (leftActiveTabId: string): ILayoutData => ({
  root: {
    type: 'split',
    orientation: 'horizontal',
    ratio: 50,
    children: [
      {
        type: 'pane',
        id: 'left',
        activeTabId: leftActiveTabId,
        tabs: [tab('left-1', 0), tab('left-2', 1), tab('left-3', 2), tab('left-4', 3)],
      },
      {
        type: 'pane',
        id: 'right',
        activeTabId: 'right-1',
        tabs: [tab('right-1', 0)],
      },
    ],
  },
  activePaneId: 'right',
  updatedAt: '2026-06-06T00:00:00.000Z',
});

describe('layout closePane focus preservation', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      layout: makeLayout('left-3'),
      workspaceId: 'ws-test',
      isLoading: false,
      error: null,
      isSplitting: false,
      retryCount: 0,
      paneCount: 2,
      canSplit: true,
      pendingFocusTabId: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the surviving pane active tab when the close response has stale tab focus', async () => {
    const staleLayout = makeLayout('left-1');
    const staleServerLayout: ILayoutData = {
      ...staleLayout,
      root: staleLayout.root.type === 'split' ? staleLayout.root.children[0] : staleLayout.root,
      activePaneId: 'left',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => staleServerLayout,
    }));

    await useLayoutStore.getState().closePane('right');

    const layout = useLayoutStore.getState().layout;
    expect(layout?.activePaneId).toBe('left');
    expect(layout ? findPane(layout.root, 'left')?.activeTabId : null).toBe('left-3');
  });
});
