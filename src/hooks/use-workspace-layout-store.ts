import { create } from 'zustand';
import type { ILayoutData } from '@/types/terminal';

interface IWorkspaceLayoutStore {
  layouts: Record<string, ILayoutData>;
  setLayout: (workspaceId: string, layout: ILayoutData) => void;
}

const useWorkspaceLayoutStore = create<IWorkspaceLayoutStore>((set) => ({
  layouts: {},

  setLayout: (workspaceId, layout) =>
    set((state) => {
      if (state.layouts[workspaceId] === layout) return state;
      return { layouts: { ...state.layouts, [workspaceId]: layout } };
    }),
}));

export default useWorkspaceLayoutStore;
