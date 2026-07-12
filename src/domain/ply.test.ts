import { describe, expect, it } from 'vitest';
import { parsePlyHeader, requireCompleteVertexData } from './ply';

describe('parsePlyHeader', () => {
  it('parses Brush binary little-endian 3DGS headers', () => {
    const text = [
      'ply',
      'format binary_little_endian 1.0',
      'comment Exported from Brush',
      'comment SH degree: 3',
      'element vertex 1807138',
      'property float x',
      'property float y',
      'property float z',
      'property float scale_0',
      'end_header',
      ''
    ].join('\n');

    const parsed = parsePlyHeader(new TextEncoder().encode(text).buffer);

    expect(parsed.vertexCount).toBe(1807138);
    expect(parsed.format).toBe('binary_little_endian');
    expect(parsed.properties).toEqual(['x', 'y', 'z', 'scale_0']);
    expect(parsed.vertexStride).toBe(16);
    expect(parsed.vertexProperties[2]).toMatchObject({ name: 'z', type: 'float', byteOffset: 8 });
    expect(parsed.comments).toContain('SH degree: 3');
  });

  it('keeps non-vertex properties out of the vertex layout', () => {
    const header = [
      'ply', 'format binary_little_endian 1.0', 'element vertex 1',
      'property float x', 'property float y', 'property float z',
      'element face 0', 'property list uchar int vertex_indices', 'end_header', ''
    ].join('\n');
    const body = new Uint8Array(12);
    const bytes = new Uint8Array(new TextEncoder().encode(header).byteLength + body.byteLength);
    bytes.set(new TextEncoder().encode(header));

    const parsed = parsePlyHeader(bytes.buffer);
    expect(parsed.properties).toEqual(['x', 'y', 'z']);
    expect(parsed.vertexStride).toBe(12);
  });

  it('rejects truncated vertex data', () => {
    const header = ['ply', 'format binary_little_endian 1.0', 'element vertex 1', 'property float x', 'end_header', ''].join('\n');
    const buffer = new TextEncoder().encode(header).buffer;
    const parsed = parsePlyHeader(buffer);
    expect(() => requireCompleteVertexData(parsed, buffer)).toThrow('truncated');
  });
});
