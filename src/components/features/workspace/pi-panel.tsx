import CodexPanel from '@/components/features/workspace/codex-panel';

type TPiPanelProps = Omit<React.ComponentProps<typeof CodexPanel>, 'provider' | 'updatePrompt' | 'onUpdatePromptResponse'>;

const PiPanel = (props: TPiPanelProps) => <CodexPanel {...props} provider="pi" />;

export default PiPanel;
