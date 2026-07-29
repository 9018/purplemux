import type { NextApiRequest, NextApiResponse } from 'next';
import { listPiSessions } from '@/lib/pi-session-list';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/pi/sessions');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : '';
  if (!cwd) return res.status(400).json({ error: 'missing-param', message: 'cwd parameter required' });
  try {
    return res.status(200).json(await listPiSessions({ cwd }));
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, 'pi session scan failed');
    return res.status(500).json({ error: 'scan-failed', message: 'Failed to scan Pi sessions' });
  }
};

export default handler;

