import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PI_EXTENSION_SOURCE } from '@/lib/providers/pi/extension';

const PURPLEMUX_DIR = path.join(os.homedir(), '.purplemux');

// OMP shares pi's hook/extension protocol (it is a fork that writes to the
// same ~/.pi/agent/sessions directory). Only the reported provider identity
// differs so purplemux can route status hooks to the dedicated omp provider.
export const OMP_EXTENSION_PATH = path.join(PURPLEMUX_DIR, 'omp-extension.ts');
export const OMP_EXTENSION_SOURCE = PI_EXTENSION_SOURCE.replaceAll('provider=pi', 'provider=omp');

export const ensureOmpExtension = async (): Promise<string> => {
  await fs.mkdir(PURPLEMUX_DIR, { recursive: true, mode: 0o700 });
  try {
    if ((await fs.readFile(OMP_EXTENSION_PATH, 'utf-8')) === OMP_EXTENSION_SOURCE) {
      await fs.chmod(OMP_EXTENSION_PATH, 0o700).catch(() => {});
      return OMP_EXTENSION_PATH;
    }
  } catch {
    // Write or refresh the generated extension below.
  }
  await fs.writeFile(OMP_EXTENSION_PATH, OMP_EXTENSION_SOURCE, { mode: 0o700 });
  await fs.chmod(OMP_EXTENSION_PATH, 0o700);
  return OMP_EXTENSION_PATH;
};