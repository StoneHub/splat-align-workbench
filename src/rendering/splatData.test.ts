import { describe, expect, it } from 'vitest';
import { loadSplatCloudFromPly } from './splatData';

const makePly = (points: Array<[number, number, number]>): ArrayBuffer => {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${points.length}`,
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    ''
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const buffer = new ArrayBuffer(headerBytes.byteLength + points.length * 12);
  const bytes = new Uint8Array(buffer);
  bytes.set(headerBytes, 0);
  const view = new DataView(buffer);
  points.forEach((point, index) => {
    const row = headerBytes.byteLength + index * 12;
    view.setFloat32(row, point[0], true);
    view.setFloat32(row + 4, point[1], true);
    view.setFloat32(row + 8, point[2], true);
  });
  return buffer;
};

describe('loadSplatCloudFromPly', () => {
  it('samples xyz positions and calculates bounds for camera framing', () => {
    const cloud = loadSplatCloudFromPly(makePly([
      [-2, 0, 1],
      [0, 4, 3],
      [2, 8, 5],
      [10, 12, 7]
    ]), 2);

    expect(cloud.vertexCount).toBe(4);
    expect(cloud.points).toEqual([[-2, 0, 1], [2, 8, 5]]);
    expect(cloud.boundsMin).toEqual([-2, 0, 1]);
    expect(cloud.boundsMax).toEqual([2, 8, 5]);
    expect(cloud.center).toEqual([0, 4, 3]);
    expect(cloud.radius).toBe(4);
  });
});
