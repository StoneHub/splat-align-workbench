import { describe, expect, it } from 'vitest';
import type { ViewerScene } from './RendererAdapter';
import { buildOverlayDiagnosticLines, type DiagnosticCameraBasis } from './OverlayDiagnostics';

const overlayScene = (diagnostic: Extract<ViewerScene, { kind: 'overlay' }>['diagnostics'][number]): Extract<ViewerScene, { kind: 'overlay' }> => ({
  kind: 'overlay',
  target: {
    name: 'target.ply',
    buffer: new ArrayBuffer(0),
    cloud: { points: [], vertexCount: 0, boundsMin: [0, 0, 0], boundsMax: [0, 0, 0], center: [0, 0, 0], radius: 1 }
  },
  source: {
    splat: {
      name: 'source.ply',
      buffer: new ArrayBuffer(0),
      cloud: { points: [], vertexCount: 0, boundsMin: [0, 0, 0], boundsMax: [0, 0, 0], center: [0, 0, 0], radius: 1 }
    },
    sourceToTarget: {
      scale: 2,
      rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      translation: [3, 4, 5]
    }
  },
  diagnostics: [diagnostic]
});

const camera: DiagnosticCameraBasis = { right: [1, 0, 0], up: [0, 1, 0], distance: 10 };

describe('buildOverlayDiagnosticLines', () => {
  it('uses the aligned Source point for the residual vector', () => {
    const lines = buildOverlayDiagnosticLines(overlayScene({
      id: 'A', target: [4, 6, 5], source: [1, 0, 0], enabled: true, selected: false, quality: 'outlier'
    }), camera);

    expect(lines.at(-1)).toEqual({ start: [3, 6, 5], end: [4, 6, 5], style: 'outlier' });
  });

  it('draws selected points with larger four-axis crosses and selected residual emphasis', () => {
    const lines = buildOverlayDiagnosticLines(overlayScene({
      id: 'A', target: [4, 6, 5], source: [1, 0, 0], enabled: true, selected: true, quality: 'good'
    }), camera);

    expect(lines).toHaveLength(9);
    expect(lines.every(line => line.style === 'selected')).toBe(true);
  });

  it('mutes disabled markers and omits their residual vector', () => {
    const lines = buildOverlayDiagnosticLines(overlayScene({
      id: 'A', target: [4, 6, 5], source: [1, 0, 0], enabled: false, selected: false, quality: 'good'
    }), camera);

    expect(lines).toHaveLength(4);
    expect(lines.map(line => line.style)).toEqual([
      'disabled-target', 'disabled-target', 'disabled-source', 'disabled-source'
    ]);
  });
});
