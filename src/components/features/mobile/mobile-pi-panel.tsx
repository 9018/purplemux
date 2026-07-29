import MobileCodexPanel from '@/components/features/mobile/mobile-codex-panel';

type TMobilePiPanelProps = Omit<React.ComponentProps<typeof MobileCodexPanel>, 'provider' | 'updatePrompt' | 'onUpdatePromptResponse'>;

const MobilePiPanel = (props: TMobilePiPanelProps) => <MobileCodexPanel {...props} provider="pi" />;

export default MobilePiPanel;
