# Native Pi Agent Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pi as a complete Purplemux agent provider with terminal launch/resume, JSONL Chat timeline, live status events, session history, and desktop/mobile UI support.

**Architecture:** Keep Pi running as its native TUI inside tmux. Add a registered `pi` provider that discovers Pi session JSONL files and parses their active tree branch, plus a generated read-only Pi extension that reports lifecycle events to Purplemux's authenticated local hook endpoint. Generalize remaining Claude/Codex-only UI and session unions to include Pi without changing existing provider behavior.

**Tech Stack:** TypeScript, Next.js Pages Router, React 19, Vitest, tmux process inspection, Pi extension API, JSONL session files, systemd user services.

---

### Task 1: Add generic Pi provider identity and panel metadata

**Files:**
- Modify: `src/types/terminal.ts`
- Modify: `src/types/session-history.ts`
- Modify: `src/lib/agent-check.ts`
- Modify: `src/lib/agent-switch-lock.ts`
- Modify: `src/lib/layout-store.ts`
- Modify: `src/lib/tab-name.ts`
- Modify: `src/lib/tab-title.ts`
- Test: `tests/unit/lib/tab-name.test.ts`
- Test: `tests/unit/lib/tab-title.test.ts`
- Create: `tests/unit/lib/agent-check-pi.test.ts`

- [ ] **Step 1: Write failing tests for Pi panel identity**

Add tests asserting:

```ts
expect(defaultTabNameForPanelType('pi-cli')).toBe('Pi');
expect(formatTabTitle('pi|/tmp/project', 'pi-cli')).toBe('Pi');
expect(parseAgentCheckResponse({
  running: true,
  providerId: 'pi',
  providerPanelType: 'pi-cli',
}).panelType).toBe('pi-cli');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/lib/tab-name.test.ts tests/unit/lib/tab-title.test.ts tests/unit/lib/agent-check-pi.test.ts`

Expected: type or assertion failures because `pi-cli` is not a valid panel and Pi is not recognized.

- [ ] **Step 3: Add Pi to shared unions and helpers**

Implement:

```ts
export type TPanelType = 'terminal' | 'claude-code' | 'codex-cli' | 'pi-cli' | 'agent-sessions' | 'web-browser' | 'diff';
export type TSessionHistoryProvider = 'claude' | 'codex' | 'pi';
```

Update agent-panel guards, provider-to-panel mapping, default names, and process-title normalization so `pi` maps to `pi-cli` and displays as `Pi`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused tests pass.

- [ ] **Step 5: Commit provider identity support**

```bash
git add src/types src/lib/agent-check.ts src/lib/agent-switch-lock.ts src/lib/layout-store.ts src/lib/tab-name.ts src/lib/tab-title.ts tests/unit/lib
git commit -m "feat: add pi agent panel identity"
```

### Task 2: Parse Pi JSONL sessions and active branches

**Files:**
- Create: `src/lib/session-parser-pi.ts`
- Create: `tests/unit/lib/session-parser-pi.test.ts`
- Create: `tests/fixtures/pi-session-branched.jsonl`

- [ ] **Step 1: Write failing parser tests**

Cover:

```ts
const parsed = parsePiContent(fixture);
expect(parsed.entries.map((entry) => entry.type)).toEqual([
  'user-message', 'assistant-message', 'thinking', 'tool-call', 'tool-result', 'context-compacted',
]);
expect(parsed.entries.some((entry) => entry.id === 'abandoned-branch')).toBe(false);
```

Also test string/array user content, assistant usage mapping, `toolCall`, `toolResult`, `bashExecution`, visible/hidden custom messages, malformed final lines, legacy linear entries, and branch reconstruction through `parentId`.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `pnpm vitest run tests/unit/lib/session-parser-pi.test.ts`

Expected: module-not-found failure for `session-parser-pi`.

- [ ] **Step 3: Implement the parser**

Export this API:

```ts
export interface IPiParseResult extends IParseResult {
  sessionId: string | null;
  cwd: string | null;
}

export const parsePiContent = (content: string): IPiParseResult;
export const readTailPiEntries = (filePath: string, maxEntries: number): Promise<IChunkReadResult>;
export const readPiEntriesBefore = (filePath: string, beforeOffset: number, maxEntries: number): Promise<IChunkReadResult>;
```

Build an `id -> entry` map, select the newest valid entry as leaf, follow `parentId` to the root, and map only the active branch to Purplemux timeline entries. Reuse `summarizeToolCall` and `summarizeToolResult` from `session-parser.ts`.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run the command from Step 2. Expected: all Pi parser tests pass.

