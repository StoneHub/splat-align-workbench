import {
  Application,
  Color,
  Entity,
  FILLMODE_NONE,
  Picker,
  RESOLUTION_FIXED,
  Vec3 as PcVec3,
  type GSplatComponent
} from 'playcanvas';
import type { Vec3 } from '../domain/sim3';
import { buildOverlayDiagnosticLines, type DiagnosticLineStyle } from './OverlayDiagnostics';
import { PlayCanvasSceneStore, type PlayCanvasLayerSpec } from './PlayCanvasSceneStore';
import { transformedCloud } from './splatData';
import {
  ViewerDisposedError,
  type PickEvent,
  type SceneReplacement,
  type SplatViewer,
  type ViewerNavigation,
  type ViewerScene
} from './RendererAdapter';

type DragMode = 'orbit' | 'pan';

const worldUp: Vec3 = [0, 1, 0];
const targetMarkerColor = new Color(0.05, 0.9, 1, 1);
const sourceMarkerColor = new Color(1, 0.12, 0.85, 1);
const disabledTargetColor = new Color(0.05, 0.9, 1, 0.28);
const disabledSourceColor = new Color(1, 0.12, 0.85, 0.28);
const residualColor = new Color(0.75, 1, 0.12, 0.92);
const outlierColor = new Color(1, 0.18, 0.12, 1);
const selectedColor = new Color(1, 1, 1, 1);
const diagnosticColors: Record<DiagnosticLineStyle, Color> = {
  target: targetMarkerColor,
  source: sourceMarkerColor,
  'disabled-target': disabledTargetColor,
  'disabled-source': disabledSourceColor,
  residual: residualColor,
  outlier: outlierColor,
  selected: selectedColor
};

export const DEFAULT_CONTROL_SENSITIVITY = 0.65;
const MIN_CONTROL_SENSITIVITY = 0.15;
const MAX_CONTROL_SENSITIVITY = 2.5;

const keyCodes = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyF',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight'
]);

const vecAdd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vecSub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vecScale = (v: Vec3, scale: number): Vec3 => [v[0] * scale, v[1] * scale, v[2] * scale];
const vecCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const vecNormalize = (v: Vec3, fallback: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-8) return fallback;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const toPcVec3 = (v: Vec3): PcVec3 => new PcVec3(v[0], v[1], v[2]);

const clampControlSensitivity = (value: number): number => Math.min(MAX_CONTROL_SENSITIVITY, Math.max(MIN_CONTROL_SENSITIVITY, value));

export function controlSensitivityLabel(value: number): string {
  return `${clampControlSensitivity(value).toFixed(2)}x`;
}

export function wheelZoomFactor(deltaY: number, controlSensitivity = DEFAULT_CONTROL_SENSITIVITY): number {
  const direction = deltaY > 0 ? 1 : -1;
  return Math.exp(direction * 0.14 * clampControlSensitivity(controlSensitivity));
}

export function navigationMoveStep(distance: number, dt: number, speedMultiplier: number, controlSensitivity = 1): number {
  const baseSpeed = Math.max(0.0005, distance * 0.22);
  return baseSpeed * speedMultiplier * clampControlSensitivity(controlSensitivity) * Math.min(dt, 0.05);
}

const combineBounds = (specs: readonly PlayCanvasLayerSpec[]) => {
  const boundsMin: Vec3 = [Infinity, Infinity, Infinity];
  const boundsMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const spec of specs) {
    const cloud = spec.transform ? transformedCloud(spec.source.cloud, spec.transform) : spec.source.cloud;
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis], cloud.boundsMin[axis]);
      boundsMax[axis] = Math.max(boundsMax[axis], cloud.boundsMax[axis]);
    }
  }
  const center: Vec3 = [
    (boundsMin[0] + boundsMax[0]) / 2,
    (boundsMin[1] + boundsMax[1]) / 2,
    (boundsMin[2] + boundsMax[2]) / 2
  ];
  const radius = Math.max(
    boundsMax[0] - boundsMin[0],
    boundsMax[1] - boundsMin[1],
    boundsMax[2] - boundsMin[2],
    1
  ) / 2;
  return { center, radius };
};

