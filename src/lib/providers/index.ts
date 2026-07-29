import { claudeProvider } from '@/lib/providers/claude';
import { codexProvider } from '@/lib/providers/codex';
import { piProvider } from '@/lib/providers/pi';
import { registerProvider } from '@/lib/providers/registry';

registerProvider(claudeProvider);
registerProvider(codexProvider);
registerProvider(piProvider);

export {
  detectAnyActiveSession,
  isAnyAgentRunning,
} from '@/lib/providers/session-scan';
export type {
  IProviderSessionScan,
} from '@/lib/providers/session-scan';

export {
  getProvider,
  getProviderByPanelType,
  getProviderByProcessName,
  listProviders,
  registerProvider,
} from '@/lib/providers/registry';
export type {
  IAgentProvider,
  IAgentLaunchCommandOptions,
  IAgentResumeCommandOptions,
  IAgentSessionWatchOptions,
} from '@/lib/providers/types';
