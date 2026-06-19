import { describe, expect, it } from 'vitest';
import { parsePlyHeader } from '../domain/ply';
import { applySim3, solveSim3, type Vec3 } from '../domain/sim3';
import { loadSplatCloudFromPly } from '../rendering/splatData';
import { createSyntheticAlignmentFixture } from './syntheticSplat';

const closeVec = (actual: Vec3, expected: Vec3, precision = 5) => {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
};

describe('createSyntheticAlignmentFixture', () => {
  it('creates PlayCanvas-compatible target/source PLY files with a known landmark transform', () => {
    const fixture = createSyntheticAlignmentFixture();
    const targetHeader = parsePlyHeader(fixture.files.target.buffer);
    const sourceHeader = parsePlyHeader(fixture.files.source.buffer);

    expect(targetHeader.format).toBe('binary_little_endian');
    expect(sourceHeader.format).toBe('binary_little_endian');
    expect(targetHeader.vertexCount).toBeGreaterThan(250);
    expect(sourceHeader.vertexCount).toBeGreaterThan(250);
    expect(sourceHeader.vertexCount).not.toBe(targetHeader.vertexCount);
    expect(targetHeader.properties).toEqual([
      'x', 'y', 'z',
      'f_dc_0', 'f_dc_1', 'f_dc_2',
      'opacity',
      'scale_0', 'scale_1', 'scale_2',
      'rot_0', 'rot_1', 'rot_2', 'rot_3'
    ]);

    const targetCloud = loadSplatCloudFromPly(fixture.files.target.buffer);
    const sourceCloud = loadSplatCloudFromPly(fixture.files.source.buffer);
    expect(targetCloud.radius).toBeGreaterThan(1);
    expect(sourceCloud.radius).toBeGreaterThan(1);

    const sourceLandmarks = fixture.manifest.landmarks.map(landmark => landmark.source);
    const targetLandmarks = fixture.manifest.landmarks.map(landmark => landmark.target);
    const result = solveSim3(sourceLandmarks, targetLandmarks);

    expect(fixture.manifest.landmarks).toHaveLength(5);
    expect(fixture.manifest.overlap.sharedElements.length).toBeGreaterThan(2);
    expect(fixture.manifest.overlap.sourceOnlyElements.length).toBeGreaterThan(0);
    expect(fixture.manifest.overlap.targetOnlyElements.length).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.transform.scale).toBeCloseTo(fixture.manifest.knownSourceToTarget.scale, 6);
    sourceLandmarks.forEach((point, index) => closeVec(applySim3(result.transform, point), targetLandmarks[index]));
    expect(result.rmse).toBeLessThan(1e-6);
    expect(result.warnings).toEqual([]);
  });
});
