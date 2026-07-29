import { describe, expect, it } from 'vitest';
import { TERMINAL_KEYS } from '@/lib/terminal-keys';

describe('TERMINAL_KEYS', () => {
  it.each([
    ['Home', '\x1b[H'],
    ['End', '\x1b[F'],
    ['PgUp', '\x1b[5~'],
    ['PgDn', '\x1b[6~'],
    ['Backspace', '\x7f'],
    ['Ctrl+C', '\x03'],
    ['Ctrl+D', '\x04'],
    ['Ctrl+Z', '\x1a'],
  ])('contains %s with the expected terminal sequence', (label, value) => {
    expect(TERMINAL_KEYS).toContainEqual(expect.objectContaining({ label, value }));
  });
});
