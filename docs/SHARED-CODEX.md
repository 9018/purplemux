# Shared GPTWork Codex sessions

purplemux and GPTWork can operate on one native Codex session:

```text
GPTWork -> tmux -L purple -> one Codex process / one PTY
purplemux ----------------^       ^
                           same native ~/.codex/sessions/**/*.jsonl
```

## Setup

1. Start GPTWork with `GPTWORK_CODEX_TUI_TRANSPORT=tmux`.
2. Keep the GPTWork workspace and purplemux tab on the same `cwd`.
3. Ensure both use the `purple` tmux socket.
4. Open the matching `pt-gptwork-*` session from purplemux's session list, or create a Codex tab using the native session ID.

GPTWork writes a binding manifest at:

```text
.gptwork/codex-sessions/manifests/<control-session-id>.json
```

The manifest includes `native_session_id`, `cwd`, `tmux_socket`, and `tmux_session_name`. purplemux validates the cwd before adopting the session.

## Input coordination

Both applications can send normal prompts, slash commands, task deltas, and corrections. Each write takes a short lease at:

```text
~/.codex/shared-control/<native-session-id>.lease.json
```

The lease prevents two byte sequences from interleaving. It is not an ownership lock: either GPTWork or purplemux may acquire it. A transient conflict is retryable; the HTTP input endpoint reports `409` with `{ "error": "input-busy", "retryable": true }`.

## Restart and detach behavior

- Closing a browser tab only detaches purplemux's PTY.
- Restarting GPTWork reattaches the persisted tmux session when it still exists.
- Attaching a discovered binding does not start another Codex process and does not send `codex resume`.
- Removing a shared purplemux tab does not kill the GPTWork-owned tmux session.
- If the owner tmux session is gone, purplemux does not manufacture an empty replacement; restart the owner/runtime explicitly.

The new GPTWork TUI flow handles work directly by default. Subagents are created only when the task entrypoint, user prompt, or an explicit required policy asks for them.