export class PlayCanvasSplatViewer implements SplatViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly app: Application;
  private readonly sceneStore: PlayCanvasSceneStore;
  private readonly camera: Entity;
  private readonly picker: Picker;
  private readonly target = new PcVec3();
  private readonly pickHandlers = new Set<(event: PickEvent) => void>();
  private readonly keys = new Set<string>();
  private readonly listenerAbort = new AbortController();
  private readonly resizeObserver: ResizeObserver | null;
  private disposed = false;
  private yaw = 0.72;
  private pitch = -0.32;
  private distance = 3;
  private isDragging = false;
  private dragMode: DragMode = 'orbit';
  private lastX = 0;
  private lastY = 0;
  private dragDistance = 0;
  private isPickMode = false;
  private controlSensitivity = DEFAULT_CONTROL_SENSITIVITY;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private viewportPixelRatio = 0;

  private readonly handleUpdate = (dt: number) => this.updateKeyboard(dt);
  private readonly handlePrerender = () => this.drawDiagnostics();
  private readonly handleWindowResize = () => {
    if (!this.disposed) this.resizeFromLayout();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.app = new Application(canvas, {
      graphicsDeviceOptions: {
        antialias: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance'
      }
    });
    this.app.setCanvasFillMode(FILLMODE_NONE);
    this.app.scene.ambientLight.set(0.55, 0.58, 0.64);
    this.app.scene.gsplat.enableIds = true;
    this.app.autoRender = true;
    this.canvas.tabIndex = 0;
    this.sceneStore = new PlayCanvasSceneStore(this.app);

    this.camera = new Entity('camera', this.app);
    this.camera.addComponent('camera', {
      clearColor: new Color(0.02, 0.03, 0.05),
      nearClip: 0.01,
      farClip: 5000
    });
    this.app.root.addChild(this.camera);

    this.picker = new Picker(this.app, 1, 1, true);
    this.bind();
    this.resizeFromLayout();
    this.updateCamera();
    this.app.on('update', this.handleUpdate);
    this.app.on('prerender', this.handlePrerender);
    this.app.start();

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (!this.disposed) this.resizeFromLayout();
        });
    this.resizeObserver?.observe(this.canvas);
  }

  async replace(scene: ViewerScene): Promise<SceneReplacement> {
    this.assertActive();
    const result = await this.sceneStore.replace(scene);
    if (result.status === 'applied') {
      if (result.layersChanged && this.sceneStore.specs.length) this.frame(this.sceneStore.specs);
      this.app.renderNextFrame = true;
    }
    return { status: result.status };
  }

  onPick(handler: (event: PickEvent) => void): () => void {
    this.assertActive();
    this.pickHandlers.add(handler);
    return () => this.pickHandlers.delete(handler);
  }

  setPickMode(enabled: boolean): void {
    this.assertActive();
    this.isPickMode = enabled;
    this.canvas.classList.toggle('pick-mode', enabled);
  }

  setControlSensitivity(value: number): void {
    this.assertActive();
    if (!Number.isFinite(value)) throw new RangeError('Control sensitivity must be finite.');
    this.controlSensitivity = clampControlSensitivity(value);
  }

  navigate(command: ViewerNavigation): void {
    this.assertActive();
    if (command.kind === 'reset') {
      if (this.sceneStore.specs.length) this.frame(this.sceneStore.specs);
      return;
    }
    if (!Number.isFinite(command.factor) || command.factor <= 0) {
      throw new RangeError('Zoom factor must be finite and greater than zero.');
    }
    this.zoomBy(command.factor);
  }

  resize(): void {
    this.assertActive();
    this.resizeFromLayout();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listenerAbort.abort();
    this.resizeObserver?.disconnect();
    this.pickHandlers.clear();
    this.keys.clear();
    this.isDragging = false;
    this.isPickMode = false;
    this.canvas.classList.remove('pick-mode');
    this.app.off('update', this.handleUpdate);
    this.app.off('prerender', this.handlePrerender);
    this.sceneStore.dispose();
    this.picker.destroy();
    this.app.destroy();
  }

  private assertActive(): void {
    if (this.disposed) throw new ViewerDisposedError();
  }

  private frame(specs: readonly PlayCanvasLayerSpec[]): void {
    const { center, radius } = combineBounds(specs);
    this.target.set(center[0], center[1], center[2]);
    this.distance = Math.max(0.5, radius * 3.2);
    const camera = this.camera.camera;
    if (camera) {
      camera.nearClip = Math.max(0.00001, radius / 100000);
      camera.farClip = Math.max(100, radius * 20);
    }
    this.updateCamera();
  }

  private drawDiagnostics(): void {
    const scene = this.sceneStore.scene;
    if (this.disposed || scene?.kind !== 'overlay') return;
    const { right, up } = this.viewBasis();
    const lines = buildOverlayDiagnosticLines(scene, { right, up, distance: this.distance });
    const positions: PcVec3[] = [];
    const colors: Color[] = [];
    for (const line of lines) {
      positions.push(toPcVec3(line.start), toPcVec3(line.end));
      const color = diagnosticColors[line.style];
      colors.push(color, color);
    }

    if (positions.length) this.app.drawLines(positions, colors, false);
  }

  private bind(): void {
    const signal = this.listenerAbort.signal;
    window.addEventListener('resize', this.handleWindowResize, { signal });
    this.canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    this.canvas.addEventListener('pointerdown', event => {
      this.isDragging = true;
      this.dragMode = this.isPickMode ? 'orbit' : event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
      this.dragDistance = 0;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
    }, { signal });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.isDragging) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.dragDistance += Math.hypot(dx, dy);
      if (!this.isPickMode && this.dragMode === 'pan') {
        this.panByPixels(dx, dy);
      } else if (!this.isPickMode) {
        this.yaw -= dx * 0.008 * this.controlSensitivity;
        this.pitch = Math.min(1.35, Math.max(-1.35, this.pitch + dy * 0.008 * this.controlSensitivity));
        this.updateCamera();
      }
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    }, { signal });
    this.canvas.addEventListener('pointerup', event => {
      this.isDragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (this.isPickMode && this.dragDistance < 6) void this.pick(event);
    }, { signal });
    this.canvas.addEventListener('pointercancel', event => {
      this.isDragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    }, { signal });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      this.canvas.focus({ preventScroll: true });
      this.zoomBy(wheelZoomFactor(event.deltaY, this.controlSensitivity));
    }, { passive: false, signal });
    this.canvas.addEventListener('keydown', event => {
      if (!keyCodes.has(event.code)) return;
      event.preventDefault();
      if (event.code === 'KeyF' && !event.repeat && this.sceneStore.specs.length) {
        this.frame(this.sceneStore.specs);
      }
      this.keys.add(event.code);
    }, { signal });
    this.canvas.addEventListener('keyup', event => {
      if (!keyCodes.has(event.code)) return;
      event.preventDefault();
      this.keys.delete(event.code);
    }, { signal });
    this.canvas.addEventListener('blur', () => this.keys.clear(), { signal });
  }

  private resizeFromLayout(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const pixelRatio = window.devicePixelRatio || 1;
    if (width === this.viewportWidth && height === this.viewportHeight && pixelRatio === this.viewportPixelRatio) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = pixelRatio;
    this.app.graphicsDevice.maxPixelRatio = pixelRatio;
    this.app.setCanvasResolution(RESOLUTION_FIXED, width, height);
    this.picker.resize(this.app.graphicsDevice.width, this.app.graphicsDevice.height);
    this.app.renderNextFrame = true;
  }

  private zoomBy(factor: number): void {
    this.distance = Math.max(0.0001, this.distance * factor);
    const camera = this.camera.camera;
    if (camera) {
      camera.nearClip = Math.min(camera.nearClip, Math.max(0.00001, this.distance / 1000));
    }
    this.updateCamera();
  }

  private cameraPosition(): Vec3 {
    const cosPitch = Math.cos(this.pitch);
    return [
      this.target.x + this.distance * cosPitch * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * cosPitch * Math.cos(this.yaw)
    ];
  }

  private viewBasis(): { forward: Vec3; right: Vec3; up: Vec3 } {
    const target: Vec3 = [this.target.x, this.target.y, this.target.z];
    const forward = vecNormalize(vecSub(target, this.cameraPosition()), [0, 0, -1]);
    const right = vecNormalize(vecCross(forward, worldUp), [1, 0, 0]);
    const up = vecNormalize(vecCross(right, forward), worldUp);
    return { forward, right, up };
  }

  private moveTarget(delta: Vec3): void {
    this.target.set(this.target.x + delta[0], this.target.y + delta[1], this.target.z + delta[2]);
    this.updateCamera();
  }

  private panByPixels(dx: number, dy: number): void {
    const { right, up } = this.viewBasis();
    const pixelSpan = Math.max(1, Math.min(this.canvas.width, this.canvas.height));
    const scale = (this.distance / pixelSpan) * 1.8 * this.controlSensitivity;
    this.moveTarget(vecAdd(vecScale(right, -dx * scale), vecScale(up, dy * scale)));
  }

  private updateKeyboard(dt: number): void {
    if (this.disposed || !this.keys.size) return;
    const { forward, right, up } = this.viewBasis();
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const slow = this.keys.has('AltLeft') || this.keys.has('AltRight');
    const speedMultiplier = fast ? 3 : slow ? 0.25 : 1;
    const speed = navigationMoveStep(this.distance, dt, speedMultiplier, this.controlSensitivity);
    let move: Vec3 = [0, 0, 0];
    if (this.keys.has('KeyW')) move = vecAdd(move, vecScale(forward, speed));
    if (this.keys.has('KeyS')) move = vecAdd(move, vecScale(forward, -speed));
    if (this.keys.has('KeyA')) move = vecAdd(move, vecScale(right, -speed));
    if (this.keys.has('KeyD')) move = vecAdd(move, vecScale(right, speed));
    if (this.keys.has('KeyQ')) move = vecAdd(move, vecScale(up, -speed));
    if (this.keys.has('KeyE')) move = vecAdd(move, vecScale(up, speed));

    const lookSpeed = 1.45 * speedMultiplier * this.controlSensitivity * Math.min(dt, 0.05);
    let changedLook = false;
    if (this.keys.has('ArrowLeft')) {
      this.yaw += lookSpeed;
      changedLook = true;
    }
    if (this.keys.has('ArrowRight')) {
      this.yaw -= lookSpeed;
      changedLook = true;
    }
    if (this.keys.has('ArrowUp')) {
      this.pitch = Math.min(1.35, Math.max(-1.35, this.pitch + lookSpeed));
      changedLook = true;
    }
    if (this.keys.has('ArrowDown')) {
      this.pitch = Math.max(-1.35, this.pitch - lookSpeed);
      changedLook = true;
    }

    if (move[0] || move[1] || move[2]) {
      this.moveTarget(move);
    } else if (changedLook) {
      this.updateCamera();
    }
  }

  private updateCamera(): void {
    const [x, y, z] = this.cameraPosition();
    this.camera.setPosition(new PcVec3(x, y, z));
    this.camera.lookAt(this.target);
    this.app.renderNextFrame = true;
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  private emitPick(event: PickEvent): void {
    [...this.pickHandlers].forEach(handler => handler(event));
  }

  private async pick(event: PointerEvent): Promise<void> {
    const generation = this.sceneStore.generation;
    if (!this.sceneStore.layers.length || !this.sceneStore.isCurrent(generation) || !this.camera.camera) return;
    const layers = [...this.sceneStore.layers];
    const { x, y } = this.canvasPoint(event);
    try {
      this.picker.prepare(this.camera.camera, this.app.scene);
      const selection = await this.picker.getSelectionAsync(Math.max(0, x - 4), Math.max(0, y - 4), 9, 9);
      if (this.pickIsStale(generation)) return;
      const point = await this.picker.getWorldPointAsync(x, y);
      if (this.pickIsStale(generation)) return;
      if (!point) {
        this.emitPick({ kind: 'miss' });
        return;
      }
      const selected = selection.find(item => layers.some(layer => layer.entity.gsplat === item as GSplatComponent));
      if (selection.length > 0 && !selected) {
        this.emitPick({ kind: 'miss' });
        return;
      }
      this.emitPick({ kind: 'hit', worldPosition: [point.x, point.y, point.z] });
    } catch {
      if (!this.pickIsStale(generation)) this.emitPick({ kind: 'miss' });
    }
  }

  private pickIsStale(generation: number): boolean {
    return this.disposed
      || !this.isPickMode
      || !this.sceneStore.isCurrent(generation);
  }
}
