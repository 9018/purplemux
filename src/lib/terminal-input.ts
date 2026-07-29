const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

export const encodeTerminalPaste = (text: string): string =>
  /[\r\n]/.test(text)
    ? `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`
    : text;

export const sendTerminalText = (sendStdin: (data: string) => void, text: string): boolean => {
  if (!text) return false;
  sendStdin(encodeTerminalPaste(text));
  sendStdin('\r');
  return true;
};
