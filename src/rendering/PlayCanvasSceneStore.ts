import { Application, Asset, Entity, Quat } from 'playcanvas';
import type { Mat3, Sim3Transform } from '../domain/sim3';
import { createDiagnosticSplatBuffer } from './splatColor';
import {
  ViewerDisposedError,
  type SceneReplacement,
  type SplatRenderSource,
  type ViewerScene
} from './RendererAdapter';

export type PlayCanvasLayerSpec = {
  key: string;
  source: SplatRenderSource;
  buffer: ArrayBuffer;
  transform?: Sim3Transform;
};

export type PlayCanvasLoadedLayer = {
  asset: Asset;
  entity: Entity;
  spec: PlayCanvasLayerSpec;
  disposed: boolean;
};

export type PlayCanvasSceneReplacement = SceneReplacement & {
  layersChanged: boolean;
};

type CommittedScene = {
  generation: number;
  scene: ViewerScene;
  specs: PlayCanvasLayerSpec[];
  layers: PlayCanvasLoadedLayer[];
};

type PendingAssetLoad = {
  generation: number;
  cancel(): void;
};

type QuaternionWxyz = [number, number, number, number];

class SupersededAssetLoad extends Error {}

const overlayTargetTint = { color: [0.05, 0.9, 1] as [number, number, number], alpha: 0.38 };
const overlaySourceTint = { color: [1, 0.12, 0.85] as [number, number, number], alpha: 0.44 };
const overlayTargetBuffers = new WeakMap<ArrayBuffer, ArrayBuffer>();
const overlaySourceBuffers = new WeakMap<ArrayBuffer, ArrayBuffer>();

const diagnosticBuffer = (
  input: ArrayBuffer,
  cache: WeakMap<ArrayBuffer, ArrayBuffer>,
  tint: Parameters<typeof createDiagnosticSplatBuffer>[1]
): ArrayBuffer => {
  const cached = cache.get(input);
  if (cached) return cached;
  const created = createDiagnosticSplatBuffer(input, tint);
  cache.set(input, created);
  return created;
};

