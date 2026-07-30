import fs from 'fs/promises';
import path from 'path';

export interface ISharedCodexSession {
  control_session_id: string;
  native_session_id: string | null;
  native_session_path?: string | null;
  cwd: string;
  worktree_path?: string | null;
  tmux_socket?: string | null;
  tmux_session_name: string;
  status?: string | null;
  [key: string]: unknown;
}

const DEFAULT_MANIFEST_RELATIVE = path.join('.gptwork', 'codex-sessions', 'manifests');

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalize = (value: Record<string, unknown>): ISharedCodexSession | null => {
  if (typeof value.control_session_id !== 'string' || !value.control_session_id) return null;
  if (typeof value.cwd !== 'string' || !value.cwd) return null;
  if (typeof value.tmux_session_name !== 'string' || !value.tmux_session_name) return null;
  return {
    ...value,
    control_session_id: value.control_session_id,
    native_session_id: typeof value.native_session_id === 'string' ? value.native_session_id : null,
    native_session_path: typeof value.native_session_path === 'string' ? value.native_session_path : null,
    cwd: path.resolve(value.cwd),
    tmux_socket: typeof value.tmux_socket === 'string' ? value.tmux_socket : 'purple',
    tmux_session_name: value.tmux_session_name,
  } as ISharedCodexSession;
};

export const manifestRootsForCwd = async (cwd: string): Promise<string[]> => {
  const roots: string[] = [];
  let current = path.resolve(cwd);
  while (true) {
    roots.push(path.join(current, DEFAULT_MANIFEST_RELATIVE));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
};

export const listSharedCodexSessions = async (
  manifestsRoot: string,
): Promise<ISharedCodexSession[]> => {
  const entries = await fs.readdir(manifestsRoot, { withFileTypes: true }).catch(() => []);
  const values: ISharedCodexSession[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(manifestsRoot, entry.name), 'utf8').catch(() => null);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw);
      const session = isObject(value) ? normalize(value) : null;
      if (session) values.push(session);
    } catch {
      // Ignore a manifest while it is being atomically replaced.
    }
  }
  return values;
};

export const findSharedCodexSession = async (
  cwd: string,
  {
    manifestsRoot,
    nativeSessionId,
    tmuxSessionName,
  }: { manifestsRoot?: string; nativeSessionId?: string | null; tmuxSessionName?: string | null } = {},
): Promise<ISharedCodexSession | null> => {
  const roots = manifestsRoot ? [manifestsRoot] : await manifestRootsForCwd(cwd);
  const expectedCwd = path.resolve(cwd);
  for (const root of roots) {
    for (const session of await listSharedCodexSessions(root)) {
      const sessionCwd = path.resolve(session.cwd || session.worktree_path || '');
      if (sessionCwd !== expectedCwd) continue;
      if (nativeSessionId && session.native_session_id !== nativeSessionId) continue;
      if (tmuxSessionName && session.tmux_session_name !== tmuxSessionName) continue;
      return session;
    }
  }
  return null;
};

export const findSharedCodexSessionByTmuxName = async (
  tmuxSessionName: string,
  cwd: string,
): Promise<ISharedCodexSession | null> => {
  const roots = await manifestRootsForCwd(cwd);
  for (const root of roots) {
    const sessions = await listSharedCodexSessions(root);
    const match = sessions.find((session) => session.tmux_session_name === tmuxSessionName);
    if (match && path.resolve(match.cwd) === path.resolve(cwd)) return match;
  }
  return null;
};

export const findSharedCodexSessionByNativeId = async (
  nativeSessionId: string,
  cwd: string,
): Promise<ISharedCodexSession | null> =>
  findSharedCodexSession(cwd, { nativeSessionId });