- [ ] **Step 5: Commit Pi parsing**

```bash
git add src/lib/session-parser-pi.ts tests/unit/lib/session-parser-pi.test.ts tests/fixtures/pi-session-branched.jsonl
git commit -m "feat: parse pi session timelines"
```

### Task 3: Implement Pi process detection, snapshots, and history statistics

**Files:**
- Create: `src/lib/providers/pi/session-detection.ts`
- Create: `src/lib/providers/pi/runtime-snapshot.ts`
- Create: `src/lib/providers/pi/session-history-stats.ts`
- Create: `tests/unit/lib/pi-session-detection.test.ts`
- Extend: `tests/unit/lib/agent-runtime-snapshot.test.ts`
- Extend: `tests/unit/lib/agent-session-history-stats.test.ts`

- [ ] **Step 1: Write failing detection and snapshot tests**

Test exact `--session <uuid>` resolution, cwd matching, process-start grace, delayed file creation, latest-mtime selection, active tool snapshot, settled assistant stop reason, aborted response, and touched-file extraction from Pi `read`, `write`, and `edit` calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/lib/pi-session-detection.test.ts tests/unit/lib/agent-runtime-snapshot.test.ts tests/unit/lib/agent-session-history-stats.test.ts
```

Expected: missing Pi provider modules and failed Pi cases.

- [ ] **Step 3: Implement Pi session discovery**

Export:

```ts
export const findPiSessionById: (id: string, options?: IPiSessionSearchOptions) => Promise<IPiSessionMeta | null>;
export const findLatestPiSessionForCwd: (cwd: string, options?: IPiSessionSearchOptions) => Promise<IPiSessionMeta | null>;
export const detectActiveSession: IAgentProvider['detectActiveSession'];
export const isPiRunning: IAgentProvider['isAgentRunning'];
export const watchSessionsDir: IAgentProvider['watchSessions'];
```

Resolve the session root from `PI_CODING_AGENT_SESSION_DIR`, then `settings.json.sessionDir`, then `~/.pi/agent/sessions`. Validate JSONL headers and session-root containment.

- [ ] **Step 4: Implement runtime and history readers**

Export `readPiRuntimeSnapshot()` and `readPiSessionHistoryStats()` using Pi message roles, stop reasons, timestamps, tool IDs, and usage fields. Unknown tools remain visible by name.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused tests pass.

- [ ] **Step 6: Commit detection and runtime support**

```bash
git add src/lib/providers/pi tests/unit/lib/pi-session-detection.test.ts tests/unit/lib/agent-runtime-snapshot.test.ts tests/unit/lib/agent-session-history-stats.test.ts
git commit -m "feat: detect and inspect pi sessions"
```

### Task 4: Register the Pi provider and lifecycle extension bridge

**Files:**
- Create: `src/lib/providers/pi/index.ts`
- Create: `src/lib/providers/pi/preflight.ts`
- Create: `src/lib/providers/pi/extension.ts`
- Create: `src/lib/providers/pi/hook-handler.ts`
- Modify: `src/lib/providers/index.ts`
- Modify: `src/lib/providers/types.ts`
- Modify: `src/pages/api/status/hook.ts`
- Create: `src/pages/api/pi/launch-command.ts`
- Create: `src/lib/providers/pi/client.ts`
- Create: `tests/unit/lib/pi-provider.test.ts`
- Create: `tests/unit/lib/pi-hook-handler.test.ts`

- [ ] **Step 1: Write failing provider and hook tests**

Assert:

```ts
expect(piProvider.matchesProcess('pi')).toBe(true);
expect(await piProvider.buildLaunchCommand({})).toContain('pi --extension');
expect(await piProvider.buildResumeCommand(UUID, {})).toContain(`--session '${UUID}'`);
expect(translatePiHookEvent({ event: 'agent_settled' }).event).toEqual({ kind: 'stop' });
```

Also test invalid UUID rejection, sanitized tool summaries, session metadata patching, and ignored unknown events.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/lib/pi-provider.test.ts tests/unit/lib/pi-hook-handler.test.ts`

Expected: missing Pi provider modules.

- [ ] **Step 3: Implement provider launch/preflight**

Generate `~/.purplemux/pi-extension.ts` with mode `0700`, construct shell-quoted `pi` commands, validate UUIDs, detect configured readiness without reading auth contents, and register `piProvider` in `src/lib/providers/index.ts`.

- [ ] **Step 4: Implement extension and hook translation**

The generated extension registers `session_start`, `session_info_changed`, `input`, `agent_start`, `tool_execution_start`, `tool_execution_end`, `agent_settled`, compaction, and shutdown events. It sends capped JSON payloads to:

