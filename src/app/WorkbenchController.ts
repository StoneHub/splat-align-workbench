import { analyticsErrorCode, bucketBytes, bucketCount, type AnalyticsProvider } from '../analytics/analytics';
import { canSolveForMode, createPairsForMode, landmarkModeCopy, nextPairForMode, type AlignmentMode } from '../domain/alignmentMode';
import { completeEnabledPairs, flagResiduals, setLandmarkPoint, toggleLandmark, type LandmarkPair } from '../domain/landmarks';
import { parsePlyHeader } from '../domain/ply';
import { createSession, serializeSession } from '../domain/session';
import { solveSim3, type Sim3Success, type Vec3 } from '../domain/sim3';
import { createSyntheticAlignmentFixture, createSyntheticStitchFixture } from '../devFixtures/syntheticSplat';
import { downloadName, makeDownloadBlob } from '../export/exportSession';
import { createMergedSplatPlyBuffer } from '../export/exportPlyTransform';
import type { SplatViewer } from '../rendering/RendererAdapter';
import { loadSplatCloudFromPly, type SplatCloud, type SplatFileStats } from '../rendering/splatData';
import { formatSolveStatus } from './solveFeedback';

export type SplatSide = 'target' | 'source';
export type ViewerName = SplatSide | 'overlay';

