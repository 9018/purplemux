import type { TPanelType } from '@/types/terminal';

type TTerminalKeyBarMode = 'auto' | 'always' | 'never';

interface ITerminalKeyBarVisibilityOptions {
  panelType: TPanelType;
  hasTabs: boolean;
  keyBarMode: TTerminalKeyBarMode;
  isTouchDevice: boolean;
  terminalCollapsed: boolean;
}

const AGENT_PANEL_TYPES = new Set<TPanelType>(['claude-code', 'codex-cli', 'pi-cli']);

export const shouldShowTerminalKeyBar = ({
  panelType,
  hasTabs,
  keyBarMode,
  isTouchDevice,
  terminalCollapsed,
}: ITerminalKeyBarVisibilityOptions): boolean => {
  if (!hasTabs || keyBarMode === 'never') return false;
  if (keyBarMode !== 'always' && !isTouchDevice) return false;
  if (panelType === 'terminal') return true;
  return AGENT_PANEL_TYPES.has(panelType) && !terminalCollapsed;
};
