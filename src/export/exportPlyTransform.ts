import { applySim3, type Mat3, type Sim3Transform, type Vec3 } from '../domain/sim3';
import { parsePlyHeader, requireCompleteVertexData, requireFloat32VertexLayout } from '../domain/ply';

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

const vertexBody = (buffer: ArrayBuffer, header: ReturnType<typeof parsePlyHeader>): Uint8Array => {
  return new Uint8Array(buffer, header.headerByteLength, header.vertexCount * header.vertexStride);
};

const combinedHeader = (headerText: string, vertexCount: number): Uint8Array => {
  const lines = headerText.trimEnd().split(/\r?\n/);
  const nextLines: string[] = [];
  for (const line of lines) {
    nextLines.push(line.startsWith('element vertex ') ? `element vertex ${vertexCount}` : line);
    if (line.startsWith('format ')) {
      nextLines.push('comment splat-align-workbench merged target plus aligned source');
    }
  }
  return new TextEncoder().encode(`${nextLines.join('\n')}\n`);
};

export function transformBrushPlyBuffer(buffer: ArrayBuffer, transform: Sim3Transform): ArrayBuffer {
  const header = parsePlyHeader(buffer);
  if (header.format !== 'binary_little_endian') {
    throw new Error('Only binary_little_endian PLY export is supported in the MVP');
  }
  requireFloat32VertexLayout(header);
  requireCompleteVertexData(header, buffer);

  const bytes = new Uint8Array(buffer.slice(0));
  const view = new DataView(bytes.buffer);
  const stride = header.vertexStride;
  const property = (name: string) => header.vertexProperties.find(item => item.name === name);
  const x = property('x');
  const y = property('y');
  const z = property('z');
  if (!x || !y || !z) {
    throw new Error('PLY is missing x/y/z properties');
  }

  const rotations = ['rot_0', 'rot_1', 'rot_2', 'rot_3'].map(property);
  const hasQuaternion = rotations.every(Boolean);
  const alignQuaternion = normalizeQuaternion(mat3ToQuaternion(transform.rotation));
  const logScaleDelta = Math.log(Math.abs(transform.scale));

  for (let vertex = 0; vertex < header.vertexCount; vertex += 1) {
    const row = header.headerByteLength + vertex * stride;
    const position: Vec3 = [
      view.getFloat32(row + x.byteOffset, true),
      view.getFloat32(row + y.byteOffset, true),
      view.getFloat32(row + z.byteOffset, true)
    ];
    const transformed = applySim3(transform, position);
    view.setFloat32(row + x.byteOffset, transformed[0], true);
    view.setFloat32(row + y.byteOffset, transformed[1], true);
    view.setFloat32(row + z.byteOffset, transformed[2], true);

    header.vertexProperties.forEach(item => {
      if (item.name.startsWith('scale_')) {
        view.setFloat32(row + item.byteOffset, view.getFloat32(row + item.byteOffset, true) + logScaleDelta, true);
      }
    });

    if (hasQuaternion) {
      const current = normalizeQuaternion(rotations.map(item => view.getFloat32(row + item!.byteOffset, true)) as Quaternion);
      const next = normalizeQuaternion(multiplyQuaternion(alignQuaternion, current));
      rotations.forEach((item, component) => view.setFloat32(row + item!.byteOffset, next[component], true));
    }
  }

  return bytes.buffer;
}

export function createMergedSplatPlyBuffer(targetBuffer: ArrayBuffer, sourceBuffer: ArrayBuffer, transform: Sim3Transform): ArrayBuffer {
  const targetHeader = parsePlyHeader(targetBuffer);
  const sourceHeader = parsePlyHeader(sourceBuffer);
  if (targetHeader.format !== 'binary_little_endian' || sourceHeader.format !== 'binary_little_endian') {
    throw new Error('Only binary_little_endian PLY export is supported in the MVP');
  }
  requireFloat32VertexLayout(targetHeader);
  requireFloat32VertexLayout(sourceHeader);
  requireCompleteVertexData(targetHeader, targetBuffer);
  requireCompleteVertexData(sourceHeader, sourceBuffer);
  const trailingElements = [...targetHeader.elements, ...sourceHeader.elements]
    .filter(element => element.name !== 'vertex' && element.count > 0);
  if (trailingElements.length > 0) {
    throw new Error('Merged export does not support PLY files with non-vertex element data');
  }
  const schema = (header: typeof targetHeader) => header.vertexProperties.map(item => `${item.type}:${item.name}`).join('\n');
  if (schema(targetHeader) !== schema(sourceHeader)) {
    throw new Error('Combined preview export requires target and source PLY files with matching vertex properties');
  }

  const transformedSource = transformBrushPlyBuffer(sourceBuffer, transform);
  const header = combinedHeader(targetHeader.headerText, targetHeader.vertexCount + sourceHeader.vertexCount);
  const targetBody = vertexBody(targetBuffer, targetHeader);
  const sourceBody = vertexBody(transformedSource, sourceHeader);
  const output = new Uint8Array(header.byteLength + targetBody.byteLength + sourceBody.byteLength);
  output.set(header, 0);
  output.set(targetBody, header.byteLength);
  output.set(sourceBody, header.byteLength + targetBody.byteLength);
  return output.buffer;
}
