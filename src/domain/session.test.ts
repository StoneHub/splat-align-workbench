import { describe, expect, it } from 'vitest';
import { createSession, serializeSession } from './session';

describe('alignment sessions', () => {
  it('round-trips without raw file names or splat data', () => {
    const session = createSession({
      target: { fileType: 'ply', sizeBucket: '100MB-1GB', splatCountBucket: '1M-5M' },
      source: { fileType: 'ply', sizeBucket: '100MB-1GB', splatCountBucket: '1M-5M' },
      landmarks: [],
      createdAt: '2026-06-15T12:00:00.000Z'
    });

    const json = serializeSession(session);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(json).not.toContain('starter-20260607');
    expect(json).not.toContain('component-3_5000');
  });
});
