import { describe, expect, it } from 'vitest';
import { isAgentPanelType } from '@/lib/agent-check';

describe('Pi agent check response', () => {
  it('recognizes the Pi provider panel type', () => {
    expect(isAgentPanelType('pi-cli')).toBe(true);
  });
});
