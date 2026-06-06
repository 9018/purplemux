import { cn } from '@/lib/utils';
import { CTRL_TOGGLE, SHIFT_TOGGLE, TERMINAL_KEYS, type IKeyDef } from '@/lib/terminal-keys';

const NERD_FONT_STYLE = { fontFamily: 'MesloLGLDZ, monospace' } as const;

interface ITerminalKeyBarProps {
  sendStdin: (data: string) => void;
  ctrlActive: boolean;
  shiftActive: boolean;
  setCtrlActive: (active: boolean) => void;
  setShiftActive: (active: boolean) => void;
}

const TerminalKeyBar = ({ sendStdin, ctrlActive, shiftActive, setCtrlActive, setShiftActive }: ITerminalKeyBarProps) => {
  const handleKey = (key: IKeyDef) => {
    if (key.value === CTRL_TOGGLE) {
      setCtrlActive(!ctrlActive);
      return;
    }
    if (key.value === SHIFT_TOGGLE) {
      setShiftActive(!shiftActive);
      return;
    }
    sendStdin(key.value);
    if (ctrlActive) setCtrlActive(false);
    if (shiftActive) setShiftActive(false);
  };

  return (
    <div
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-background px-3 py-2"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {TERMINAL_KEYS.map((key) => (
        <button
          key={key.label}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => handleKey(key)}
          className={cn(
            'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
            (key.value === CTRL_TOGGLE && ctrlActive) || (key.value === SHIFT_TOGGLE && shiftActive)
              ? 'border-claude-active bg-claude-active/20 text-claude-active'
              : 'border-border bg-muted/50 text-muted-foreground active:bg-muted',
          )}
        >
          <span
            className={cn('inline-block', key.rotate && 'rotate-90')}
            style={key.nerd ? NERD_FONT_STYLE : undefined}
          >
            {key.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default TerminalKeyBar;
