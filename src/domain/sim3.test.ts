import { describe, expect, it } from 'vitest';
import { applySim3, solveSim3, type Mat3, type Vec3 } from './sim3';

const closeVec = (actual: Vec3, expected: Vec3, precision = 5) => {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
};

const rotationZ90: Mat3 = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, 1]
];

const transformPoint = (point: Vec3): Vec3 => {
  const x = rotationZ90[0][0] * point[0] + rotationZ90[0][1] * point[1] + rotationZ90[0][2] * point[2];
  const y = rotationZ90[1][0] * point[0] + rotationZ90[1][1] * point[1] + rotationZ90[1][2] * point[2];
  const z = rotationZ90[2][0] * point[0] + rotationZ90[2][1] * point[1] + rotationZ90[2][2] * point[2];
  return [2 * x + 10, 2 * y - 3, 2 * z + 5];
};

describe('solveSim3', () => {
  it('recovers rotation, translation, and scale from distributed landmarks', () => {
    const source: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [2, 1, 3]
    ];
    const target = source.map(transformPoint);

    const result = solveSim3(source, target);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.transform.scale).toBeCloseTo(2, 6);
    closeVec(result.transform.translation, [10, -3, 5]);
    source.forEach((point, index) => closeVec(applySim3(result.transform, point), target[index]));
    expect(result.rmse).toBeLessThan(1e-8);
    expect(result.warnings).toEqual([]);
  });

  it('reports residuals for noisy landmarks', () => {
    const source: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [2, 1, 3]
    ];
    const target = source.map(transformPoint);
    target[4] = [target[4][0] + 2, target[4][1], target[4][2]];

    const result = solveSim3(source, target);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.rmse).toBeGreaterThan(0);
    expect(result.residuals[4]).toBeGreaterThan(0.05);
  });

  it('warns when landmarks are coplanar', () => {
    const source: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [2, 2, 0]
    ];
    const target = source.map(transformPoint);

    const result = solveSim3(source, target);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.warnings).toContain('coplanar-landmarks');
  });

  it('rejects collinear landmarks', () => {
    const result = solveSim3(
      [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
      [[10, 0, 0], [12, 0, 0], [14, 0, 0]]
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toContain('collinear');
  });

  it('rejects mismatched counts and fewer than three pairs', () => {
    expect(solveSim3([[0, 0, 0]], [[1, 1, 1]]).ok).toBe(false);
    expect(solveSim3([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[1, 1, 1]]).ok).toBe(false);
  });
});