export interface SplatFileInput {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

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
  | { kind: 'export'; artifact: 'merged-ply' | 'session-json' };

export interface LoadedSplatSummary {
  displayName: string;
  vertexCount: number;
}

export interface WorkbenchSnapshot {
  revision: number;
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

interface LoadedSplat extends LoadedSplatSummary {
  side: SplatSide;
  buffer: ArrayBuffer;
  cloud: SplatCloud;
  stats: SplatFileStats;
  requestId: number;
}

const emptySplats = (): Record<SplatSide, LoadedSplat | null> => ({ target: null, source: null });

const renderInput = (loaded: LoadedSplat) => ({
  name: loaded.displayName,
  buffer: loaded.buffer,
  cloud: loaded.cloud,
  role: loaded.side
} as const);

export function createWorkbenchController(environment: WorkbenchEnvironment): WorkbenchController {
  const { viewers, analytics, downloads } = environment;
  const now = environment.now ?? (() => new Date());
  const splats = emptySplats();
  const loadRequest = { target: 0, source: 0 };

  let revision = 0;
  let closed = false;
  let mode: AlignmentMode = 'overlap';
  let pairs: LandmarkPair[] = createPairsForMode(mode);
  let activePairId = pairs[0]?.id ?? 'A';
  let activeSide: SplatSide = 'target';
  let alignment: Sim3Success | null = null;
  let status = 'Load target and source splats to begin.';
  let controlSensitivity = 1;

  analytics.track('session_started', { localFilesOnly: true });

  const snapshot = (): WorkbenchSnapshot => {
    const exportReady = Boolean(alignment && splats.target && splats.source);
    return {
      revision,
      mode,
      splats: {
        target: splats.target ? { displayName: splats.target.displayName, vertexCount: splats.target.vertexCount } : null,
        source: splats.source ? { displayName: splats.source.displayName, vertexCount: splats.source.vertexCount } : null
      },
      pairs: pairs.map(pair => ({ ...pair })),
      activePairId,
      activeSide,
      alignment,
      status,
      controlSensitivity,
      exports: { mergedPly: exportReady, sessionJson: exportReady }
    };
  };

  const succeed = (): WorkbenchOutcome => ({ ok: true, snapshot: snapshot() });
  const fail = (problem: WorkbenchProblem): WorkbenchOutcome => ({ ok: false, snapshot: snapshot(), problem });

  const disarmPick = () => {
    viewers.target.setPickMode(false);
    viewers.source.setPickMode(false);
  };

  const showOverlay = async (result: Sim3Success | null) => {
    await viewers.overlay.setOverlay(
      splats.target ? { ...renderInput(splats.target), role: 'target' } : null,
      result && splats.source ? { ...renderInput(splats.source), role: 'source' } : null,
      result?.transform
    );
  };

  const recompute = async () => {
    const complete = completeEnabledPairs(pairs);
    alignment = null;

    if (canSolveForMode(mode, pairs)) {
      const result = solveSim3(complete.map(pair => pair.source), complete.map(pair => pair.target));
      analytics.track('solve_attempted', { mode, pairCount: complete.length, ok: result.ok });
      if (result.ok) {
        alignment = result;
        const residualMap = Object.fromEntries(complete.map((pair, index) => [pair.id, result.residuals[index]]));
        pairs = flagResiduals(pairs, residualMap, Math.max(0.05, result.rmse * 2.5));
        await showOverlay(result);
        status = formatSolveStatus(complete.length, result.rmse, result.warnings);
        analytics.track('alignment_previewed', {
          mode,
          pairCount: complete.length,
          rmseBucket: result.rmse < 0.05 ? '<0.05' : result.rmse < 0.5 ? '0.05-0.5' : '0.5+'
        });
        return;
      }
      await showOverlay(null);
      status = result.reason;
      return;
    }

    await showOverlay(null);
    const copy = landmarkModeCopy(mode);
    const incomplete = mode === 'overlap' ? `${complete.length}/3 complete pairs. ${copy.incompleteText}` : copy.incompleteText;
    status = splats.target && splats.source ? incomplete : 'Load target and source splats to begin.';
  };

  const restoreLatestLayerAfterStaleLoad = async (side: SplatSide, staleRequestId: number) => {
    const latest = splats[side];
    if (latest && latest.requestId !== staleRequestId) {
      await viewers[side].setLayer(renderInput(latest));
    }
  };

  const loadSplat = async (side: SplatSide, file: SplatFileInput, recomputeAfter = true) => {
    const requestId = ++loadRequest[side];
    const buffer = await file.arrayBuffer();
    if (requestId !== loadRequest[side]) return;

    const cloud = loadSplatCloudFromPly(buffer);
    const header = parsePlyHeader(buffer);
    const loaded: LoadedSplat = {
      side,
      displayName: file.name,
      vertexCount: header.vertexCount,
      buffer,
      cloud,
      requestId,
      stats: {
        fileType: file.name.split('.').pop()?.toLowerCase() ?? 'unknown',
        sizeBytes: file.size,
        vertexCount: header.vertexCount
      }
    };

    splats[side] = loaded;
    await viewers[side].setLayer(renderInput(loaded));
    if (requestId !== loadRequest[side]) {
      await restoreLatestLayerAfterStaleLoad(side, requestId);
      return;
    }

    analytics.track('file_loaded', {
      role: side,
      fileType: loaded.stats.fileType,
      sizeBucket: bucketBytes(loaded.stats.sizeBytes),
      splatCountBucket: bucketCount(loaded.stats.vertexCount)
    });
    if (recomputeAfter) await recompute();
  };

  const fixtureFile = (name: string, buffer: ArrayBuffer): SplatFileInput => ({
    name,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.slice(0)
  });

  const loadSynthetic = async () => {
    const fixture = mode === 'stitch' ? createSyntheticStitchFixture() : createSyntheticAlignmentFixture();
    await loadSplat('target', fixtureFile(fixture.files.target.name, fixture.files.target.buffer), false);
    await loadSplat('source', fixtureFile(fixture.files.source.name, fixture.files.source.buffer), false);
    pairs = fixture.manifest.landmarks.map(landmark => {
      const virtual = fixture.manifest.stitch?.constraints.find(item => item.id === landmark.id);
      return {
        id: landmark.id,
        label: virtual?.label ?? 'Match point',
        kind: virtual?.kind ?? landmark.kind ?? 'match',
        enabled: true,
        quality: 'unset'
      };
    });
    activePairId = pairs[0]?.id ?? 'A';
    activeSide = 'target';
    alignment = null;
    disarmPick();
    await recompute();
    analytics.track('fixture_loaded', { type: fixture.manifest.fixtureName, mode, landmarkCount: fixture.manifest.landmarks.length });
    status = landmarkModeCopy(mode).syntheticLoadedText;
  };

  const exportArtifact = (artifact: 'merged-ply' | 'session-json'): WorkbenchProblem | null => {
    if (!alignment || !splats.target || !splats.source) {
      return { code: 'export-unavailable', message: 'Load both splats and complete a valid Alignment before export.' };
    }

    const createdAt = now().toISOString();
    if (artifact === 'merged-ply') {
      const merged = createMergedSplatPlyBuffer(splats.target.buffer, splats.source.buffer, alignment.transform);
      downloads.save(
        downloadName('merged-splats', createdAt, 'ply'),
        makeDownloadBlob(merged, 'application/octet-stream')
      );
      analytics.track('export_completed', { type: 'merged-ply' });
      return null;
    }

    const session = createSession({
      createdAt,
      target: {
        fileType: splats.target.stats.fileType,
        sizeBucket: bucketBytes(splats.target.stats.sizeBytes),
        splatCountBucket: bucketCount(splats.target.stats.vertexCount)
      },
      source: {
        fileType: splats.source.stats.fileType,
        sizeBucket: bucketBytes(splats.source.stats.sizeBytes),
        splatCountBucket: bucketCount(splats.source.stats.vertexCount)
      },
      landmarks: pairs,
      transform: alignment.transform,
      rmse: alignment.rmse,
      warnings: alignment.warnings
    });
    downloads.save(
      downloadName('splat-align-session', createdAt, 'json'),
      makeDownloadBlob(serializeSession(session), 'application/json')
    );
    analytics.track('export_completed', { type: 'session-json' });
    return null;
  };

  const execute = async (command: WorkbenchCommand): Promise<WorkbenchOutcome> => {
    if (closed) {
      return fail({ code: 'workbench-closed', message: 'This workbench is closed.' });
    }

    try {
      switch (command.kind) {
        case 'change-mode':
          mode = command.mode;
          pairs = createPairsForMode(mode);
          activePairId = pairs[0]?.id ?? 'A';
          activeSide = 'target';
          alignment = null;
          disarmPick();
          await recompute();
          analytics.track('alignment_mode_changed', { mode });
          break;
        case 'load-splat':
          await loadSplat(command.side, command.file);
          break;
        case 'load-synthetic':
          await loadSynthetic();
          break;
        case 'select-pair':
          activePairId = command.pairId;
          break;
        case 'arm-pick': {
          activePairId = command.pairId;
          activeSide = command.side;
          viewers.target.setPickMode(command.side === 'target');
          viewers.source.setPickMode(command.side === 'source');
          const label = pairs.find(pair => pair.id === command.pairId)?.label ?? command.pairId;
          status = `Click a point in the ${command.side} viewer for ${label}.`;
          break;
        }
        case 'record-pick': {
          const pickedPair = activePairId;
          pairs = setLandmarkPoint(pairs, pickedPair, command.side, command.point);
          activeSide = command.side === 'target' ? 'source' : 'target';
          analytics.track('landmark_pair_set', { side: command.side, pairId: pickedPair });
          await recompute();
          if (command.side === 'target') {
            viewers.target.setPickMode(false);
            viewers.source.setPickMode(true);
            const label = pairs.find(pair => pair.id === pickedPair)?.label ?? pickedPair;
            status = `Click a point in the source viewer for ${label}.`;
          } else {
            disarmPick();
            const label = pairs.find(pair => pair.id === pickedPair)?.label ?? `Landmark ${pickedPair}`;
            status = `${label} source point set. ${landmarkModeCopy(mode).sourceCompleteText}`;
          }
          break;
        }
        case 'pick-missed':
          status = `No ${command.side} splat point under click for landmark ${activePairId}. Try zooming closer or click denser splat detail.`;
          break;
        case 'set-pair-enabled':
          pairs = toggleLandmark(pairs, command.pairId, command.enabled);
          await recompute();
          break;
        case 'add-pair': {
          const next = nextPairForMode(mode, pairs);
          pairs = [...pairs, next];
          activePairId = next.id;
          break;
        }
        case 'set-control-sensitivity':
          controlSensitivity = command.value;
          Object.values(viewers).forEach(viewer => viewer.setControlSensitivity(command.value));
          break;
        case 'reset-view':
          viewers[command.viewer].resetView();
          break;
        case 'zoom-view':
          viewers[command.viewer].zoomBy(command.factor);
          break;
        case 'export': {
          const problem = exportArtifact(command.artifact);
          if (problem) return fail(problem);
          break;
        }
      }
      revision += 1;
      return succeed();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const area = command.kind === 'export' ? 'export' : command.kind === 'load-splat' || command.kind === 'load-synthetic' ? 'file_load' : 'workbench';
      analytics.track('error_reported', { area, code: analyticsErrorCode(error) });
      status = message;
      revision += 1;
      return fail({ code: 'operation-failed', message });
    }
  };

  return {
    current: snapshot,
    execute,
    close() {
      if (closed) return;
      closed = true;
      disarmPick();
    }
  };
}
