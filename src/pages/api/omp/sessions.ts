import type { NextApiRequest, NextApiResponse } from 'next';
import os from 'os';
import path from 'path';
import { listPiSessions } from '@/lib/pi-session-list';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/omp/sessions');
const OMP_SESSIONS_ROOT = path.join(os.homedir(), '.omp', 'agent', 'sessions');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : '';
  if (!cwd) return res.status(400).json({ error: 'missing-param', message: 'cwd parameter required' });
  try {
    return res.status(200).json(await listPiSessions({ cwd, sessionsRoot: OMP_SESSIONS_ROOT }));
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, 'omp session scan failed');
    return res.status(500).json({ error: 'scan-failed', message: 'Failed to scan Omp sessions' });
  }
};

export default handler;