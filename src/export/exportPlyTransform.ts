import { applySim3, type Mat3, type Sim3Transform, type Vec3 } from '../domain/sim3';
import { parsePlyHeader } from '../domain/ply';

type Quaternion = [number, number, number, number];

const mat3ToQuaternion = (m: Mat3): Quaternion => {
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s];
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    return [(m[2][1] - m[1][2]) / s, 0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s];
  }
  if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    return [(m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s];
  }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return [(m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s];
};

const multiplyQuaternion = (a: Quaternion, b: Quaternion): Quaternion => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
];

const normalizeQuaternion = (q: Quaternion): Quaternion => {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
};

const propertyIndex = (properties: string[], name: string): number => properties.indexOf(name);

export function transformBrushPlyBuffer(buffer: ArrayBuffer, transform: Sim3Transform): ArrayBuffer {
  const header = parsePlyHeader(buffer);
  if (header.format !== 'binary_little_endian') {
    throw new Error('Only binary_little_endian PLY export is supported in the MVP');
  }

  const bytes = new Uint8Array(buffer.slice(0));
  const view = new DataView(bytes.buffer);
  const stride = header.properties.length * 4;
  const xIndex = propertyIndex(header.properties, 'x');
  const yIndex = propertyIndex(header.properties, 'y');
  const zIndex = propertyIndex(header.properties, 'z');
  if (xIndex === -1 || yIndex === -1 || zIndex === -1) {
    throw new Error('PLY is missing x/y/z properties');
  }

  const rotationIndexes = ['rot_0', 'rot_1', 'rot_2', 'rot_3'].map(name => propertyIndex(header.properties, name));
  const hasQuaternion = rotationIndexes.every(index => index !== -1);
  const alignQuaternion = normalizeQuaternion(mat3ToQuaternion(transform.rotation));
  const logScaleDelta = Math.log(Math.abs(transform.scale));

  for (let vertex = 0; vertex < header.vertexCount; vertex += 1) {
    const row = header.headerByteLength + vertex * stride;
    const position: Vec3 = [
      view.getFloat32(row + xIndex * 4, true),
      view.getFloat32(row + yIndex * 4, true),
      view.getFloat32(row + zIndex * 4, true)
    ];
    const transformed = applySim3(transform, position);
    view.setFloat32(row + xIndex * 4, transformed[0], true);
    view.setFloat32(row + yIndex * 4, transformed[1], true);
    view.setFloat32(row + zIndex * 4, transformed[2], true);

    header.properties.forEach((property, index) => {
      if (property.startsWith('scale_')) {
        view.setFloat32(row + index * 4, view.getFloat32(row + index * 4, true) + logScaleDelta, true);
      }
    });

    if (hasQuaternion) {
      const current = normalizeQuaternion(rotationIndexes.map(index => view.getFloat32(row + index * 4, true)) as Quaternion);
      const next = normalizeQuaternion(multiplyQuaternion(alignQuaternion, current));
      rotationIndexes.forEach((index, component) => view.setFloat32(row + index * 4, next[component], true));
    }
  }

  return bytes.buffer;
}
