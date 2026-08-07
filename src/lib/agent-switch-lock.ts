import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import type { TPanelType } from '@/types/terminal';
import type { TCliState } from '@/types/timeline';

type TAgentPanelType = Extract<TPanelType, 'claude-code' | 'codex-cli' | 'pi-cli' | 'omp-cli'>;

export const isAgentPanel = (
  panelType: TPanelType | undefined,
): panelType is TAgentPanelType =>
  panelType === 'claude-code' || panelType === 'codex-cli' || panelType === 'pi-cli' || panelType === 'omp-cli';

export const isAgentRunning = (cliState: TCliState | undefined): boolean =>
  cliState !== undefined && cliState !== 'inactive' && cliState !== 'unknown';

export const getAgentPanelTypeFromProvider = (providerId: string | undefined): TAgentPanelType | undefined => {
  if (providerId === 'claude') return 'claude-code';
  if (providerId === 'codex') return 'codex-cli';
  if (providerId === 'pi') return 'pi-cli';
  if (providerId === 'omp') return 'omp-cli';
  return undefined;
};

const agentDisplayName = (panelType: TPanelType | undefined): string => {
  if (panelType === 'claude-code') return 'Claude';
  if (panelType === 'codex-cli') return 'Codex';
  if (panelType === 'pi-cli') return 'Pi';
  if (panelType === 'omp-cli') return 'Omp';
  return '';
};

interface IAgentSwitchInput {
  current: TPanelType | undefined;
  target: TPanelType;
  cliState: TCliState | undefined;
  agentProcess?: boolean | null | undefined;
  runningAgentPanelType?: TAgentPanelType | undefined;
}

export const isAgentSwitchBlocked = ({
  current,
  target,
  cliState,
  agentProcess,
  runningAgentPanelType,
}: IAgentSwitchInput): boolean => {
  if (!current || current === target) return false;
  if (agentProcess !== true && !isAgentRunning(cliState)) return false;
  if (isAgentPanel(current) && isAgentPanel(target)) return true;
  if (current === 'terminal' && isAgentPanel(target) && runningAgentPanelType) {
    return target !== runningAgentPanelType;
  }
  return false;
};

export const tryAgentSwitch = (input: IAgentSwitchInput): boolean => {
  if (!isAgentSwitchBlocked(input)) return true;
  const name = agentDisplayName(isAgentPanel(input.current) ? input.current : input.runningAgentPanelType);
  toast.error(t('terminal', 'switchAgentBlocked').replace('{name}', name), {
    id: 'agent-switch-blocked',
    duration: 5000,
  });
  return false;
};
