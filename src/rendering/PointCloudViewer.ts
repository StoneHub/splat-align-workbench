import { parsePlyHeader } from '../domain/ply';
import { applySim3, type Sim3Transform, type Vec3 } from '../domain/sim3';

export interface SplatCloud {
  points: Vec3[];
  vertexCount: number;
  boundsMin: Vec3;
  boundsMax: Vec3;
  center: Vec3;
  radius: number;
}

export interface SplatFileStats {
  fileType: string;
  sizeBytes: number;
  vertexCount: number;
}

type Layer = {
  cloud: SplatCloud;
  color: string;
  alpha: number;
  transform?: Sim3Transform;
};

const roleColor = {
  target: '#58d68d',
  source: '#69a7ff',
  overlaySource: '#ff7b72'
};

const toVec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

const updateBounds = (min: Vec3, max: Vec3, point: Vec3) => {
  for (let i = 0; i < 3; i += 1) {
    min[i] = Math.min(min[i], point[i]);
    max[i] = Math.max(max[i], point[i]);
  }
};

const buildCloud = (points: Vec3[], vertexCount: number): SplatCloud => {
  const boundsMin: Vec3 = [Infinity, Infinity, Infinity];
  const boundsMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  points.forEach(point => updateBounds(boundsMin, boundsMax, point));
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
  return { points, vertexCount, boundsMin, boundsMax, center, radius };
};

export function loadSplatCloudFromPly(buffer: ArrayBuffer, sampleLimit = 90_000): SplatCloud {
  const header = parsePlyHeader(buffer);
  if (header.format !== 'binary_little_endian') {
    throw new Error('MVP viewer supports binary_little_endian PLY files');
  }
  const xIndex = header.properties.indexOf('x');
  const yIndex = header.properties.indexOf('y');
  const zIndex = header.properties.indexOf('z');
  if (xIndex === -1 || yIndex === -1 || zIndex === -1) {
    throw new Error('PLY is missing x/y/z properties');
  }

  const view = new DataView(buffer);
  const stride = header.properties.length * 4;
  const step = Math.max(1, Math.ceil(header.vertexCount / sampleLimit));
  const points: Vec3[] = [];

  for (let vertex = 0; vertex < header.vertexCount; vertex += step) {
    const row = header.headerByteLength + vertex * stride;
    points.push(toVec3(
      view.getFloat32(row + xIndex * 4, true),
      view.getFloat32(row + yIndex * 4, true),
      view.getFloat32(row + zIndex * 4, true)
    ));
  }

  return buildCloud(points, header.vertexCount);
}

export function transformedCloud(cloud: SplatCloud, transform: Sim3Transform): SplatCloud {
  return buildCloud(cloud.points.map(point => applySim3(transform, point)), cloud.vertexCount);
}

export class PointCloudViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private layers: Layer[] = [];
  private rotationX = -0.45;
  private rotationY = 0.62;
  private zoom = 1;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;
  private onPick?: (point: Vec3) => void;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.bind();
    this.resize();
  }

  setPickHandler(handler: (point: Vec3) => void): void {
    this.onPick = handler;
  }

  setLayer(cloud: SplatCloud | null, role: 'target' | 'source'): void {
    this.layers = cloud ? [{ cloud, color: roleColor[role], alpha: 0.85 }] : [];
    this.draw();
  }

  setOverlay(target: SplatCloud | null, source: SplatCloud | null, transform?: Sim3Transform): void {
    this.layers = [];
    if (target) this.layers.push({ cloud: target, color: roleColor.target, alpha: 0.62 });
    if (source && transform) this.layers.push({ cloud: source, color: roleColor.overlaySource, alpha: 0.62, transform });
    this.draw();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(320, Math.floor(rect.width * scale));
    this.canvas.height = Math.max(240, Math.floor(rect.height * scale));
    this.draw();
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointerdown', event => {
      this.isDragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.isDragging) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.rotationY += dx * 0.008;
      this.rotationX += dy * 0.008;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.draw();
    });
    this.canvas.addEventListener('pointerup', event => {
      this.isDragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      this.zoom = Math.min(5, Math.max(0.25, this.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('click', event => {
      if (!this.onPick || this.layers.length !== 1) return;
      const point = this.pick(event.offsetX * (window.devicePixelRatio || 1), event.offsetY * (window.devicePixelRatio || 1));
      if (point) this.onPick(point);
    });
  }

  private rotate(point: Vec3, center: Vec3): Vec3 {
    const x0 = point[0] - center[0];
    const y0 = point[1] - center[1];
    const z0 = point[2] - center[2];
    const cy = Math.cos(this.rotationY);
    const sy = Math.sin(this.rotationY);
    const cx = Math.cos(this.rotationX);
    const sx = Math.sin(this.rotationX);
    const x1 = cy * x0 + sy * z0;
    const z1 = -sy * x0 + cy * z0;
    const y1 = cx * y0 - sx * z1;
    const z2 = sx * y0 + cx * z1;
    return [x1, y1, z2];
  }

  private project(point: Vec3, cloud: SplatCloud): { x: number; y: number; depth: number } {
    const rotated = this.rotate(point, cloud.center);
    const fit = Math.min(this.canvas.width, this.canvas.height) * 0.42 * this.zoom / cloud.radius;
    return {
      x: this.canvas.width / 2 + rotated[0] * fit,
      y: this.canvas.height / 2 - rotated[1] * fit,
      depth: rotated[2]
    };
  }

  private draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.layers.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = `${14 * (window.devicePixelRatio || 1)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('Load a local PLY to inspect', this.canvas.width / 2, this.canvas.height / 2);
      return;
    }

    for (const layer of this.layers) {
      const points = layer.transform ? layer.cloud.points.map(point => applySim3(layer.transform as Sim3Transform, point)) : layer.cloud.points;
      const drawPoints = points
        .map(point => ({ point, screen: this.project(point, layer.transform ? transformedCloud(layer.cloud, layer.transform) : layer.cloud) }))
        .sort((left, right) => left.screen.depth - right.screen.depth);
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = layer.alpha;
      const size = Math.max(1.1, (window.devicePixelRatio || 1) * 1.25);
      for (const item of drawPoints) {
        ctx.fillRect(item.screen.x, item.screen.y, size, size);
      }
      ctx.globalAlpha = 1;
    }
  }

  private pick(x: number, y: number): Vec3 | null {
    const layer = this.layers[0];
    if (!layer) return null;
    let best: { point: Vec3; distance: number } | null = null;
    const maxDistance = 16 * (window.devicePixelRatio || 1);
    for (const point of layer.cloud.points) {
      const projected = this.project(point, layer.cloud);
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance < maxDistance && (!best || distance < best.distance)) {
        best = { point, distance };
      }
    }
    return best?.point ?? null;
  }
}
