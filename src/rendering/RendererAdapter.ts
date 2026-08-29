import type { Sim3Transform, Vec3 } from '../domain/sim3';
import type { SplatCloud } from './splatData';

export interface SplatRenderSource {
  readonly name: string;
  readonly buffer: ArrayBuffer;
  readonly cloud: SplatCloud;
}

export interface LandmarkDiagnostic {
  readonly id: string;
  readonly target?: Vec3;
  readonly source?: Vec3;
  readonly enabled: boolean;
  readonly selected: boolean;
  readonly quality: 'unset' | 'good' | 'outlier';
}

export type ViewerScene =
  | { readonly kind: 'empty' }
  | { readonly kind: 'single'; readonly splat: SplatRenderSource }
  | {
      readonly kind: 'overlay';
      readonly target: SplatRenderSource;
      readonly source: {
        readonly splat: SplatRenderSource;
        readonly sourceToTarget: Sim3Transform;
      } | null;
      readonly diagnostics: readonly LandmarkDiagnostic[];
    };

export type SceneReplacement =
  | { readonly status: 'applied' }
  | { readonly status: 'superseded' };

export type PickEvent =
  | { readonly kind: 'hit'; readonly worldPosition: Vec3 }
  | { readonly kind: 'miss' };

export type ViewerNavigation =
  | { readonly kind: 'reset' }
  | { readonly kind: 'zoom'; readonly factor: number };

export class ViewerDisposedError extends Error {
  constructor() {
    super('The splat viewer has been disposed.');
    this.name = 'ViewerDisposedError';
  }
}

export interface SplatViewer {
  replace(scene: ViewerScene): Promise<SceneReplacement>;
  onPick(handler: (event: PickEvent) => void): () => void;
  setPickMode(enabled: boolean): void;
  setControlSensitivity(value: number): void;
  navigate(command: ViewerNavigation): void;
  resize(): void;
  dispose(): void;
}
