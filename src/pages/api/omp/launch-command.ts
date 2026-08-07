import type { NextApiRequest, NextApiResponse } from 'next';
import { ompProvider } from '@/lib/providers/omp';
import { checkAgentAvailabilityForPanelType, toAgentAvailabilityError } from '@/lib/agent-availability';
import { getActiveWorkspaceId, getWorkspaceById } from '@/lib/workspace-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('omp-launch-command');

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
    const availability = await checkAgentAvailabilityForPanelType(ompProvider.panelType);
    if (!availability.ok) return res.status(availability.status).json(toAgentAvailabilityError(availability));
    let command = resumeSessionId
      ? await ompProvider.buildResumeCommand(resumeSessionId, { workspaceId: workspaceId ?? undefined })
      : await ompProvider.buildLaunchCommand({ workspaceId: workspaceId ?? undefined });
    const workspace = workspaceId ? await getWorkspaceById(workspaceId) : undefined;
    const rootDir = workspace?.directories?.[0];
    if (rootDir && command) {
      const escaped = rootDir.replace(/'/g, "'\\''");
      command = `cd '${escaped}' && ${command}`;
    }
    return res.status(200).json({ command });
  } catch (err) {
    log.error(`omp launch command build failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to build Omp launch command' });
  }
};

export default handler;