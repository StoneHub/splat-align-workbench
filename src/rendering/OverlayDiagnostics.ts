import { applySim3, type Vec3 } from '../domain/sim3';
import type { ViewerScene } from './RendererAdapter';

type OverlayScene = Extract<ViewerScene, { kind: 'overlay' }>;

export type DiagnosticLineStyle =
  | 'target'
  | 'source'
  | 'disabled-target'
  | 'disabled-source'
  | 'residual'
  | 'outlier'
  | 'selected';

export interface OverlayDiagnosticLine {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly style: DiagnosticLineStyle;
}

export interface DiagnosticCameraBasis {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly distance: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: Vec3, amount: number): Vec3 => [v[0] * amount, v[1] * amount, v[2] * amount];
const normalize = (v: Vec3, fallback: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-8 ? fallback : [v[0] / length, v[1] / length, v[2] / length];
};

export function buildOverlayDiagnosticLines(
  scene: OverlayScene,
  camera: DiagnosticCameraBasis
): OverlayDiagnosticLine[] {
  const lines: OverlayDiagnosticLine[] = [];
  const diagonalA = normalize(add(camera.right, camera.up), camera.right);
  const diagonalB = normalize(subtract(camera.right, camera.up), camera.up);
  const markerSize = Math.max(0.00001, camera.distance * 0.012);

  const segment = (start: Vec3, end: Vec3, style: DiagnosticLineStyle) => {
    lines.push({ start, end, style });
  };
  const cross = (point: Vec3, style: DiagnosticLineStyle, selected: boolean) => {
    const size = markerSize * (selected ? 1.65 : 1);
    segment(subtract(point, scale(camera.right, size)), add(point, scale(camera.right, size)), style);
    segment(subtract(point, scale(camera.up, size)), add(point, scale(camera.up, size)), style);
    if (selected) {
      segment(subtract(point, scale(diagonalA, size)), add(point, scale(diagonalA, size)), 'selected');
      segment(subtract(point, scale(diagonalB, size)), add(point, scale(diagonalB, size)), 'selected');
    }
  };

  for (const diagnostic of scene.diagnostics) {
    const target = diagnostic.target;
    const source = diagnostic.source && scene.source
      ? applySim3(scene.source.sourceToTarget, diagnostic.source)
      : undefined;
    const targetStyle: DiagnosticLineStyle = diagnostic.selected
      ? 'selected'
      : diagnostic.enabled ? 'target' : 'disabled-target';
    const sourceStyle: DiagnosticLineStyle = diagnostic.selected
      ? 'selected'
      : diagnostic.enabled ? 'source' : 'disabled-source';

    if (target) cross(target, targetStyle, diagnostic.selected);
    if (source) cross(source, sourceStyle, diagnostic.selected);
    if (diagnostic.enabled && target && source) {
      const residualStyle: DiagnosticLineStyle = diagnostic.selected
        ? 'selected'
        : diagnostic.quality === 'outlier' ? 'outlier' : 'residual';
      segment(source, target, residualStyle);
    }
  }

  return lines;
}
