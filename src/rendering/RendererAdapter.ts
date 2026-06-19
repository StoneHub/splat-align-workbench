import type { Sim3Transform, Vec3 } from '../domain/sim3';
import type { SplatCloud } from './splatData';

export type SplatRole = 'target' | 'source' | 'overlayTarget' | 'overlaySource';

export interface SplatRenderInput {
  name: string;
  buffer: ArrayBuffer;
  cloud: SplatCloud;
  role: SplatRole;
  transform?: Sim3Transform;
}

export interface SplatViewer {
  setPickHandler(handler: (point: Vec3) => void): void;
  setPickMissHandler(handler: () => void): void;
  setPickMode(enabled: boolean): void;
  setControlSensitivity(value: number): void;
  setLayer(input: SplatRenderInput | null): Promise<void>;
  setOverlay(target: SplatRenderInput | null, source: SplatRenderInput | null, transform?: Sim3Transform): Promise<void>;
  resetView(): void;
  zoomBy(factor: number): void;
  resize(): void;
}
