import { describe, expect, it } from 'vitest';
import { createMergedSplatPlyBuffer, transformBrushPlyBuffer } from './exportPlyTransform';
import type { Sim3Transform } from '../domain/sim3';
import { parsePlyHeader } from '../domain/ply';

const makePly = (points: Array<[number, number, number]> = [[1, 2, 3]]) => {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${points.length}`,
    'property float x',
    'property float y',
    'property float z',
    'property float scale_0',
    'property float opacity',
    'end_header',
    ''
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const body = new ArrayBuffer(points.length * 5 * 4);
  const view = new DataView(body);
  points.forEach((point, pointIndex) => {
    [...point, 0.5, 0.25].forEach((value, propertyIndex) => {
      view.setFloat32((pointIndex * 5 + propertyIndex) * 4, value, true);
    });
  });
  const output = new Uint8Array(headerBytes.byteLength + body.byteLength);
  output.set(headerBytes, 0);
  output.set(new Uint8Array(body), headerBytes.byteLength);
  return output.buffer;
};

describe('transformBrushPlyBuffer', () => {
  it('updates positions and log-scale fields while preserving other properties', () => {
    const transform: Sim3Transform = {
      scale: 2,
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ],
      translation: [10, 20, 30]
    };

    const transformed = transformBrushPlyBuffer(makePly(), transform);
    const headerLength = new TextEncoder().encode([
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 1',
      'property float x',
      'property float y',
      'property float z',
      'property float scale_0',
      'property float opacity',
      'end_header',
      ''
    ].join('\n')).byteLength;
    const view = new DataView(transformed, headerLength);

    expect(view.getFloat32(0, true)).toBeCloseTo(12);
    expect(view.getFloat32(4, true)).toBeCloseTo(24);
    expect(view.getFloat32(8, true)).toBeCloseTo(36);
    expect(view.getFloat32(12, true)).toBeCloseTo(0.5 + Math.log(2));
    expect(view.getFloat32(16, true)).toBeCloseTo(0.25);
  });

  it('creates a merged PLY with target vertices and transformed source vertices', () => {
    const transform: Sim3Transform = {
      scale: 2,
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ],
      translation: [10, 20, 30]
    };

    const merged = createMergedSplatPlyBuffer(
      makePly([[0, 0, 0], [1, 0, 0]]),
      makePly([[1, 2, 3]]),
      transform
    );
    const header = parsePlyHeader(merged);
    const view = new DataView(merged);
    const stride = 5 * 4;
    const firstSourceRow = header.headerByteLength + 2 * stride;

    expect(header.vertexCount).toBe(3);
    expect(header.comments).toContain('splat-align-workbench merged target plus aligned source');
    expect(view.getFloat32(header.headerByteLength, true)).toBeCloseTo(0);
    expect(view.getFloat32(header.headerByteLength + stride, true)).toBeCloseTo(1);
    expect(view.getFloat32(firstSourceRow, true)).toBeCloseTo(12);
    expect(view.getFloat32(firstSourceRow + 4, true)).toBeCloseTo(24);
    expect(view.getFloat32(firstSourceRow + 8, true)).toBeCloseTo(36);
  });
});
