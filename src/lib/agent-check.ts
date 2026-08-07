import type { TPanelType } from '@/types/terminal';
import useTabStore from '@/hooks/use-tab-store';

export type TAgentPanelType = Extract<TPanelType, 'claude-code' | 'codex-cli' | 'pi-cli' | 'omp-cli'>;

export interface IAgentCheckResponse {
  running?: boolean;
  checkedAt?: number;
  sessionId?: unknown;
  resumable?: unknown;
  providerId?: unknown;
  providerDisplayName?: unknown;
  providerPanelType?: unknown;
}

export interface IAgentCheckOutcome {
  running: boolean;
  checkedAt: number;
}

export const isAgentPanelType = (value: unknown): value is TAgentPanelType =>
  value === 'claude-code' || value === 'codex-cli' || value === 'pi-cli' || value === 'omp-cli';

export const applyAgentCheckResult = (
  tabId: string,
  data: IAgentCheckResponse,
): IAgentCheckOutcome => {
  const checkedAt = typeof data.checkedAt === 'number' ? data.checkedAt : Date.now();
  if (data.running === true && isAgentPanelType(data.providerPanelType)) {
    const providerId = typeof data.providerId === 'string' && data.providerId
      ? data.providerId
      : data.providerPanelType === 'codex-cli'
        ? 'codex'
        : data.providerPanelType === 'pi-cli'
          ? 'pi'
          : data.providerPanelType === 'omp-cli'
            ? 'omp'
            : 'claude';
    const detectedSessionId = typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : undefined;
    useTabStore.getState().setDetectedAgent(tabId, {
      running: true,
      checkedAt,
      providerId,
      panelType: data.providerPanelType,
      ...(detectedSessionId !== undefined ? { sessionId: detectedSessionId } : {}),
    });
    return { running: true, checkedAt };
  }

  useTabStore.getState().setDetectedAgent(tabId, { running: false, checkedAt });
  return { running: false, checkedAt };
};
