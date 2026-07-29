import path from 'path';
import os from 'os';
import fs from 'fs';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const DEFAULT_PI_SESSIONS_DIR = path.join(os.homedir(), '.pi', 'agent', 'sessions');

const piSessionsDir = (): string => {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) return process.env.PI_CODING_AGENT_SESSION_DIR;
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.pi', 'agent', 'settings.json'), 'utf-8')) as { sessionDir?: unknown };
    if (typeof settings.sessionDir === 'string' && settings.sessionDir.trim()) {
      return settings.sessionDir.replace(/^~(?=$|\/)/, os.homedir());
    }
  } catch {
    // Use Pi's default session root.
  }
  return DEFAULT_PI_SESSIONS_DIR;
};

const isWithin = (filePath: string, root: string): boolean => {
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);
  return resolved.startsWith(resolvedRoot + path.sep) && resolved.endsWith('.jsonl');
};

export const isCodexJsonlPath = (filePath: string): boolean => {
  return isWithin(filePath, CODEX_SESSIONS_DIR);
};

export const isPiJsonlPath = (filePath: string): boolean =>
  isWithin(filePath, piSessionsDir());

export const isAllowedJsonlPath = (filePath: string): boolean => {
  const resolved = path.resolve(filePath);
  if (!resolved.endsWith('.jsonl')) return false;
  return (
    resolved.startsWith(CLAUDE_PROJECTS_DIR + path.sep) ||
    resolved.startsWith(CODEX_SESSIONS_DIR + path.sep) ||
    isPiJsonlPath(filePath)
  );
};
