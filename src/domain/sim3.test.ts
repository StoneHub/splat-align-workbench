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
    source.forEach((point, index) => closeVec(applySim3(result.transform, point), target[index]));
    expect(result.transform.scale).toBeCloseTo(2, 6);
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

  it('rejects a full-rank mirrored landmark set', () => {
    const source: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [2, 1, 3]
    ];
    const target: Vec3[] = source.map(([x, y, z]) => [-x + 4, y - 2, z + 7]);

    const result = solveSim3(source, target);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toContain('mirrored transform');
  });

  it('keeps scale positive and warns on clustered landmark geometry', () => {
    const source: Vec3[] = [
      [2.191101975789722, -0.10069510210091451, 1.5658718745746516],
      [1.9455571687377549, -0.004775427114834636, 1.4830305173940994],
      [1.9829640316468697, -0.011875582016809026, 1.5031126050394181]
    ];
    const target: Vec3[] = [
      [1.2354988873755302, 1.7791961192783055, -0.2968952242858536],
      [1.200834172961698, 1.4565542884409723, -0.16002385146703804],
      [1.212291551868065, 1.5117002752987956, -0.19507706987855292]
    ];

    const result = solveSim3(source, target);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.transform.scale).toBeGreaterThan(0);
    expect(result.warnings).toContain('clustered-landmarks');
  });

  it('rejects mismatched counts and fewer than three pairs', () => {
    expect(solveSim3([[0, 0, 0]], [[1, 1, 1]]).ok).toBe(false);
    expect(solveSim3([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[1, 1, 1]]).ok).toBe(false);
  });
});