```text
POST /api/status/hook?provider=pi&tmuxSession=<TMUX_SESSION>
```

using `x-pmux-token`, a short timeout, and swallowed delivery errors. Add `handlePiHook()` beside existing Claude/Codex handlers and route only `provider=pi` to it.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused tests pass.

- [ ] **Step 6: Commit provider and hook bridge**

```bash
git add src/lib/providers src/pages/api/status/hook.ts src/pages/api/pi tests/unit/lib/pi-provider.test.ts tests/unit/lib/pi-hook-handler.test.ts
git commit -m "feat: add pi provider lifecycle bridge"
```

### Task 5: Integrate Pi into timeline streaming and session history APIs

**Files:**
- Modify: `src/lib/timeline-server.ts`
- Modify: `src/pages/api/timeline/entries.ts`
- Create: `src/lib/pi-session-list.ts`
- Create: `src/pages/api/pi/sessions.ts`
- Create: `src/hooks/use-pi-sessions.ts`
- Modify: `src/hooks/use-agent-sessions.ts`
- Modify: `src/hooks/use-timeline.ts`
- Modify: `src/hooks/use-timeline-websocket.ts`
- Modify: `src/lib/session-history.ts`
- Modify: `src/lib/session-meta-cache.ts`
- Create: `tests/unit/lib/pi-session-list.test.ts`
- Extend: `tests/unit/lib/session-parser-codex.test.ts`

- [ ] **Step 1: Write failing session-list and routing tests**

Test cwd filtering, metadata extraction, first user message, turn count, sorting, provider `pi`, timeline parser selection for a Pi path, and pagination-before-offset.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/lib/pi-session-list.test.ts tests/unit/lib/session-parser-pi.test.ts`

Expected: missing Pi session-list and timeline routing support.

- [ ] **Step 3: Add Pi timeline parser routing**

Select parser by registered provider/panel type rather than only `isCodexJsonlPath`. Add Pi initial-tail and older-entry readers while preserving existing incremental semantics; when a Pi branch change rewrites the active path, emit a reset snapshot rather than appending abandoned entries.

- [ ] **Step 4: Add Pi session listing**

Return session entries shaped like the generic agent session model, with `provider: 'pi'`, JSONL path, cwd, first message, turn count, timestamps, and session ID from the header.

- [ ] **Step 5: Generalize frontend hooks**

Fetch `/api/pi/sessions`, merge Pi entries with Claude and Codex entries, accept `pi-cli` in timeline hook panel types, and retain provider IDs in history/notification records instead of defaulting all non-Codex entries to Claude.

- [ ] **Step 6: Run focused and regression tests**

Run:

```bash
pnpm vitest run tests/unit/lib/pi-session-list.test.ts tests/unit/lib/session-parser-pi.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/api/message-counts.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit timeline/history integration**

```bash
git add src/lib src/pages/api/pi src/pages/api/timeline src/hooks tests/unit/lib tests/unit/api
git commit -m "feat: integrate pi timeline and sessions"
```

### Task 6: Add desktop and mobile Pi UI

**Files:**
- Create: `src/components/icons/pi-icon.tsx`
- Create: `src/components/features/workspace/pi-panel.tsx`
- Create: `src/components/features/mobile/mobile-pi-panel.tsx`
- Modify: `src/components/features/workspace/pane-container.tsx`
- Modify: `src/components/features/workspace/pane-new-tab-menu.tsx`
- Modify: `src/components/features/workspace/pane-tab-item.tsx`
- Modify: `src/components/features/workspace/agent-mode-switcher.tsx`
- Modify: `src/components/features/workspace/agent-session-list-view.tsx`
- Modify: `src/components/features/workspace/notification-sheet.tsx`
- Modify: `src/components/features/mobile/mobile-surface-view.tsx`
- Modify: `src/components/features/mobile/mobile-new-tab-dialog.tsx`
- Modify: `src/components/features/mobile/mobile-tab-header.tsx`
- Modify: `src/components/features/mobile/mobile-terminal-page.tsx`
- Modify: `src/hooks/use-layout.ts`
- Modify: `src/hooks/use-keyboard-shortcuts.ts`
- Modify: locale message JSON files under `messages/`

- [ ] **Step 1: Add failing helper/store tests for Pi switching and resume**

