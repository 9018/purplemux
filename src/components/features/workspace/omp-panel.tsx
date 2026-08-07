import CodexPanel from '@/components/features/workspace/codex-panel';

type TOmpPanelProps = Omit<React.ComponentProps<typeof CodexPanel>, 'provider' | 'updatePrompt' | 'onUpdatePromptResponse'>;

const OmpPanel = (props: TOmpPanelProps) => <CodexPanel {...props} provider="omp" />;

export default OmpPanel;