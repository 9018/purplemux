# Native Pi Agent Support Design

## Summary

Add Pi as a first-class Purplemux agent provider with the same operating model as the existing Codex integration: Pi remains an interactive terminal application inside tmux, while Purplemux discovers the active session, renders its JSONL history in the Chat view, and receives lifecycle events from a small Purplemux-owned Pi extension.

The implementation targets the locally installed `@earendil-works/pi-coding-agent` CLI (`pi`), currently version `0.81.1`. It must not modify the user's Pi authentication, model, package, or settings files.

## Goals

- Add a dedicated `pi-cli` panel type and Pi provider.
- Launch new Pi sessions and resume existing sessions from Purplemux.
- Detect Pi processes and associate them with the correct JSONL session.
- Display Pi conversations, thinking blocks, tool calls, tool results, compactions, and session metadata in the existing agent Chat UI.
- Show useful busy, tool-running, settled, interrupted, and disconnected states.
- List, filter, inspect, and resume Pi sessions in the Sessions UI.
- Support the same Terminal/Chat switching behavior on desktop and mobile.
- Degrade safely to process and JSONL polling if the Pi extension cannot report events.

## Non-goals

- Replacing Pi's TUI with a Purplemux-owned RPC chat client.
- Changing Pi's configured provider, model, thinking level, extensions, skills, or trust decisions.
- Writing to `~/.pi/agent/auth.json`, `settings.json`, `models.json`, or `trust.json`.
- Implementing every Pi-specific interactive overlay inside Purplemux Chat.
- Supporting unrelated programs whose process name happens to contain `pi`.

## Chosen Architecture

### Terminal-first hybrid provider

Purplemux will launch Pi as a normal terminal program and pass one additional extension argument:

```text
pi --extension ~/.purplemux/pi-extension.ts
```

Resume commands will use Pi's supported session selector:

```text
pi --session <session-id> --extension ~/.purplemux/pi-extension.ts
```

The integration has three complementary data sources:

1. Process inspection confirms whether Pi is running in the pane and provides PID, cwd, arguments, and start time.
2. Pi JSONL files provide durable session identity, conversation history, tool details, token/cost data, and recovery after Purplemux restarts.
3. A Purplemux-owned Pi extension reports low-latency lifecycle events for accurate status transitions.

This mirrors the existing Codex architecture and preserves Pi's native TUI. RPC mode is intentionally not used because it would require Purplemux to own prompt transport, streaming, extension UI, abort semantics, and process lifecycle, while reducing parity with the existing agent panels.

## Provider Model

Add a provider with:

- Provider ID: `pi`
- Display name: `Pi`
- Panel type: `pi-cli`
- Process matches: exact `pi` process title/binary, the installed Pi CLI entrypoint, and the Purplemux Pi launcher when present
- Session ID validation: UUID format used by Pi session headers
- Session root: `~/.pi/agent/sessions`, with an environment/settings-aware override if Pi exposes a configured session directory

The provider implements the existing `IAgentProvider` contract:

- launch and resume command construction
- preflight and login/config readiness checks
- active-session detection and directory watching
- tab agent-state persistence
- JSONL path-to-session-ID mapping
- runtime snapshot extraction
- history statistics

No Pi-specific state should be added directly to `ITab`; it belongs in the generic `agentState` structure.

## Launch and Extension Injection

Purplemux will generate `~/.purplemux/pi-extension.ts` from a versioned source string, similar to the generated Codex launcher. The file is rewritten only when its expected content changes and is created with user-only permissions.

The launch builder appends the extension explicitly rather than installing it into Pi's global package list. This ensures:

- sessions started outside Purplemux remain unchanged;
- the user's `settings.json` is untouched;
- removing Purplemux does not leave an enabled package behind;
- extension versioning follows the running Purplemux version.

If the extension file cannot be created, launch may continue without it after surfacing a warning; JSONL polling remains available.

