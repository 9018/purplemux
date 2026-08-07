import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';
import { isRequestAllowed } from '@/lib/access-filter';
import { translateClaudeHookEvent } from '@/lib/providers/claude/hook-handler';
import { processCodexHookPayload, shouldEmitCodexHookEvent } from '@/lib/providers/codex/hook-handler';
import { codexHookEvents } from '@/lib/providers/codex/hook-events';
import {
  translatePiHookEvent,
  processHookSessionSwitch,
} from '@/lib/providers/pi/hook-handler';
import { piHookEvents } from '@/lib/providers/pi/hook-events';

const log = createLogger('hooks');

const handleClaudeHook = (req: NextApiRequest, res: NextApiResponse) => {
  const { event, session, notificationType } = req.body ?? {};
  if (typeof event === 'string' && event !== 'poll' && typeof session === 'string' && session) {
    const type = typeof notificationType === 'string' && notificationType ? notificationType : undefined;
    log.debug({ event, session, notificationType: type }, `received ${event}${type ? `(${type})` : ''}`);
    const workEvent = translateClaudeHookEvent(event, type);
    if (workEvent) {
      getStatusManager().handleProviderEvent('claude', session, workEvent);
    } else {
      log.debug({ event, session, notificationType: type }, 'unknown claude hook event, ignoring');
    }
  } else {
    log.debug({ body: req.body }, 'poll trigger');
    getStatusManager().poll().catch((err) => {
      log.error({ err }, 'Poll trigger failed');
    });
  }
  return res.status(204).end();
};

const handleCodexHook = (req: NextApiRequest, res: NextApiResponse) => {
  const tmuxSession = req.query.tmuxSession;
  if (typeof tmuxSession !== 'string' || !tmuxSession) {
    log.warn({ event: req.body?.hook_event_name }, 'codex hook missing tmuxSession');
    return res.status(400).json({ error: 'missing tmuxSession' });
  }
  const payload = req.body ?? {};
  log.debug(
    { tmuxSession, event: payload.hook_event_name, source: payload.source },
    `codex ${payload.hook_event_name ?? 'unknown'}`,
  );
  const statusManager = getStatusManager();
  const { result, translation } = processCodexHookPayload(payload);
  const applied = translation.meta
    ? statusManager.applyAgentHookMeta('codex', tmuxSession, translation.meta)
    : null;
  if (!applied) {
    log.debug({ tmuxSession, event: payload.hook_event_name, reason: 'unknown-session' }, 'codex hook skipped');
    return res.status(204).end();
  }
  if (translation.sessionInfo) {
    codexHookEvents.emit('session-info', tmuxSession, translation.sessionInfo);
    if (translation.clearSession) codexHookEvents.emit('session-clear', tmuxSession);
  }
  if (!result.ok) {
    log.debug({ tmuxSession, event: payload.hook_event_name, reason: result.reason }, 'codex hook skipped');
  }
  if (translation.event && shouldEmitCodexHookEvent(payload, applied.cliState)) {
    statusManager.handleProviderEvent('codex', tmuxSession, translation.event);
  }
  return res.status(204).end();
};

const handlePiHook = async (req: NextApiRequest, res: NextApiResponse, providerId = 'pi') => {
  const tmuxSession = req.query.tmuxSession;
  if (typeof tmuxSession !== 'string' || !tmuxSession) {
    log.warn({ event: req.body?.event }, `${providerId} hook missing tmuxSession`);
    return res.status(400).json({ error: 'missing tmuxSession' });
  }
  log.debug({ event: req.body?.event, tmuxSession }, `${providerId} hook received`);
  // TUI in-app session switch (e.g. /resume) fires session_before_switch with
  // the target jsonl path before re-binding the session. Resolve the session
  // meta from that file so the tab immediately follows the new session.
  if (req.body?.event === 'session_before_switch') {
    const target = typeof req.body.targetSessionFile === 'string' ? req.body.targetSessionFile : null;
    if (target) {
      const meta = await processHookSessionSwitch(target);
      if (meta) {
        log.debug({ tmuxSession, sessionId: meta.sessionId, jsonlPath: meta.jsonlPath }, `${providerId} session switch applied`);
        getStatusManager().applyAgentHookMeta(providerId, tmuxSession, meta);
        return res.status(204).end();
      }
    }
  }
  const translation = translatePiHookEvent(req.body ?? {});
  const statusManager = getStatusManager();
  const applied = translation.meta
    ? statusManager.applyAgentHookMeta(providerId, tmuxSession, translation.meta)
    : true;
  if (!applied) {
    log.debug({ tmuxSession, event: req.body?.event, reason: 'unknown-session' }, `${providerId} hook skipped`);
    return res.status(204).end();
  }
  if (translation.sessionInfo) piHookEvents.emit('session-info', tmuxSession, translation.sessionInfo);
  if (translation.event) statusManager.handleProviderEvent(providerId, tmuxSession, translation.event);
  return res.status(204).end();
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!isRequestAllowed(req.socket.remoteAddress)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const provider = typeof req.query.provider === 'string' ? req.query.provider : 'claude';
  if (provider === 'codex') return handleCodexHook(req, res);
  if (provider === 'pi') return await handlePiHook(req, res, 'pi');
  if (provider === 'omp') return await handlePiHook(req, res, 'omp');
  return handleClaudeHook(req, res);
};

export default handler;
