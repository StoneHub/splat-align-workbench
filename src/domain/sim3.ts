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

const clusteredWarnings = (points: Vec3[]): string[] => {
  const distances: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      distances.push(normVec3(subVec3(points[i], points[j])));
    }
  }
  const max = Math.max(...distances);
  const min = Math.min(...distances.filter(distance => distance > EPSILON));
  return Number.isFinite(min) && max > EPSILON && min / max < 0.2 ? ['clustered-landmarks'] : [];
};

interface SymmetricEigen3 {
  values: Vec3;
  vectors: Mat3;
}

const symmetricEigen3 = (input: Mat3): SymmetricEigen3 => {
  const a = input.map(row => [...row]) as Mat3;
  const eigenvectors: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

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
      if (i !== p && i !== q) {
        const aip = a[i][p];
        const aiq = a[i][q];
        a[i][p] = c * aip - s * aiq;
        a[p][i] = a[i][p];
        a[i][q] = s * aip + c * aiq;
        a[q][i] = a[i][q];
      }

      const vip = eigenvectors[i][p];
      const viq = eigenvectors[i][q];
      eigenvectors[i][p] = c * vip - s * viq;
      eigenvectors[i][q] = s * vip + c * viq;
    }
  }

  const order = [0, 1, 2].sort((left, right) => a[right][right] - a[left][left]);
  return {
    values: order.map(index => a[index][index]) as Vec3,
    vectors: [
      order.map(index => eigenvectors[0][index]) as Vec3,
      order.map(index => eigenvectors[1][index]) as Vec3,
      order.map(index => eigenvectors[2][index]) as Vec3
    ]
  };
};

const eigenvaluesSymmetric3 = (input: Mat3): number[] => symmetricEigen3(input).values;

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
    return { ok: true, warnings: ['coplanar-landmarks', ...clusteredWarnings(source)] };
  }
  return { ok: true, warnings: clusteredWarnings(source) };
};

const transposeMat3 = (matrix: Mat3): Mat3 => [
  [matrix[0][0], matrix[1][0], matrix[2][0]],
  [matrix[0][1], matrix[1][1], matrix[2][1]],
  [matrix[0][2], matrix[1][2], matrix[2][2]]
];

const mulMat3 = (left: Mat3, right: Mat3): Mat3 => {
  const rightTranspose = transposeMat3(right);
  return left.map(row => rightTranspose.map(column => dotVec3(row, column)) as Vec3) as Mat3;
};

const determinantMat3 = (matrix: Mat3): number => {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
};

const crossVec3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const normalizeVec3 = (vector: Vec3): Vec3 => {
  const length = normVec3(vector);
  if (length < EPSILON) throw new Error('SVD basis is numerically unstable');
  return scaleVec3(vector, 1 / length);
};

const column = (matrix: Mat3, index: number): Vec3 => [matrix[0][index], matrix[1][index], matrix[2][index]];
const fromColumns = (first: Vec3, second: Vec3, third: Vec3): Mat3 => [
  [first[0], second[0], third[0]],
  [first[1], second[1], third[1]],
  [first[2], second[2], third[2]]
];

interface KabschRotation {
  rotation: Mat3;
  mirrored: boolean;
}

const rotationFromSvd = (sourceCentered: Vec3[], targetCentered: Vec3[]): KabschRotation => {
  const targetSourceCovariance: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let index = 0; index < sourceCentered.length; index += 1) {
    const source = sourceCentered[index];
    const target = targetCentered[index];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        targetSourceCovariance[row][col] += target[row] * source[col];
      }
    }
  }

  const covarianceTranspose = transposeMat3(targetSourceCovariance);
  const { values, vectors: rightVectors } = symmetricEigen3(mulMat3(covarianceTranspose, targetSourceCovariance));
  const singularValues = values.map(value => Math.sqrt(Math.max(0, value))) as Vec3;
  const firstRight = column(rightVectors, 0);
  const secondRight = column(rightVectors, 1);
  const thirdRight = column(rightVectors, 2);
  const firstLeft = normalizeVec3(mulMat3Vec3(targetSourceCovariance, firstRight));
  const secondCandidate = mulMat3Vec3(targetSourceCovariance, secondRight);
  const secondLeft = normalizeVec3(subVec3(secondCandidate, scaleVec3(firstLeft, dotVec3(firstLeft, secondCandidate))));
  const hasThirdAxis = singularValues[2] / Math.max(singularValues[0], EPSILON) > 1e-7;
  const thirdCandidate = mulMat3Vec3(targetSourceCovariance, thirdRight);
  const thirdOrthogonal = subVec3(
    subVec3(thirdCandidate, scaleVec3(firstLeft, dotVec3(firstLeft, thirdCandidate))),
    scaleVec3(secondLeft, dotVec3(secondLeft, thirdCandidate))
  );
  const thirdLeft = hasThirdAxis
    ? normalizeVec3(thirdOrthogonal)
    : normalizeVec3(crossVec3(firstLeft, secondLeft));
  const leftVectors = fromColumns(firstLeft, secondLeft, thirdLeft);
  const uncorrected = mulMat3(leftVectors, transposeMat3(rightVectors));
  const correction = determinantMat3(uncorrected) < 0 ? -1 : 1;
  const correctedLeft = fromColumns(firstLeft, secondLeft, scaleVec3(thirdLeft, correction));
  const rotation = mulMat3(correctedLeft, transposeMat3(rightVectors));
  const mirrored = correction < 0 && hasThirdAxis;
  return { rotation, mirrored };
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

  const sourceRank = rankWarnings(source);
  if (!sourceRank.ok) return sourceRank;
  const targetRank = rankWarnings(target);
  if (!targetRank.ok) return targetRank;

  const sourceCenter = centroid(source);
  const targetCenter = centroid(target);
  const sourceCentered = source.map(point => subVec3(point, sourceCenter));
  const targetCentered = target.map(point => subVec3(point, targetCenter));
  const { rotation, mirrored } = rotationFromSvd(sourceCentered, targetCentered);
  if (mirrored) {
    return { ok: false, reason: 'landmarks imply a mirrored transform; add more widely separated matching points' };
  }

  const numerator = sourceCentered.reduce((sum, point, index) => {
    return sum + dotVec3(targetCentered[index], mulMat3Vec3(rotation, point));
  }, 0);
  const denominator = sourceCentered.reduce((sum, point) => sum + dotVec3(point, point), 0);
  if (Math.abs(denominator) < EPSILON) {
    return { ok: false, reason: 'source landmarks have no spatial spread' };
  }

  const scale = numerator / denominator;
  if (scale <= EPSILON) {
    return { ok: false, reason: 'landmarks imply a mirrored transform; add more widely separated matching points' };
  }

  const translation = subVec3(targetCenter, scaleVec3(mulMat3Vec3(rotation, sourceCenter), scale));
  const transform = { scale, rotation, translation };
  const residuals = source.map((point, index) => normVec3(subVec3(applySim3(transform, point), target[index])));
  const rmse = Math.sqrt(residuals.reduce((sum, residual) => sum + residual * residual, 0) / residuals.length);

  const warnings = [...new Set([...sourceRank.warnings, ...targetRank.warnings])];
  return { ok: true, transform, residuals, rmse, warnings };
}
