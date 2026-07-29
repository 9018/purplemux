export const fetchPiLaunchCommand = async (
  workspaceId?: string | null,
  resumeSessionId?: string | null,
): Promise<string> => {
  const res = await fetch('/api/pi/launch-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId: workspaceId ?? null, resumeSessionId: resumeSessionId ?? null }),
  });
  if (!res.ok) throw new Error('Failed to build Pi launch command');
  const data = await res.json() as { command?: unknown };
  if (typeof data.command !== 'string' || !data.command.trim()) {
    throw new Error('Invalid Pi launch command response');
  }
  return data.command;
};

