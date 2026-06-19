import { describe, expect, it } from 'vitest';
import { parsePlyHeader } from '../domain/ply';
import { createSyntheticAlignmentFixture } from '../devFixtures/syntheticSplat';
import { createDiagnosticSplatBuffer } from './splatColor';

const SH_C0 = 0.28209479177387814;

describe('createDiagnosticSplatBuffer', () => {
  it('clones a PLY and overrides splat color and opacity for x-ray overlay previews', () => {
    const fixture = createSyntheticAlignmentFixture();
    const source = fixture.files.source.buffer;
    const tinted = createDiagnosticSplatBuffer(source, { color: [0.05, 0.9, 1], alpha: 0.42 });

    expect(tinted).not.toBe(source);
    expect(tinted.byteLength).toBe(source.byteLength);

    const header = parsePlyHeader(tinted);
    const view = new DataView(tinted);
    const row = header.headerByteLength;
    const stride = 4;
    const f0 = header.properties.indexOf('f_dc_0');
    const f1 = header.properties.indexOf('f_dc_1');
    const f2 = header.properties.indexOf('f_dc_2');
    const opacity = header.properties.indexOf('opacity');

    expect(view.getFloat32(row + f0 * stride, true)).toBeCloseTo((0.05 - 0.5) / SH_C0, 6);
    expect(view.getFloat32(row + f1 * stride, true)).toBeCloseTo((0.9 - 0.5) / SH_C0, 6);
    expect(view.getFloat32(row + f2 * stride, true)).toBeCloseTo((1 - 0.5) / SH_C0, 6);
    expect(view.getFloat32(row + opacity * stride, true)).toBeCloseTo(Math.log(0.42 / 0.58), 6);

    const originalView = new DataView(source);
    expect(originalView.getFloat32(row + f0 * stride, true)).not.toBeCloseTo(view.getFloat32(row + f0 * stride, true), 6);
  });
});
