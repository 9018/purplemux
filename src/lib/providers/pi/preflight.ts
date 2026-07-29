import { execFile as execFileCb } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getShellPath } from '@/lib/preflight';
import { parseSemanticVersion } from '@/lib/process-utils';
import type { IAgentPreflight } from '@/lib/providers/types';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 5_000;
const AUTH_PATH = path.join(os.homedir(), '.pi', 'agent', 'auth.json');
const API_KEY_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
  'ZAI_API_KEY',
  'MOONSHOT_API_KEY',
  'MISTRAL_API_KEY',
] as const;

export const runPiPreflight = async (): Promise<IAgentPreflight> => {
  const resolvedPath = await getShellPath();
  const env = { ...process.env, PATH: resolvedPath };
  let installed = false;
  let version: string | null = null;
  let binaryPath: string | null = null;
  try {
    const { stdout } = await execFile('pi', ['--version'], { timeout: CMD_TIMEOUT, env });
    installed = true;
    version = parseSemanticVersion(stdout);
  } catch {
    return { installed: false, version: null, binaryPath: null, loggedIn: false };
  }
  try {
    const { stdout } = await execFile('which', ['pi'], { timeout: CMD_TIMEOUT, env });
    binaryPath = stdout.trim() || null;
  } catch {
    binaryPath = null;
  }
  let hasAuthFile = false;
  try {
    await fs.access(AUTH_PATH);
    hasAuthFile = true;
  } catch {
    // Auth can also be supplied through provider environment variables.
  }
  const loggedIn = hasAuthFile || API_KEY_ENV_NAMES.some((name) => Boolean(process.env[name]));
  return { installed, version, binaryPath, loggedIn };
};

