import { useCallback, useState } from 'react';
import { ClipboardPaste, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { sendTerminalText } from '@/lib/terminal-input';

interface ITerminalPasteButtonProps {
  sendStdin: (data: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

const TerminalPasteButton = ({
  sendStdin,
  disabled = false,
  compact = false,
  className,
}: ITerminalPasteButtonProps) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const submit = useCallback((text: string) => {
    if (disabled || !sendTerminalText(sendStdin, text)) return;
    setValue('');
    setOpen(false);
  }, [disabled, sendStdin]);

  const handlePaste = useCallback(async () => {
    if (disabled) return;
    if (window.isSecureContext && navigator.clipboard?.readText) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText) {
          submit(clipboardText);
          return;
        }
      } catch {
        // Clipboard reads are commonly blocked on phone browsers over HTTP.
      }
    }
    setOpen(true);
  }, [disabled, submit]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? 'sm' : 'icon'}
        className={cn(
          compact
            ? 'h-auto shrink-0 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground active:bg-muted'
            : 'h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground',
          className,
        )}
        onClick={handlePaste}
        disabled={disabled}
        aria-label="Paste into terminal"
        title="Paste into terminal"
      >
        <ClipboardPaste size={compact ? 13 : 16} />
        {compact && <span>Paste</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste into terminal</DialogTitle>
            <DialogDescription>
              Long-press the field and choose Paste, then send it to the terminal.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Long-press here to paste"
            aria-label="Text to paste"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={6}
            className="min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          />
          <DialogFooter>
            <Button type="button" onClick={() => submit(value)} disabled={!value || disabled}>
              <SendHorizontal />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TerminalPasteButton;
