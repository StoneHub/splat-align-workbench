import { describe, expect, it } from 'vitest';
import { parsePlyHeader } from '../domain/ply';
import { applySim3, solveSim3, type Vec3 } from '../domain/sim3';
import { createSyntheticStitchFixture } from './syntheticSplat';

const closeVec = (actual: Vec3, expected: Vec3, precision = 5) => {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
};

describe('createSyntheticStitchFixture', () => {
  it('creates adjacent splats with virtual correspondences that recover the known transform', () => {
    const fixture = createSyntheticStitchFixture();

    expect(fixture.manifest.fixtureName).toBe('adjacent-road-stitch-sim3');
    expect(fixture.manifest.overlap.sharedElements).toEqual([]);
    expect(fixture.manifest.stitch?.correspondences.map(pair => pair.kind)).toEqual([
      'join',
      'direction',
      'plane',
      'plane'
    ]);
    expect(parsePlyHeader(fixture.files.target.buffer).vertexCount).toBeGreaterThan(80);
    expect(parsePlyHeader(fixture.files.source.buffer).vertexCount).toBeGreaterThan(80);

    const source = fixture.manifest.landmarks.map(landmark => landmark.source);
    const target = fixture.manifest.landmarks.map(landmark => landmark.target);
    const result = solveSim3(source, target);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.transform.scale).toBeCloseTo(fixture.manifest.knownSourceToTarget.scale, 6);
    source.forEach((point, index) => closeVec(applySim3(result.transform, point), target[index]));
    expect(result.rmse).toBeLessThan(1e-6);
  });
});
