import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const safeId = (value: string): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('unsafe Codex session id');
  return value;
};

const pidAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
};

export interface IInputLeaseRecord {
  version: 1;
  native_session_id: string;
  owner: string;
  pid: number;
  token: string;
  acquired_at_ms: number;
  expires_at_ms: number;
}

export const createCodexInputLease = ({
  root = path.join(os.homedir(), '.codex', 'shared-control'),
  owner = 'purplemux',
  ttlMs = 5_000,
}: { root?: string; owner?: string; ttlMs?: number } = {}) => {
  const pathFor = (id: string): string => path.join(root, `${safeId(id)}.lease.json`);
  const stale = (record: IInputLeaseRecord | null): boolean => Boolean(
    !record || record.expires_at_ms <= Date.now()
      || (record.pid !== process.pid && !pidAlive(record.pid)),
  );

  const acquire = async (nativeSessionId: string): Promise<{
    acquired: boolean;
    token?: string;
    path: string;
    record?: IInputLeaseRecord | null;
    reason?: 'busy';
  }> => {
    const id = safeId(nativeSessionId);
    await fs.mkdir(root, { recursive: true });
    const leasePath = pathFor(id);
    const now = Date.now();
    const record: IInputLeaseRecord = {
      version: 1,
      native_session_id: id,
      owner,
      pid: process.pid,
      token: randomUUID(),
      acquired_at_ms: now,
      expires_at_ms: now + Math.max(1, Number(ttlMs) || 5_000),
    };
    try {
      const handle = await fs.open(leasePath, 'wx');
      try { await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8'); } finally { await handle.close(); }
      return { acquired: true, token: record.token, path: leasePath, record };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      let existing: IInputLeaseRecord | null = null;
      try { existing = JSON.parse(await fs.readFile(leasePath, 'utf8')) as IInputLeaseRecord; } catch { }
      if (stale(existing)) {
        await fs.rm(leasePath, { force: true });
        return acquire(id);
      }
      return { acquired: false, reason: 'busy', path: leasePath, record: existing };
    }
  };

  return {
    root,
    pathFor,
    acquire,
    async release(nativeSessionId: string, token: string): Promise<boolean> {
      const leasePath = pathFor(nativeSessionId);
      let existing: IInputLeaseRecord;
      try { existing = JSON.parse(await fs.readFile(leasePath, 'utf8')) as IInputLeaseRecord; } catch { return false; }
      if (!token || existing.token !== token) return false;
      await fs.rm(leasePath, { force: true });
      return true;
    },
    async withLease<T>(nativeSessionId: string, fn: () => Promise<T>): Promise<T> {
      const held = await acquire(nativeSessionId);
      if (!held.acquired) {
        const error = new Error(`Codex session input is busy: ${nativeSessionId}`);
        (error as Error & { code?: string; lease?: IInputLeaseRecord | null }).code = 'codex_session_input_busy';
        (error as Error & { lease?: IInputLeaseRecord | null }).lease = held.record;
        throw error;
      }
      try { return await fn(); } finally { await this.release(nativeSessionId, held.token!); }
    },
  };
};
