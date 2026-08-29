import type { AnalyticsProvider } from '../analytics/analytics';
import type { AlignmentMode } from '../domain/alignmentMode';
import type { LandmarkPair } from '../domain/landmarks';
import type { Sim3Success, Vec3 } from '../domain/sim3';
import type { SplatFileInput, SplatSide } from '../domain/splatArtifact';
import type { SplatViewer } from '../rendering/RendererAdapter';
import type { WorkbenchArtifactKind } from './workbenchExport';

export type { SplatFileInput, SplatSide } from '../domain/splatArtifact';

export type ViewerName = SplatSide | 'overlay';

export interface DownloadAdapter {
  save(name: string, blob: Blob): void;
}

export interface WorkbenchEnvironment {
  viewers: Record<ViewerName, SplatViewer>;
  analytics: AnalyticsProvider;
  downloads: DownloadAdapter;
  now?: () => Date;
}

export type WorkbenchCommand =
  | { kind: 'change-mode'; mode: AlignmentMode }
  | { kind: 'load-splat'; side: SplatSide; file: SplatFileInput }
  | { kind: 'load-synthetic' }
  | { kind: 'select-pair'; pairId: string }
  | { kind: 'arm-pick'; pairId: string; side: SplatSide }
  | { kind: 'record-pick'; side: SplatSide; point: Vec3 }
  | { kind: 'pick-missed'; side: SplatSide }
  | { kind: 'set-pair-enabled'; pairId: string; enabled: boolean }
  | { kind: 'add-pair' }
  | { kind: 'set-control-sensitivity'; value: number }
  | { kind: 'reset-view'; viewer: ViewerName }
  | { kind: 'zoom-view'; viewer: ViewerName; factor: number }
  | { kind: 'export'; artifact: WorkbenchArtifactKind };

export interface LoadedSplatSummary {
  displayName: string;
  vertexCount: number;
}

export interface WorkbenchSnapshot {
  mode: AlignmentMode;
  splats: Record<SplatSide, LoadedSplatSummary | null>;
  pairs: readonly LandmarkPair[];
  activePairId: string;
  activeSide: SplatSide;
  alignment: Sim3Success | null;
  status: string;
  controlSensitivity: number;
  exports: {
    mergedPly: boolean;
    sessionJson: boolean;
  };
}

export interface WorkbenchProblem {
  code: 'workbench-closed' | 'export-unavailable' | 'operation-failed';
  message: string;
}

export type WorkbenchOutcome =
  | { ok: true; snapshot: WorkbenchSnapshot }
  | { ok: false; snapshot: WorkbenchSnapshot; problem: WorkbenchProblem };

export interface WorkbenchController {
  current(): WorkbenchSnapshot;
  execute(command: WorkbenchCommand): Promise<WorkbenchOutcome>;
  close(): void;
}
