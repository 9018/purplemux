import { describe, expect, it } from 'vitest';
import { shouldShowTerminalKeyBar } from '@/lib/terminal-key-bar-visibility';

describe('shouldShowTerminalKeyBar', () => {
  it('shows for an expanded agent terminal on a touch device in auto mode', () => {
    expect(shouldShowTerminalKeyBar({
      panelType: 'codex-cli',
      hasTabs: true,
      keyBarMode: 'auto',
      isTouchDevice: true,
      terminalCollapsed: false,
    })).toBe(true);
  });

  it('hides for a collapsed agent terminal', () => {
    expect(shouldShowTerminalKeyBar({
      panelType: 'pi-cli',
      hasTabs: true,
      keyBarMode: 'always',
      isTouchDevice: true,
      terminalCollapsed: true,
    })).toBe(false);
  });

  it('lets never override normal and agent terminals', () => {
    expect(shouldShowTerminalKeyBar({
      panelType: 'terminal',
      hasTabs: true,
      keyBarMode: 'never',
      isTouchDevice: true,
      terminalCollapsed: false,
    })).toBe(false);
    expect(shouldShowTerminalKeyBar({
      panelType: 'claude-code',
      hasTabs: true,
      keyBarMode: 'never',
      isTouchDevice: true,
      terminalCollapsed: false,
    })).toBe(false);
  });

  it('shows in always mode on a non-touch normal terminal', () => {
    expect(shouldShowTerminalKeyBar({
      panelType: 'terminal',
      hasTabs: true,
      keyBarMode: 'always',
      isTouchDevice: false,
      terminalCollapsed: false,
    })).toBe(true);
  });
});
