import { create } from 'zustand';
import type { ILayoutData } from '@/types/terminal';

interface IWorkspaceLayoutStore {
  layouts: Record<string, ILayoutData>;
  setLayout: (workspaceId: string, layout: ILayoutData) => void;
  removeLayout: (workspaceId: string) => void;
}

const useWorkspaceLayoutStore = create<IWorkspaceLayoutStore>((set) => ({
  layouts: {},

  setLayout: (workspaceId, layout) =>
    set((state) => {
      if (state.layouts[workspaceId] === layout) return state;
      return { layouts: { ...state.layouts, [workspaceId]: layout } };
    }),

  removeLayout: (workspaceId) =>
    set((state) => {
      if (!state.layouts[workspaceId]) return state;
      const { [workspaceId]: _removed, ...rest } = state.layouts;
      return { layouts: rest };
    }),
}));

export default useWorkspaceLayoutStore;
