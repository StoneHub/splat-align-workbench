import { describe, expect, it } from 'vitest';
import { parsePlyHeader } from '../../domain/ply';
import { plyFidelityFixtures } from './plyFidelityFixtures';

describe('PLY export fidelity fixtures', () => {
  it('materializes the planned SH degrees and schema orders as binary fixtures', () => {
    const fixtures = plyFidelityFixtures();

    expect(fixtures.map(fixture => fixture.id)).toEqual([
      'degree-0-numeric',
      'degree-1-lexicographic',
      'degree-2-numeric',
      'degree-3-lexicographic',
      'degree-3-normals'
    ]);
    for (const fixture of fixtures) {
      const header = parsePlyHeader(fixture.buffer);
      expect(header.format).toBe('binary_little_endian');
      expect(header.vertexCount).toBe(2);
      expect(header.comments).toContain(`SH degree: ${fixture.shDegree}`);
      expect(header.properties.filter(name => name.startsWith('f_rest_'))).toHaveLength(
        3 * ((fixture.shDegree + 1) ** 2 - 1)
      );
      expect(fixture.buffer.byteLength).toBe(header.headerByteLength + header.vertexCount * header.vertexStride);
    }
  });

  it('distinguishes numeric, lexicographic, and normals property layouts', () => {
    const byId = Object.fromEntries(plyFidelityFixtures().map(fixture => [fixture.id, parsePlyHeader(fixture.buffer)]));

    expect(byId['degree-3-lexicographic'].properties.indexOf('f_rest_10'))
      .toBeLessThan(byId['degree-3-lexicographic'].properties.indexOf('f_rest_2'));
    expect(byId['degree-2-numeric'].properties.indexOf('f_rest_2'))
      .toBeLessThan(byId['degree-2-numeric'].properties.indexOf('f_rest_10'));
    expect(byId['degree-3-normals'].properties).toEqual(expect.arrayContaining(['nx', 'ny', 'nz']));
  });

  it('stores deterministic nonzero coefficient and normal truth values', () => {
    const fixture = plyFidelityFixtures().find(item => item.id === 'degree-3-normals');
    expect(fixture).toBeDefined();
    const header = parsePlyHeader(fixture!.buffer);
    const row = header.headerByteLength;
    const view = new DataView(fixture!.buffer);
    const value = (name: string) => view.getFloat32(row + header.vertexProperties.find(property => property.name === name)!.byteOffset, true);

    expect(value('nx')).toBeCloseTo(1);
    expect(value('ny')).toBeCloseTo(2);
    expect(value('nz')).toBeCloseTo(3);
    expect(value('f_rest_0')).toBeCloseTo(0.01);
    expect(value('f_rest_44')).toBeCloseTo(0.45);
  });
});
