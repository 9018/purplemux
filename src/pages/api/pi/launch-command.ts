import type { NextApiRequest, NextApiResponse } from 'next';
import { piProvider } from '@/lib/providers/pi';
import { checkAgentAvailabilityForPanelType, toAgentAvailabilityError } from '@/lib/agent-availability';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('pi-launch-command');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = req.body as { workspaceId?: unknown; resumeSessionId?: unknown } | undefined;
  const bodyWorkspaceId = typeof body?.workspaceId === 'string' && body.workspaceId.trim()
    ? body.workspaceId.trim()
    : null;
  const resumeSessionId = typeof body?.resumeSessionId === 'string' && body.resumeSessionId.trim()
    ? body.resumeSessionId.trim()
    : null;
  const workspaceId = bodyWorkspaceId ?? await getActiveWorkspaceId();
  try {
    const availability = await checkAgentAvailabilityForPanelType(piProvider.panelType);
    if (!availability.ok) return res.status(availability.status).json(toAgentAvailabilityError(availability));
    const command = resumeSessionId
      ? await piProvider.buildResumeCommand(resumeSessionId, { workspaceId: workspaceId ?? undefined })
      : await piProvider.buildLaunchCommand({ workspaceId: workspaceId ?? undefined });
    return res.status(200).json({ command });
  } catch (err) {
    log.error(`pi launch command build failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to build Pi launch command' });
  }
};

export default handler;