Workspace prompt injection is not part of the first implementation unless Pi exposes a non-invasive equivalent that does not overwrite user configuration. Existing project context files and Pi packages continue to work normally.

## Extension Event Bridge

The extension sends authenticated local HTTP events to Purplemux using the existing local CLI token/port mechanism. It must never send auth data, full system prompts, environment variables, or arbitrary file contents.

Events:

- `session_start`: session ID/path, cwd, reason
- `session_info_changed`: updated session identity/name when available
- `input`: last user input metadata and transition to busy
- `agent_start`: active generation
- `tool_execution_start`: tool name and a sanitized short summary
- `tool_execution_end`: clears or advances the current action
- `agent_settled`: ready for review/idle after retries and queued work are exhausted
- `session_before_compact` and `session_compact`: compaction state
- `session_shutdown`: clear active runtime state without deleting persisted history

The bridge must use short request timeouts and swallow network failures so Purplemux downtime can never block Pi. Event handlers must not mutate messages, prompts, tool inputs, tool outputs, or Pi control flow.

## Session Detection

Pi sessions are stored under cwd-derived directories with files named `<timestamp>_<uuid>.jsonl`. The first line is a session header containing `id`, `cwd`, and timestamp.

Detection order:

1. Locate a matching Pi descendant process for the tmux pane.
2. If process arguments contain `--session`, resolve that exact path or ID.
3. Otherwise scan candidate Pi session files for the process cwd.
4. Prefer a session created after the process start time, allowing a small clock/process grace window.
5. Prefer the most recently modified valid candidate.
6. If the extension has already reported a session path for the pane, use it after validation.

The detector must avoid claiming an old cwd-matching session immediately after Pi starts but before the new session file is created. It should initially report a running process with a null session path, then update when the file appears.

Directory watchers should watch the Pi sessions root and re-scan on create/change/rename, with polling fallback for platforms or filesystems where recursive watch is unreliable.

## JSONL Parsing and Branch Semantics

Pi version 3 sessions form a tree through entry `id` and `parentId`. Purplemux must render the active branch, not every historical branch as one linear conversation.

Parsing rules:

- Validate the session header before accepting a file.
- Parse entries defensively and skip malformed/incomplete trailing lines.
- Build an entry map and determine the current leaf from the newest valid appended entry.
- Walk `parentId` links back to the root and reverse the result for display.
- Preserve explicit branch and compaction summary entries as timeline metadata.
- Handle legacy versions conservatively as linear sessions when parent links are absent.

Message mapping:

- `user`: user timeline item; strings and text/image content arrays supported
- `assistant`: text, thinking, and tool-call blocks
- `toolResult`: result linked by tool-call ID, including error state
- `bashExecution`: shell action and output
- `custom`: visible custom messages only; hidden extension messages are ignored
- `branchSummary`: branch summary marker
- `compactionSummary` and `compaction`: compaction marker and summary

Images are represented using the existing timeline attachment model where supported. Large base64 payloads must not be copied into logs or status summaries.

## Runtime State

The extension is authoritative for live state while events are fresh. JSONL and process state are the fallback and restart recovery source.

Standard state mapping:

- process found, no active turn: idle
- `input` or `agent_start`: busy
- `tool_execution_start`: busy with current tool/action
- `agent_settled`: ready for review
- aborted/error assistant message: interrupted or needs review, depending on existing Purplemux state vocabulary
- process gone: not running/session ended
- stale live event state: re-evaluate from JSONL timestamps and process state

JSONL runtime snapshots should inspect the tail for the most recent user, assistant, tool-call, tool-result, compaction, and stop reason. Staleness thresholds must be bounded and tested so a killed Pi process does not remain busy indefinitely.

## History Statistics

The Pi history reader calculates:

- tool usage counts
- touched files inferred from standard read/write/edit tool arguments and results
- first user timestamp
- last user text
- last assistant text and timestamp
- last turn duration
- token and cost data where the existing timeline/session model can display it

