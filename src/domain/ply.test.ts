import { describe, expect, it } from 'vitest';
import { parsePlyHeader } from './ply';

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
    expect(parsed.comments).toContain('SH degree: 3');
  });
});
