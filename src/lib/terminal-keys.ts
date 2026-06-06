export const CTRL_TOGGLE = '__CTRL__';
export const SHIFT_TOGGLE = '__SHIFT__';

export interface IKeyDef {
  label: string;
  value: string;
  nerd?: boolean;
  rotate?: boolean;
}

export const TERMINAL_KEYS: IKeyDef[] = [
  { label: 'Tab', value: '\t' },
  { label: 'Esc', value: '\x1b' },
  { label: 'Ctrl', value: CTRL_TOGGLE },
  { label: 'Shift', value: SHIFT_TOGGLE },
  { label: '\u{f17a5}', value: '\r', nerd: true },
  { label: '\u{f005d}', value: '\x1b[A', nerd: true },
  { label: '\u{f0045}', value: '\x1b[B', nerd: true },
  { label: '\u{f004d}', value: '\x1b[D', nerd: true },
  { label: '\u{f0054}', value: '\x1b[C', nerd: true },
  { label: '\u{f0374}', value: '|', nerd: true, rotate: true },
  { label: '\u{f0725}', value: '~', nerd: true },
];

/** Convert a typed letter into its Ctrl control code (e.g. "c" → \x03), or null when not applicable. */
export const toCtrlChar = (typed: string): string | null => {
  if (typed.length !== 1) return null;
  const code = typed.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
  return null;
};