Unknown custom tools remain visible by name without assuming their argument schema.

## UI Integration

Replace hardcoded Claude/Codex two-provider branches with provider-aware helpers where practical. Add Pi to:

- new-tab and panel creation menus
- tab icon, label, and color mapping
- Terminal/Chat mode switchers
- mobile tab controls
- agent preflight/error displays
- Sessions filters, rows, detail view, and resume action
- status labels and notification routing

The implementation should avoid adding new three-way conditionals throughout the UI. Provider metadata should supply display name, panel type, and presentation identifiers when feasible, while preserving existing Claude and Codex behavior.

## API and Persistence Changes

- Extend `TPanelType` with `pi-cli`.
- Extend timeline/session provider unions to include `pi` or generalize them to registered provider IDs.
- Add server routes for Pi launch commands and Pi extension events, following existing auth and local-only rules.
- Persist Pi session information only in `ITab.agentState`.
- Keep existing layout files backward compatible; unknown or absent provider state must not break startup.

## Preflight and Errors

Preflight checks:

- resolve the `pi` binary from `PATH`;
- read version without requiring a TTY;
- confirm the Pi agent directory/settings are usable;
- treat configured models/providers as readiness rather than inspecting or exposing credentials.

User-facing errors should distinguish:

- Pi not installed
- Pi installed but not configured with an available model/provider
- session file missing or malformed
- extension bridge unavailable, with fallback active
- resume target not found

Failures in Pi history parsing or extension delivery must be isolated to that panel and must not terminate the Purplemux server.

## Security

- Bind event ingestion to the existing authenticated local Purplemux endpoint.
- Validate provider ID, pane/tmux identity, session UUID, JSONL path, and cwd types.
- Accept JSONL paths only under the resolved Pi sessions root unless an explicit Pi session directory is configured.
- Sanitize tool summaries and cap payload lengths.
- Do not log prompts, image data, auth files, model secrets, or complete tool outputs.
- The generated extension performs reporting only and cannot approve permissions or alter tool execution.

## Testing Strategy

Unit tests:

- session ID/path parsing
- process matching and launch/resume command quoting
- session detection by explicit ID, cwd, process start time, and delayed file creation
- version 3 tree reconstruction and branch selection
- malformed/truncated JSONL handling
- message, thinking, tool-call, result, custom, and compaction mapping
- runtime state transitions and stale-event fallback
- history statistics and touched-file extraction
- extension payload validation and sanitization

Integration tests:

- launch Pi through a pseudo-terminal with a test session directory
- receive extension events through the authenticated endpoint
- reconnect Purplemux and rebuild state from JSONL
- resume a known Pi session
- verify Claude and Codex behavior remains unchanged

UI tests:

- create Pi panel
- switch Terminal/Chat on desktop and mobile breakpoints
- list/filter Pi sessions and resume one
- render running, busy, tool, settled, stopped, and degraded-extension states

## Rollout and Compatibility

The initial rollout supports the installed earendil-works Pi session format version 3 while retaining a basic linear parser for older files. Pi support should be feature-detected through preflight and must not affect systems without Pi installed.

The generated extension and parser should tolerate additive fields. Unknown entry and event types are ignored rather than treated as fatal. A Pi upgrade that changes core session semantics should surface a degraded parsing warning while leaving the terminal usable.

## Acceptance Criteria

- A user can create a Pi panel and interact with the normal Pi TUI.
- Purplemux associates the panel with the correct Pi session and shows the same conversation in Chat view.
- Busy/tool/settled states update promptly when the extension is available.
- Killing or exiting Pi clears the live state without losing history.
- Existing Pi sessions appear in Sessions and resume with `pi --session <id>`.
- Branching and compaction do not duplicate abandoned conversation branches in the active timeline.
- Mobile Terminal/Chat switching works for Pi.
- Disabling or breaking the generated extension leaves terminal operation and JSONL history functional.
- Claude and Codex tests continue to pass.
