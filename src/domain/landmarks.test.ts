import { describe, expect, it } from 'vitest';
import { completeEnabledPairs, createEmptyPairs, flagResiduals, nextLandmarkId, setLandmarkPoint, toggleLandmark } from './landmarks';

describe('landmarks', () => {
  it('sets target/source points and returns complete enabled pairs', () => {
    let pairs = createEmptyPairs();
    pairs = setLandmarkPoint(pairs, 'A', 'target', [0, 0, 0]);
    pairs = setLandmarkPoint(pairs, 'A', 'source', [1, 1, 1]);

    expect(completeEnabledPairs(pairs)).toEqual([{ id: 'A', target: [0, 0, 0], source: [1, 1, 1] }]);
  });

  it('disables pairs and flags high residuals', () => {
    let pairs = createEmptyPairs();
    pairs = flagResiduals(pairs, { A: 0.01, B: 0.5 }, 0.2);
    pairs = toggleLandmark(pairs, 'B', false);

    expect(pairs.find(pair => pair.id === 'A')?.quality).toBe('good');
    expect(pairs.find(pair => pair.id === 'B')?.quality).toBe('outlier');
    expect(pairs.find(pair => pair.id === 'B')?.enabled).toBe(false);
  });

  it('chooses the next readable landmark id', () => {
    expect(nextLandmarkId(createEmptyPairs())).toBe('D');
  });
});
