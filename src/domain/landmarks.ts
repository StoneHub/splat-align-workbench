import type { Vec3 } from './sim3';

export type LandmarkQuality = 'unset' | 'good' | 'outlier';

export interface LandmarkPair {
  id: string;
  target?: Vec3;
  source?: Vec3;
  label?: string;
  kind?: 'match' | 'join' | 'direction' | 'plane';
  enabled: boolean;
  residual?: number;
  quality: LandmarkQuality;
}

export interface CompleteLandmarkPair {
  id: string;
  target: Vec3;
  source: Vec3;
}

export const createEmptyPairs = (): LandmarkPair[] => [
  { id: 'A', enabled: true, quality: 'unset' },
  { id: 'B', enabled: true, quality: 'unset' },
  { id: 'C', enabled: true, quality: 'unset' }
];

export function setLandmarkPoint(
  pairs: LandmarkPair[],
  id: string,
  side: 'target' | 'source',
  point: Vec3
): LandmarkPair[] {
  const exists = pairs.some(pair => pair.id === id);
  const nextPair: LandmarkPair = { id, enabled: true, quality: 'unset', [side]: point };
  if (!exists) return [...pairs, nextPair];
  return pairs.map(pair => pair.id === id ? { ...pair, [side]: point, quality: pair.quality === 'outlier' ? 'outlier' : 'unset' } : pair);
}

export function toggleLandmark(pairs: LandmarkPair[], id: string, enabled: boolean): LandmarkPair[] {
  return pairs.map(pair => pair.id === id ? { ...pair, enabled } : pair);
}

export function completeEnabledPairs(pairs: LandmarkPair[]): CompleteLandmarkPair[] {
  return pairs
    .filter(pair => pair.enabled && pair.target && pair.source)
    .map(pair => ({ id: pair.id, target: pair.target as Vec3, source: pair.source as Vec3 }));
}

export function flagResiduals(pairs: LandmarkPair[], residualById: Record<string, number>, threshold: number): LandmarkPair[] {
  return pairs.map(pair => {
    const residual = residualById[pair.id];
    if (residual === undefined) return pair;
    return {
      ...pair,
      residual,
      quality: residual > threshold ? 'outlier' : 'good'
    };
  });
}

export function nextLandmarkId(pairs: LandmarkPair[]): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of alphabet) {
    if (!pairs.some(pair => pair.id === letter)) return letter;
  }
  return `P${pairs.length + 1}`;
}
