import type { LandmarkPair } from '../domain/landmarks';
import type { Mat3, Sim3Success, Sim3Transform, Vec3 } from '../domain/sim3';

const cloneVec3 = (value: Vec3): Vec3 => [...value];
const cloneMat3 = (value: Mat3): Mat3 => value.map(row => cloneVec3(row)) as Mat3;

const cloneTransform = (value: Sim3Transform): Sim3Transform => ({
  scale: value.scale,
  rotation: cloneMat3(value.rotation),
  translation: cloneVec3(value.translation)
});

export const cloneLandmarkPairs = (pairs: LandmarkPair[]): LandmarkPair[] => pairs.map(pair => ({
  ...pair,
  target: pair.target ? cloneVec3(pair.target) : undefined,
  source: pair.source ? cloneVec3(pair.source) : undefined
}));

export const cloneAlignment = (alignment: Sim3Success | null): Sim3Success | null => alignment ? {
  ok: true,
  transform: cloneTransform(alignment.transform),
  residuals: [...alignment.residuals],
  rmse: alignment.rmse,
  warnings: [...alignment.warnings]
} : null;
