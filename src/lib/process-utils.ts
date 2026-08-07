import fs from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { isLinux } from '@/lib/platform';

const execFile = promisify(execFileCb);

export const isProcessRunning = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    execFileCb('ps', ['-p', String(pid)], (err) => {
      resolve(!err);
    });
  });

export const getChildPids = async (parentPid: number): Promise<number[]> => {
  try {
    const { stdout } = await execFile('pgrep', ['-P', String(parentPid)]);
    return stdout.trim().split('\n').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
};

export const getProcessCwd = async (pid: number): Promise<string | null> => {
  if (isLinux) {
    try {
      return await fs.readlink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  try {
    const { stdout } = await execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n/'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
};

export const parseSemanticVersion = (stdout: string): string | null =>
  stdout.trim().match(/(\d+\.\d+[\d.]*)/)?.[1] ?? null;

export const getProcessArgs = async (
  pid: number | string,
  options?: { timeoutMs?: number },
): Promise<string | null> => {
  try {
    const { stdout } = await execFile(
      'ps', ['-p', String(pid), '-o', 'args='],
      options?.timeoutMs ? { timeout: options.timeoutMs } : {},
    );
    return stdout.trim();
  } catch {
    return null;
  }
};

export const getProcessStartTimeMs = async (
  pid: number | string,
  options?: { timeoutMs?: number },
): Promise<number | null> => {
  try {
    const [stat, procStat] = await Promise.all([
      fs.readFile(`/proc/${pid}/stat`, 'utf8'),
      fs.readFile('/proc/stat', 'utf8'),
    ]);
    // comm may contain spaces/parens; slice after the last ')' then fields
    // 3..N of /proc/pid/stat. starttime is field 22 => index 19 after comm.
    const afterComm = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
    const starttime = Number(afterComm[19]);
    const btime = Number(/\nbtime (\d+)/.exec(procStat)?.[1]);
    if (!Number.isFinite(starttime) || !Number.isFinite(btime)) return null;
    const CLK_TCK = 100;
    return (btime + starttime / CLK_TCK) * 1000;
  } catch {
    return null;
  }
};
