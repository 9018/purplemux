# Mobile Terminal Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phone-friendly terminal special keys and reliable clipboard/multiline paste to normal and expanded agent terminals.

**Architecture:** Centralize terminal text encoding in a pure utility, keep key sequences in the existing shared key registry, and use one reusable Paste button for both toolbars. Extract key-bar visibility into a testable helper so Chat-mode expanded terminals are covered without duplicating rendering logic.

**Tech Stack:** React 19, Next.js 16, TypeScript, xterm.js, tmux, Vitest, Playwright.

---

### Task 1: Terminal input encoding

**Files:**
- Create: `src/lib/terminal-input.ts`
- Test: `tests/unit/lib/terminal-input.test.ts`

- [ ] Write tests asserting that a single line is unchanged and any text containing `\n` or `\r` is wrapped with `\x1b[200~` and `\x1b[201~`.
- [ ] Run `pnpm test tests/unit/lib/terminal-input.test.ts` and confirm it fails because the utility does not exist.
- [ ] Implement `encodeTerminalPaste(text: string): string` with no browser dependencies.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Key registry and key-bar visibility

**Files:**
- Modify: `src/lib/terminal-keys.ts`
- Create: `src/lib/terminal-key-bar-visibility.ts`
- Test: `tests/unit/lib/terminal-keys.test.ts`
- Test: `tests/unit/lib/terminal-key-bar-visibility.test.ts`

- [ ] Write failing tests for Home (`\x1b[H`), End (`\x1b[F`), PgUp (`\x1b[5~`), PgDn (`\x1b[6~`), Backspace (`\x7f`), Ctrl+C (`\x03`), Ctrl+D (`\x04`), and Ctrl+Z (`\x1a`).
- [ ] Write failing tests proving a touch-device Chat agent with an expanded terminal shows the bar, a collapsed agent terminal does not, and `never` overrides all panels.
- [ ] Run the two focused tests and confirm the expected failures.
- [ ] Add the key definitions and implement `shouldShowTerminalKeyBar`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Dedicated Paste button

**Files:**
- Create: `src/components/features/workspace/terminal-paste-button.tsx`
- Modify: `src/components/features/workspace/terminal-key-bar.tsx`
- Modify: `src/components/features/mobile/mobile-terminal-toolbar.tsx`

- [ ] Add a reusable Paste button that attempts secure-context clipboard reading and otherwise opens a manual textarea dialog.
- [ ] Send `encodeTerminalPaste(text)` followed by one carriage return.
- [ ] Add the button to both compact and full mobile terminal toolbars.
- [ ] Update the mobile toolbar send path to bracket-wrap multiline textarea values.

### Task 4: Expanded Chat terminal integration

**Files:**
- Modify: `src/components/features/workspace/pane-container.tsx`

- [ ] Replace the inline visibility condition with `shouldShowTerminalKeyBar`.
- [ ] Pass agent-panel and terminal-collapsed state so expanded Claude/Codex/Pi terminals render the bar.
- [ ] Preserve `auto`, `always`, and `never` settings.

### Task 5: Verification and deployment

**Files:**
- Modify if needed: `/home/a9017/purplemux/README.md`

- [ ] Run focused unit tests.
- [ ] Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`.
- [ ] Restart `purplemux-8022.service` and `purplemux-18022.service`.
- [ ] Use mobile Playwright against port 18022 to verify requested controls, Paste fallback, WebSocket health, and console health.
- [ ] Confirm both services are enabled, active, and listening.