const sceneLayerSpecs = (scene: ViewerScene): PlayCanvasLayerSpec[] => {
  if (scene.kind === 'empty') return [];
  if (scene.kind === 'single') {
    return [{ key: `single-${scene.splat.name}`, source: scene.splat, buffer: scene.splat.buffer }];
  }

  const specs: PlayCanvasLayerSpec[] = [{
    key: `overlay-target-${scene.target.name}`,
    source: scene.target,
    buffer: diagnosticBuffer(scene.target.buffer, overlayTargetBuffers, overlayTargetTint)
  }];
  if (scene.source) {
    specs.push({
      key: `overlay-source-${scene.source.splat.name}`,
      source: scene.source.splat,
      buffer: diagnosticBuffer(scene.source.splat.buffer, overlaySourceBuffers, overlaySourceTint),
      transform: scene.source.sourceToTarget
    });
  }
  return specs;
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

export class PlayCanvasSceneStore {
  private readonly app: Application;
  private readonly pendingAssetLoads = new Set<PendingAssetLoad>();
  private readonly ownedAssets = new Set<Asset>();
  private readonly stagedLayers = new Set<PlayCanvasLoadedLayer>();
  private committed: CommittedScene | null = null;
  private latestGeneration = 0;
  private disposed = false;

  constructor(app: Application) {
    this.app = app;
  }

  get scene(): ViewerScene | null {
    return this.committed?.scene ?? null;
  }

  get layers(): readonly PlayCanvasLoadedLayer[] {
    return this.committed?.layers ?? [];
  }

  get specs(): readonly PlayCanvasLayerSpec[] {
    return this.committed?.specs ?? [];
  }

  get generation(): number {
    return this.latestGeneration;
  }

  isCurrent(generation: number): boolean {
    return !this.disposed
      && generation === this.latestGeneration
      && this.committed?.generation === generation;
  }

  async replace(scene: ViewerScene): Promise<PlayCanvasSceneReplacement> {
    if (this.disposed) throw new ViewerDisposedError();
    const generation = ++this.latestGeneration;
    this.cancelPendingAssetLoads(load => load.generation < generation);
    const specs = sceneLayerSpecs(scene);

    if (this.canReuse(specs)) {
      const committed = this.committed as CommittedScene;
      specs.forEach((spec, index) => {
        committed.layers[index].spec = spec;
        this.applyTransform(committed.layers[index].entity, spec.transform, true);
      });
      committed.generation = generation;
      committed.scene = scene;
      committed.specs = specs;
      return { status: 'applied', layersChanged: false };
    }

    const staged: PlayCanvasLoadedLayer[] = [];
    try {
      for (const spec of specs) {
        const asset = await this.loadAsset(spec, generation);
        if (this.disposed || generation !== this.latestGeneration) {
          this.releaseAsset(asset);
          throw new SupersededAssetLoad();
        }

        const entity = new Entity(spec.key, this.app);
        try {
          entity.addComponent('gsplat', { asset, unified: true });
          this.applyTransform(entity, spec.transform);
        } catch (error) {
          entity.destroy();
          this.releaseAsset(asset);
          throw error;
        }
        const layer: PlayCanvasLoadedLayer = { asset, entity, spec, disposed: false };
        staged.push(layer);
        this.stagedLayers.add(layer);
      }

      if (this.disposed || generation !== this.latestGeneration) throw new SupersededAssetLoad();

      const previous = this.committed;
      staged.forEach(layer => {
        this.app.root.addChild(layer.entity);
        this.stagedLayers.delete(layer);
      });
      this.committed = { generation, scene, specs, layers: staged };
      this.disposeCommitted(previous);
      return { status: 'applied', layersChanged: true };
    } catch (error) {
      staged.forEach(layer => this.disposeLayer(layer));
      if (error instanceof SupersededAssetLoad || this.disposed || generation !== this.latestGeneration) {
        return { status: 'superseded', layersChanged: false };
      }
      if (this.committed) this.committed.generation = generation;
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.latestGeneration += 1;
    this.cancelPendingAssetLoads(() => true);
    [...this.stagedLayers].forEach(layer => this.disposeLayer(layer));
    this.disposeCommitted(this.committed);
    this.committed = null;
    [...this.ownedAssets].forEach(asset => this.releaseAsset(asset));
  }

  private canReuse(specs: PlayCanvasLayerSpec[]): boolean {
    return Boolean(this.committed
      && specs.length === this.committed.layers.length
      && specs.every((spec, index) => {
        const current = this.committed?.layers[index].spec;
        return current?.key === spec.key && current.buffer === spec.buffer;
      }));
  }

  private async loadAsset(spec: PlayCanvasLayerSpec, generation: number): Promise<Asset> {
    const response = new Response(spec.buffer.slice(0), {
      headers: { 'content-length': String(spec.buffer.byteLength) }
    });
    const file = {
      url: spec.key.endsWith('.ply') ? spec.key : `${spec.key}.ply`,
      filename: spec.source.name,
      contents: response
    };
    const asset = new Asset(spec.key, 'gsplat', file as never, { reorder: true });
    this.ownedAssets.add(asset);

    return new Promise((resolve, reject) => {
      let settled = false;
      let pending!: PendingAssetLoad;
      const clear = () => {
        asset.off('load', onLoad);
        asset.off('error', onError);
        this.pendingAssetLoads.delete(pending);
      };
      const onLoad = () => {
        if (settled) return;
        settled = true;
        clear();
        resolve(asset);
      };
      const onError = (error: unknown) => {
        if (settled) return;
        settled = true;
        clear();
        this.releaseAsset(asset);
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      pending = {
        generation,
        cancel: () => {
          if (settled) return;
          settled = true;
          clear();
          this.releaseAsset(asset);
          reject(new SupersededAssetLoad());
        }
      };

      asset.once('load', onLoad);
      asset.once('error', onError);
      this.pendingAssetLoads.add(pending);
      try {
        this.app.assets.add(asset);
        this.app.assets.load(asset);
      } catch (error) {
        onError(error);
      }
    });
  }

  private cancelPendingAssetLoads(predicate: (load: PendingAssetLoad) => boolean): void {
    [...this.pendingAssetLoads].filter(predicate).forEach(load => load.cancel());
  }

  private releaseAsset(asset: Asset): void {
    if (!this.ownedAssets.delete(asset)) return;
    asset.unload();
    this.app.assets.remove(asset);
  }

  private disposeLayer(layer: PlayCanvasLoadedLayer): void {
    if (layer.disposed) return;
    layer.disposed = true;
    this.stagedLayers.delete(layer);
    layer.entity.destroy();
    this.releaseAsset(layer.asset);
  }

  private disposeCommitted(committed: CommittedScene | null): void {
    committed?.layers.forEach(layer => this.disposeLayer(layer));
  }

  private applyTransform(entity: Entity, transform?: Sim3Transform, reset = false): void {
    if (!transform) {
      if (reset) {
        entity.setLocalPosition(0, 0, 0);
        entity.setLocalRotation(0, 0, 0, 1);
        entity.setLocalScale(1, 1, 1);
      }
      return;
    }
    const [w, x, y, z] = normalizeQuaternion(mat3ToQuaternion(transform.rotation));
    entity.setLocalPosition(transform.translation[0], transform.translation[1], transform.translation[2]);
    entity.setLocalRotation(new Quat(x, y, z, w));
    entity.setLocalScale(transform.scale, transform.scale, transform.scale);
  }
}
