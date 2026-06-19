import {
  Application,
  Asset,
  Color,
  Entity,
  FILLMODE_NONE,
  Picker,
  Quat,
  RESOLUTION_FIXED,
  Vec3 as PcVec3,
  type GSplatComponent
} from 'playcanvas';
import type { Mat3, Sim3Transform, Vec3 } from '../domain/sim3';
import { transformedCloud } from './splatData';
import { createDiagnosticSplatBuffer } from './splatColor';
import type { SplatRenderInput, SplatViewer } from './RendererAdapter';

type LoadedLayer = {
  asset: Asset;
  entity: Entity;
};

type QuaternionWxyz = [number, number, number, number];
type DragMode = 'orbit' | 'pan';

const roleName = (input: SplatRenderInput): string => `${input.role}-${input.name}`;
const worldUp: Vec3 = [0, 1, 0];
const overlayTargetTint = { color: [0.05, 0.9, 1] as [number, number, number], alpha: 0.38 };
const overlaySourceTint = { color: [1, 0.12, 0.85] as [number, number, number], alpha: 0.44 };
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

const mat3ToQuaternion = (m: Mat3): QuaternionWxyz => {
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

const normalizeQuaternion = (q: QuaternionWxyz): QuaternionWxyz => {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
};

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

const combineBounds = (inputs: SplatRenderInput[]) => {
  const boundsMin: Vec3 = [Infinity, Infinity, Infinity];
  const boundsMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const input of inputs) {
    const cloud = input.transform ? transformedCloud(input.cloud, input.transform) : input.cloud;
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
  private readonly camera: Entity;
  private readonly picker: Picker;
  private readonly target = new PcVec3();
  private layers: LoadedLayer[] = [];
  private yaw = 0.72;
  private pitch = -0.32;
  private distance = 3;
  private isDragging = false;
  private dragMode: DragMode = 'orbit';
  private lastX = 0;
  private lastY = 0;
  private dragDistance = 0;
  private onPick?: (point: Vec3) => void;
  private onPickMiss?: () => void;
  private loadToken = 0;
  private readonly keys = new Set<string>();
  private lastInputs: SplatRenderInput[] = [];
  private isPickMode = false;
  private controlSensitivity = DEFAULT_CONTROL_SENSITIVITY;

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
    this.app.setCanvasResolution(RESOLUTION_FIXED);
    this.app.scene.ambientLight.set(0.55, 0.58, 0.64);
    this.app.scene.gsplat.enableIds = true;
    this.app.autoRender = true;
    this.canvas.tabIndex = 0;

    this.camera = new Entity('camera', this.app);
    this.camera.addComponent('camera', {
      clearColor: new Color(0.02, 0.03, 0.05),
      nearClip: 0.01,
      farClip: 5000
    });
    this.app.root.addChild(this.camera);

    this.picker = new Picker(this.app, 1, 1, true);
    this.bind();
    this.resize();
    this.updateCamera();
    this.app.on('update', dt => this.updateKeyboard(dt));
    this.app.start();
  }

  setPickHandler(handler: (point: Vec3) => void): void {
    this.onPick = handler;
  }

  setPickMissHandler(handler: () => void): void {
    this.onPickMiss = handler;
  }

  setPickMode(enabled: boolean): void {
    this.isPickMode = enabled;
    this.canvas.classList.toggle('pick-mode', enabled);
  }

  setControlSensitivity(value: number): void {
    this.controlSensitivity = clampControlSensitivity(value);
  }

  async setLayer(input: SplatRenderInput | null): Promise<void> {
    await this.setLayers(input ? [input] : []);
  }

  async setOverlay(target: SplatRenderInput | null, source: SplatRenderInput | null, transform?: Sim3Transform): Promise<void> {
    const layers: SplatRenderInput[] = [];
    if (target) {
      layers.push({
        ...target,
        name: `xray-target-${target.name}`,
        role: 'overlayTarget',
        buffer: createDiagnosticSplatBuffer(target.buffer, overlayTargetTint)
      });
    }
    if (source && transform) {
      layers.push({
        ...source,
        name: `xray-source-${source.name}`,
        role: 'overlaySource',
        buffer: createDiagnosticSplatBuffer(source.buffer, overlaySourceTint),
        transform
      });
    }
    await this.setLayers(layers);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width * scale));
    const height = Math.max(240, Math.floor(rect.height * scale));
    this.canvas.width = width;
    this.canvas.height = height;
    this.app.setCanvasResolution(RESOLUTION_FIXED, width, height);
    this.app.resizeCanvas(width, height);
    this.picker.resize(width, height);
    this.app.renderNextFrame = true;
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('pointerdown', event => {
      this.isDragging = true;
      this.dragMode = this.isPickMode ? 'orbit' : event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
      this.dragDistance = 0;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.isDragging) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.dragDistance += Math.hypot(dx, dy);
      if (this.isPickMode) {
        // Armed picking treats drag as a no-op so a tiny hand movement does not orbit away from the landmark.
      } else if (this.dragMode === 'pan') {
        this.panByPixels(dx, dy);
      } else {
        this.yaw -= dx * 0.008 * this.controlSensitivity;
        this.pitch = Math.min(1.35, Math.max(-1.35, this.pitch + dy * 0.008 * this.controlSensitivity));
        this.updateCamera();
      }
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    this.canvas.addEventListener('pointerup', event => {
      this.isDragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
      if (this.isPickMode && this.dragDistance < 6) {
        void this.pick(event);
      }
    });
    this.canvas.addEventListener('pointercancel', event => {
      this.isDragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      this.canvas.focus({ preventScroll: true });
      this.zoomBy(wheelZoomFactor(event.deltaY, this.controlSensitivity));
    }, { passive: false });
    this.canvas.addEventListener('keydown', event => {
      if (!keyCodes.has(event.code)) return;
      event.preventDefault();
      if (event.code === 'KeyF' && !event.repeat) {
        this.resetView();
      }
      this.keys.add(event.code);
    });
    this.canvas.addEventListener('keyup', event => {
      if (!keyCodes.has(event.code)) return;
      event.preventDefault();
      this.keys.delete(event.code);
    });
    this.canvas.addEventListener('blur', () => this.keys.clear());
  }

  private async setLayers(inputs: SplatRenderInput[]): Promise<void> {
    const token = ++this.loadToken;
    this.clearLayers();
    this.lastInputs = inputs;
    if (!inputs.length) {
      this.app.renderNextFrame = true;
      return;
    }

    const loaded: LoadedLayer[] = [];
    for (const input of inputs) {
      const asset = await this.loadAsset(input);
      if (token !== this.loadToken) {
        asset.unload();
        this.app.assets.remove(asset);
        return;
      }
      const entity = new Entity(roleName(input), this.app);
      entity.addComponent('gsplat', {
        asset,
        unified: true
      });
      this.applyTransform(entity, input.transform);
      this.app.root.addChild(entity);
      loaded.push({ asset, entity });
    }

    this.layers = loaded;
    this.frame(inputs);
    this.app.renderNextFrame = true;
  }

  private clearLayers(): void {
    for (const layer of this.layers) {
      layer.entity.destroy();
      layer.asset.unload();
      this.app.assets.remove(layer.asset);
    }
    this.layers = [];
  }

  private loadAsset(input: SplatRenderInput): Promise<Asset> {
    const response = new Response(input.buffer.slice(0), {
      headers: { 'content-length': String(input.buffer.byteLength) }
    });
    const file = {
      url: roleName(input).endsWith('.ply') ? roleName(input) : `${roleName(input)}.ply`,
      filename: input.name,
      contents: response
    };
    const asset = new Asset(roleName(input), 'gsplat', file as never, { reorder: true });

    return new Promise((resolve, reject) => {
      asset.once('load', () => resolve(asset));
      asset.once('error', error => reject(error instanceof Error ? error : new Error(String(error))));
      this.app.assets.add(asset);
      this.app.assets.load(asset);
    });
  }

  private applyTransform(entity: Entity, transform?: Sim3Transform): void {
    if (!transform) return;
    const [w, x, y, z] = normalizeQuaternion(mat3ToQuaternion(transform.rotation));
    entity.setLocalPosition(transform.translation[0], transform.translation[1], transform.translation[2]);
    entity.setLocalRotation(new Quat(x, y, z, w));
    entity.setLocalScale(transform.scale, transform.scale, transform.scale);
  }

  private frame(inputs: SplatRenderInput[]): void {
    const { center, radius } = combineBounds(inputs);
    this.target.set(center[0], center[1], center[2]);
    this.distance = Math.max(0.5, radius * 3.2);
    const camera = this.camera.camera;
    if (camera) {
      camera.nearClip = Math.max(0.00001, radius / 100000);
      camera.farClip = Math.max(100, radius * 20);
    }
    this.updateCamera();
  }

  resetView(): void {
    if (this.lastInputs.length) {
      this.frame(this.lastInputs);
    }
  }

  zoomBy(factor: number): void {
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
    const pixelSpan = Math.max(240, Math.min(this.canvas.width, this.canvas.height));
    const scale = (this.distance / pixelSpan) * 1.8 * this.controlSensitivity;
    this.moveTarget(vecAdd(vecScale(right, -dx * scale), vecScale(up, dy * scale)));
  }

  private updateKeyboard(dt: number): void {
    if (!this.keys.size) return;
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
      this.pitch = Math.min(1.35, this.pitch + lookSpeed);
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
    const position = new PcVec3(x, y, z);
    this.camera.setPosition(position);
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

  private async pick(event: PointerEvent): Promise<void> {
    if (!this.onPick || !this.layers.length || !this.camera.camera) {
      this.onPickMiss?.();
      return;
    }
    const { x, y } = this.canvasPoint(event);
    this.picker.prepare(this.camera.camera, this.app.scene);
    const selection = await this.picker.getSelectionAsync(Math.max(0, x - 4), Math.max(0, y - 4), 9, 9);
    const point = await this.picker.getWorldPointAsync(x, y);
    if (!point) {
      this.onPickMiss?.();
      return;
    }
    const selected = selection.find(item => this.layers.some(layer => layer.entity.gsplat === item as GSplatComponent));
    if (selection.length > 0 && !selected && this.layers.length > 1) {
      this.onPickMiss?.();
      return;
    }
    this.onPick([point.x, point.y, point.z]);
  }
}
