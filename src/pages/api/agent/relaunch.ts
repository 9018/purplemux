import type { NextApiRequest, NextApiResponse } from 'next';
import { createSession, hasSession, killSession, sendKeys } from '@/lib/tmux';
import { getActiveWorkspaceId, getWorkspaceById } from '@/lib/workspace-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-relaunch');

const SHELL_READY_DELAY_MS = 700;

/**
 * Hard-relaunch an agent tab session:
 * 1. kill the live tmux session (terminates any foreground agent TUI so a
 *    stale process can never swallow the launch command as chat input),
 * 2. recreate the session anchored to the workspace root directory,
 * 3. send the launch command (which itself carries a `cd '<workspace root>' &&`
 *    prefix), guaranteeing the new agent process starts in the workspace root —
 *    never in a stale cwd like /tmp.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { sessionId, command, workspaceId: bodyWorkspaceId } = req.body ?? {};
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ error: 'missing-param', message: 'sessionId required' });
  }
  if (typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'missing-param', message: 'command required' });
  }
  const name = sessionId.trim();
  try {
    if (await hasSession(name)) {
      await killSession(name);
    }
  } catch (err) {
    log.warn(`kill failed for ${name}: ${err instanceof Error ? err.message : err}`);
  }

  const workspaceId = typeof bodyWorkspaceId === 'string' && bodyWorkspaceId.trim()
    ? bodyWorkspaceId.trim()
    : await getActiveWorkspaceId();
  const ws = workspaceId ? await getWorkspaceById(workspaceId) : undefined;
  const rootDir = ws?.directories?.[0] ?? process.env.HOME ?? '/';

  try {
    await createSession(name, 80, 24, rootDir);
    await new Promise((resolve) => setTimeout(resolve, SHELL_READY_DELAY_MS));
    await sendKeys(name, command);
    log.info(`relaunched ${name} in ${rootDir}`);
    return res.status(200).json({ ok: true, cwd: rootDir });
  } catch (err) {
    log.error(`relaunch failed for ${name}: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'relaunch-failed', message: 'Failed to relaunch agent session' });
  }
};

export default handler;