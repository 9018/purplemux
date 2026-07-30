import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionCwd, hasSession, sendRawKeys } from '@/lib/tmux';
import { findSharedCodexSession } from '@/lib/providers/codex/shared-session';
import { createCodexInputLease } from '@/lib/providers/codex/input-lease';
import { createLogger } from '@/lib/logger';

const log = createLogger('tmux');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session, input } = req.body as { session?: string; input?: string };

  if (!session || !input) {
    return res.status(400).json({ error: 'session and input parameters required' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const cwd = await getSessionCwd(session);
    const shared = cwd ? await findSharedCodexSession(cwd, { tmuxSessionName: session }) : null;
    if (shared?.native_session_id || shared?.control_session_id) {
      const lease = createCodexInputLease({ owner: 'purplemux' });
      const leaseId = shared.native_session_id || shared.control_session_id;
      await lease.withLease(leaseId, () => sendRawKeys(session, input));
    } else {
      await sendRawKeys(session, input);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if ((err as { code?: string })?.code === 'codex_session_input_busy') {
      return res.status(409).json({ error: 'input-busy', retryable: true });
    }
    log.error(`send-input failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to send input' });
  }
};

export default handler;
