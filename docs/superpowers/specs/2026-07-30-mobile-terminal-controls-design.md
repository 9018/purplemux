# Mobile Terminal Controls Design

## Goal

Make Purplemux usable from a phone when controlling a plain tmux shell or an agent TUI by exposing special keys in an expanded Chat terminal, providing a dedicated paste action, and preserving multiline input as one bracketed-paste operation.

## Confirmed requirements

1. When a Claude, Codex, or Pi tab is in Chat mode and its terminal area is expanded, the terminal special-key bar is visible on touch devices (or whenever the key-bar setting is `always`).
2. Both terminal toolbars expose a dedicated Paste button.
3. Multiline text sent from a terminal text field or Paste action is wrapped in `ESC [ 200 ~` and `ESC [ 201 ~` before the final Enter.
4. The key set includes Home, End, Page Up, Page Down, Backspace, Ctrl+C, Ctrl+D, and Ctrl+Z in addition to the existing keys.

## Architecture

### Shared input encoding

Create a small pure utility in `src/lib/terminal-input.ts`. It returns single-line text unchanged and wraps multiline text in bracketed-paste markers. Both mobile command input and the dedicated Paste action use this function, so multiline behavior cannot drift between surfaces.

### Shared Paste button

Create `TerminalPasteButton` under `src/components/features/workspace/`. On HTTPS/localhost it first attempts `navigator.clipboard.readText()`. If browser clipboard reading is unavailable, denied, or empty, it opens a compact dialog containing a textarea. That fallback supports iOS/Android system long-press Paste even when Purplemux is served over an HTTP VPN address.

The component receives only `sendStdin` and connection state. It sends encoded text followed by Enter, reports clipboard failures without losing the fallback, and does not read global application state.

### Key definitions

Extend `TERMINAL_KEYS` in `src/lib/terminal-keys.ts`. Keys are represented by their standard terminal escape/control sequences, keeping desktop and mobile key bars synchronized.

### Chat terminal visibility

Extract the visibility decision into a pure helper. The key bar is shown when:

- a tab exists;
- the setting is not `never` and is active for the current device;
- the panel is a normal terminal, or it is an agent panel whose terminal split is expanded.

The mobile-only surface continues to show its full command toolbar after switching the tab to Terminal. Agent Chat panels that expose a split terminal use the same compact special-key bar as the desktop/responsive pane implementation.

## Error handling

- Clipboard API unavailable or denied: open the manual paste dialog and show concise guidance.
- Empty clipboard/manual input: do not send anything.
- Disconnected terminal: disable Paste and Send controls.
- Sending a special key never appends an implicit Enter.
- Sending pasted or typed command text appends exactly one Enter after the encoded payload.

## Testing

- Unit tests prove multiline wrapping, single-line passthrough, all requested escape/control sequences, and Chat-terminal visibility rules.
- Existing test suite, TypeScript, ESLint, and production build must pass.
- Mobile Playwright QA at `http://127.0.0.1:18022` verifies the Pi/Codex Chat terminal key bar, Paste button/dialog, requested key labels, no reconnect overlay, and no console errors.