Extend layout/tab tests so Pi maps to `pi-cli`, switching away stores Pi provider identity, and resuming a Pi session creates a Pi tab rather than Claude/Codex.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/lib/tab-store-session-view.test.ts tests/unit/lib/tab-name.test.ts`

Expected: Pi switching/resume assertions fail.

- [ ] **Step 3: Implement reusable Pi panels**

Clone only the thin provider-specific orchestration from Codex panels while reusing terminal and timeline components. Pi panels call `/api/pi/launch-command`, pass `panelType: 'pi-cli'`, and share boot/reconnect behavior with the generic agent flow.

- [ ] **Step 4: Add Pi navigation and presentation**

Add Pi to new-tab menus, mode switchers, tab icons, session filters, provider badges, notifications, resume actions, desktop pane rendering, and mobile surface rendering. Use label `Pi` and translation key `piNewConversation`.

- [ ] **Step 5: Remove non-Codex-to-Claude fallbacks**

Replace expressions such as:

```ts
providerId === 'codex' ? 'codex' : 'claude'
```

with explicit provider-preserving helpers so Pi cannot be mislabeled or resumed as Claude.

- [ ] **Step 6: Run focused tests and TypeScript/lint checks**

Run:

```bash
pnpm vitest run tests/unit/lib/tab-store-session-view.test.ts tests/unit/lib/tab-name.test.ts tests/unit/lib/tab-title.test.ts
pnpm exec tsc --noEmit
pnpm lint
```

Expected: tests and checks pass with no errors.

- [ ] **Step 7: Commit UI support**

```bash
git add src/components src/hooks messages tests/unit/lib
git commit -m "feat: add pi agent desktop and mobile ui"
```

### Task 7: Build, deploy, and verify both persistent ports

**Files:**
- Modify as needed: `/home/a9017/purplemux/README.md`
- Modify as needed: `/home/a9017/.config/systemd/user/purplemux-8022.service`
- Modify as needed: `/home/a9017/.config/systemd/user/purplemux-18022.service`

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Expected: every command exits zero.

- [ ] **Step 2: Audit provider coverage**

Run:

```bash
rg -n "'claude' \| 'codex'|claude-code.*codex-cli|codex.*:.*claude" src tests
```

Inspect every remaining match and verify it is intentionally provider-specific, not a missed Pi branch.

- [ ] **Step 3: Point runtime services at the source build**

Update both user services to run the built Purplemux executable from `/home/a9017/purplemux/source` with their existing port and proxy settings. Preserve auto-restart, environment, and websocket diagnostic configuration.

- [ ] **Step 4: Restart and verify service health**

Run:

```bash
systemctl --user daemon-reload
systemctl --user restart purplemux-8022.service purplemux-18022.service
systemctl --user is-active purplemux-8022.service purplemux-18022.service
curl -fsS http://127.0.0.1:8022/api/health
curl -fsS http://127.0.0.1:18022/api/health
```

Expected: both services are active and both health endpoints return success.

- [ ] **Step 5: Verify Pi preflight, launch, hook, and session history**

Create a temporary test workspace and Pi session directory, launch a Pi tab through Purplemux, verify the tmux descendant process is `pi`, confirm the tab gains provider `pi` and a JSONL path, submit a harmless prompt, and verify the same user/assistant/tool entries appear through the timeline endpoint. Resume the generated UUID and verify it reopens the same session.

- [ ] **Step 6: Verify mobile route and websocket stability**

At a mobile viewport, open both ports, create/open a Pi tab, switch Terminal/Chat, background and foreground the page, and verify no reconnect loop occurs and Pi state remains associated with the tab.

- [ ] **Step 7: Update local operations documentation**

Document Pi support, source/build path, service restart commands, generated extension path, degraded JSONL fallback, and diagnostics in `/home/a9017/purplemux/README.md`.

- [ ] **Step 8: Commit deployment documentation**

```bash
git add docs README.md
git commit -m "docs: document pi agent deployment"
```

### Task 8: Final requirement audit

**Files:**
- Review: `docs/superpowers/specs/2026-07-29-pi-agent-native-support-design.md`
- Review: all changed files

- [ ] **Step 1: Check every acceptance criterion against evidence**

Record evidence for new launch, resume, correct session association, Chat rendering, live status, process exit, history listing, active-branch behavior, mobile switching, extension fallback, and Claude/Codex regressions.

- [ ] **Step 2: Inspect final diff and repository state**

Run:

```bash
git diff HEAD~7 --stat
git status --short
git log --oneline -10
```

Expected: only intentional tracked changes; no uncommitted implementation files.

- [ ] **Step 3: Re-run fresh completion verification**

Run:

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build
systemctl --user is-active purplemux-8022.service purplemux-18022.service
curl -fsS http://127.0.0.1:8022/api/health
curl -fsS http://127.0.0.1:18022/api/health
```

Expected: all commands exit zero and both deployed ports are healthy.
