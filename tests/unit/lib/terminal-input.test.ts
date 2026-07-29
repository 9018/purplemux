import { describe, expect, it } from 'vitest';
import { encodeTerminalPaste, sendTerminalText } from '@/lib/terminal-input';

describe('encodeTerminalPaste', () => {
  it('leaves a single line unchanged', () => {
    expect(encodeTerminalPaste('echo hello')).toBe('echo hello');
  });

  it('wraps LF-delimited text in bracketed paste markers', () => {
    expect(encodeTerminalPaste('echo one\necho two')).toBe(
      '\x1b[200~echo one\necho two\x1b[201~',
    );
  });

  it('wraps CR-delimited text in bracketed paste markers', () => {
    expect(encodeTerminalPaste('echo one\recho two')).toBe(
      '\x1b[200~echo one\recho two\x1b[201~',
    );
  });
});

describe('sendTerminalText', () => {
  it('sends a multiline paste followed by exactly one enter', () => {
    const writes: string[] = [];

    expect(sendTerminalText((data) => writes.push(data), 'first\nsecond')).toBe(true);
    expect(writes).toEqual(['\x1b[200~first\nsecond\x1b[201~', '\r']);
  });

  it('does not send empty text', () => {
    const writes: string[] = [];

    expect(sendTerminalText((data) => writes.push(data), '')).toBe(false);
    expect(writes).toEqual([]);
  });
});
