import { describe, expect, it } from 'vitest';
import { canSolveForMode, createPairsForMode, landmarkModeCopy, nextPairForMode } from './alignmentMode';

describe('alignmentMode', () => {
  it('creates overlap landmark rows for matching shared points', () => {
    const pairs = createPairsForMode('overlap');

    expect(pairs.map(pair => pair.id)).toEqual(['A', 'B', 'C']);
    expect(pairs.map(pair => pair.label)).toEqual(['Match point', 'Match point', 'Match point']);
    expect(landmarkModeCopy('overlap').needsText).toBe('Needs 3 matching pairs');
  });

  it('creates stitch rows for join, direction, and plane continuity constraints', () => {
    const pairs = createPairsForMode('stitch');

    expect(pairs.map(pair => pair.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(pairs.map(pair => pair.label)).toEqual(['Join seam', 'Direction guide', 'Plane guide 1', 'Plane guide 2']);
    expect(landmarkModeCopy('stitch').needsText).toBe('Needs join, direction, and plane guides');
    expect(nextPairForMode('stitch', pairs)).toMatchObject({
      id: 'E',
      label: 'Plane guide 3',
      enabled: true,
      quality: 'unset'
    });
  });

  it('requires the full stitch constraint set before solving stitch mode', () => {
    const complete = createPairsForMode('stitch').map((pair, index) => ({
      ...pair,
      source: [index, index + 1, index + 2] as [number, number, number],
      target: [index + 3, index + 4, index + 5] as [number, number, number]
    }));

    expect(canSolveForMode('stitch', complete.slice(0, 3))).toBe(false);
    expect(canSolveForMode('stitch', complete.map(pair => pair.kind === 'direction' ? { ...pair, enabled: false } : pair))).toBe(false);
    expect(canSolveForMode('stitch', complete)).toBe(true);
    expect(canSolveForMode('overlap', complete.slice(0, 3))).toBe(true);
  });
});
