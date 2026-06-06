import type { NextApiRequest, NextApiResponse } from 'next';
import { addSubscription, removeSubscription, listDeviceEndpoints } from '@/lib/push-subscriptions';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    return res.status(200).json({ devices: await listDeviceEndpoints() });
  }

  if (req.method === 'POST') {
    const sub = req.body;
    if (!sub?.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await addSubscription(sub);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body ?? {};
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }
    await removeSubscription(endpoint);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
