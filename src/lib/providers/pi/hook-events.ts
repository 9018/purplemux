import { EventEmitter } from 'events';
import type { ISessionInfo } from '@/types/timeline';

interface IPiHookEvents {
  on(event: 'session-info', listener: (tmuxSession: string, info: ISessionInfo) => void): this;
  emit(event: 'session-info', tmuxSession: string, info: ISessionInfo): boolean;
  off(event: 'session-info', listener: (tmuxSession: string, info: ISessionInfo) => void): this;
}

const g = globalThis as unknown as { __ptPiHookEvents?: EventEmitter };
if (!g.__ptPiHookEvents) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  g.__ptPiHookEvents = emitter;
}
export const piHookEvents = g.__ptPiHookEvents as unknown as IPiHookEvents;

