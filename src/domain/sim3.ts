export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

export interface Sim3Transform {
  scale: number;
  rotation: Mat3;
  translation: Vec3;
}

export interface Sim3Success {
  ok: true;
  transform: Sim3Transform;
  residuals: number[];
  rmse: number;
  warnings: string[];
}

export interface Sim3Failure {
  ok: false;
  reason: string;
}

export type Sim3Result = Sim3Success | Sim3Failure;

const EPSILON = 1e-10;

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scaleVec3 = (v: Vec3, scale: number): Vec3 => [v[0] * scale, v[1] * scale, v[2] * scale];
export const dotVec3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const normVec3 = (v: Vec3): number => Math.sqrt(dotVec3(v, v));

export const mulMat3Vec3 = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
];

const centroid = (points: Vec3[]): Vec3 => scaleVec3(points.reduce(addVec3, [0, 0, 0]), 1 / points.length);

const covariance = (points: Vec3[]): Mat3 => {
  const center = centroid(points);
  const cov: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const point of points) {
    const p = subVec3(point, center);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        cov[row][col] += p[row] * p[col];
      }
    }
  }
  return cov;
};

const eigenvaluesSymmetric3 = (input: Mat3): number[] => {
  const a = input.map(row => [...row]) as Mat3;

  for (let iteration = 0; iteration < 64; iteration += 1) {
    let p = 0;
    let q = 1;
    let max = Math.abs(a[p][q]);
    for (let row = 0; row < 3; row += 1) {
      for (let col = row + 1; col < 3; col += 1) {
        const value = Math.abs(a[row][col]);
        if (value > max) {
          max = value;
          p = row;
          q = col;
        }
      }
    }
    if (max < 1e-12) break;

    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];

    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let i = 0; i < 3; i += 1) {
      if (i === p || i === q) continue;
      const aip = a[i][p];
      const aiq = a[i][q];
      a[i][p] = c * aip - s * aiq;
      a[p][i] = a[i][p];
      a[i][q] = s * aip + c * aiq;
      a[q][i] = a[i][q];
    }
  }

  return [a[0][0], a[1][1], a[2][2]].sort((left, right) => right - left);
};

const rankWarnings = (source: Vec3[]): { ok: true; warnings: string[] } | { ok: false; reason: string } => {
  const eigenvalues = eigenvaluesSymmetric3(covariance(source)).map(value => Math.max(0, value));
  const max = eigenvalues[0] ?? 0;
  if (max < EPSILON) {
    return { ok: false, reason: 'source landmarks have no spatial spread' };
  }
  if ((eigenvalues[1] ?? 0) / max < 1e-7) {
    return { ok: false, reason: 'source landmarks are collinear' };
  }
  if ((eigenvalues[2] ?? 0) / max < 1e-7) {
    return { ok: true, warnings: ['coplanar-landmarks'] };
  }
  return { ok: true, warnings: [] };
};

const dominantEigenvector4 = (matrix: number[][]): [number, number, number, number] => {
  let vector = [1, 0, 0, 0];
  for (let iteration = 0; iteration < 240; iteration += 1) {
    const next = [0, 0, 0, 0];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        next[row] += matrix[row][col] * vector[col];
      }
    }
    const length = Math.hypot(next[0], next[1], next[2], next[3]);
    if (length < EPSILON) break;
    vector = next.map(value => value / length);
  }
  return [vector[0], vector[1], vector[2], vector[3]];
};

const quaternionToMat3 = ([w, x, y, z]: [number, number, number, number]): Mat3 => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
];

const rotationFromHorn = (sourceCentered: Vec3[], targetCentered: Vec3[]): Mat3 => {
  let sxx = 0, sxy = 0, sxz = 0;
  let syx = 0, syy = 0, syz = 0;
  let szx = 0, szy = 0, szz = 0;

  for (let i = 0; i < sourceCentered.length; i += 1) {
    const source = sourceCentered[i];
    const target = targetCentered[i];
    sxx += source[0] * target[0];
    sxy += source[0] * target[1];
    sxz += source[0] * target[2];
    syx += source[1] * target[0];
    syy += source[1] * target[1];
    syz += source[1] * target[2];
    szx += source[2] * target[0];
    szy += source[2] * target[1];
    szz += source[2] * target[2];
  }

  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];
  return quaternionToMat3(dominantEigenvector4(n));
};

export function applySim3(transform: Sim3Transform, point: Vec3): Vec3 {
  return addVec3(scaleVec3(mulMat3Vec3(transform.rotation, point), transform.scale), transform.translation);
}

export function solveSim3(source: Vec3[], target: Vec3[]): Sim3Result {
  if (source.length !== target.length) {
    return { ok: false, reason: 'source and target pair counts differ' };
  }
  if (source.length < 3) {
    return { ok: false, reason: 'at least three landmark pairs are required' };
  }

  const rank = rankWarnings(source);
  if (!rank.ok) return rank;

  const sourceCenter = centroid(source);
  const targetCenter = centroid(target);
  const sourceCentered = source.map(point => subVec3(point, sourceCenter));
  const targetCentered = target.map(point => subVec3(point, targetCenter));
  const rotation = rotationFromHorn(sourceCentered, targetCentered);

  const numerator = sourceCentered.reduce((sum, point, index) => {
    return sum + dotVec3(targetCentered[index], mulMat3Vec3(rotation, point));
  }, 0);
  const denominator = sourceCentered.reduce((sum, point) => sum + dotVec3(point, point), 0);
  if (Math.abs(denominator) < EPSILON) {
    return { ok: false, reason: 'source landmarks have no spatial spread' };
  }

  const scale = numerator / denominator;
  const translation = subVec3(targetCenter, scaleVec3(mulMat3Vec3(rotation, sourceCenter), scale));
  const transform = { scale, rotation, translation };
  const residuals = source.map((point, index) => normVec3(subVec3(applySim3(transform, point), target[index])));
  const rmse = Math.sqrt(residuals.reduce((sum, residual) => sum + residual * residual, 0) / residuals.length);

  return { ok: true, transform, residuals, rmse, warnings: rank.warnings };
}
