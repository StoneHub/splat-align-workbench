import { analyticsErrorCode, bucketBytes, bucketCount } from '../analytics/analytics';
import { canSolveForMode, createPairsForMode, landmarkModeCopy, nextPairForMode, type AlignmentMode } from '../domain/alignmentMode';
import { completeEnabledPairs, flagResiduals, setLandmarkPoint, toggleLandmark, type LandmarkPair } from '../domain/landmarks';
import { solveSim3, type Sim3Success } from '../domain/sim3';
import { inMemorySplatFile, readSplatArtifact, splatRenderInput, type SplatArtifact, type SplatFileInput, type SplatSide } from '../domain/splatArtifact';
import { createSyntheticAlignmentFixture, createSyntheticStitchFixture } from '../devFixtures/syntheticSplat';
import { formatSolveStatus } from './solveFeedback';
import { buildWorkbenchArtifact, type WorkbenchArtifactKind } from './workbenchExport';
import { cloneAlignment, cloneLandmarkPairs } from './workbenchSnapshot';
import type { WorkbenchCommand, WorkbenchController, WorkbenchEnvironment, WorkbenchOutcome, WorkbenchProblem, WorkbenchSnapshot } from './workbenchTypes';

export type {
  DownloadAdapter,
  SplatFileInput,
  SplatSide,
  ViewerName,
  WorkbenchCommand,
  WorkbenchController,
  WorkbenchEnvironment,
  WorkbenchOutcome,
  WorkbenchProblem,
  WorkbenchSnapshot
} from './workbenchTypes';

interface LoadedSplat extends SplatArtifact {
  requestId: number;
}

interface WorkbenchStateBackup {
  mode: AlignmentMode;
  splats: Record<SplatSide, LoadedSplat | null>;
  pairs: LandmarkPair[];
  activePairId: string;
  activeSide: SplatSide;
  alignment: Sim3Success | null;
  status: string;
}

const emptySplats = (): Record<SplatSide, LoadedSplat | null> => ({ target: null, source: null });

export function createWorkbenchController(environment: WorkbenchEnvironment): WorkbenchController {
  const { viewers, analytics, downloads } = environment;
  const now = environment.now ?? (() => new Date());
  const splats = emptySplats();
  const loadRequest = { target: 0, source: 0 };

  let closed = false;
  let mode: AlignmentMode = 'overlap';
  let pairs: LandmarkPair[] = createPairsForMode(mode);
  let activePairId = pairs[0]?.id ?? 'A';
  let activeSide: SplatSide = 'target';
  let alignment: Sim3Success | null = null;
  let status = 'Load target and source splats to begin.';
  let controlSensitivity = 1;
  let stateRevision = 0;
  let alignmentRevision = 0;
  let pendingLoadCount = 0;
  let loadBackup: WorkbenchStateBackup | null = null;
  let overlayQueueTail = Promise.resolve();
  const layerQueueTail: Record<SplatSide, Promise<void>> = {
    target: Promise.resolve(),
    source: Promise.resolve()
  };

  analytics.track('session_started', { localFilesOnly: true });

  const snapshot = (): WorkbenchSnapshot => {
    const exportReady = Boolean(alignment && splats.target && splats.source);
    return {
      mode,
      splats: {
        target: splats.target ? { displayName: splats.target.displayName, vertexCount: splats.target.vertexCount } : null,
        source: splats.source ? { displayName: splats.source.displayName, vertexCount: splats.source.vertexCount } : null
      },
      pairs: cloneLandmarkPairs(pairs),
      activePairId,
      activeSide,
      alignment: cloneAlignment(alignment),
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

  const showOverlay = (result: Sim3Success | null): Promise<void> => {
    const target = splats.target ? splatRenderInput(splats.target) : null;
    const source = result && splats.source ? splatRenderInput(splats.source) : null;
    const effect = overlayQueueTail.then(() => viewers.overlay.setOverlay(target, source, result?.transform));
    overlayQueueTail = effect.catch(() => undefined);
    return effect;
  };

  const setLayer = (side: SplatSide, input: ReturnType<typeof splatRenderInput> | null): Promise<void> => {
    const effect = layerQueueTail[side].then(() => viewers[side].setLayer(input));
    layerQueueTail[side] = effect.catch(() => undefined);
    return effect;
  };

  const captureState = (): WorkbenchStateBackup => ({
    mode,
    splats: { ...splats },
    pairs: cloneLandmarkPairs(pairs),
    activePairId,
    activeSide,
    alignment: cloneAlignment(alignment),
    status
  });

  const restoreState = (backup: WorkbenchStateBackup) => {
    mode = backup.mode;
    splats.target = backup.splats.target;
    splats.source = backup.splats.source;
    pairs = cloneLandmarkPairs(backup.pairs);
    activePairId = backup.activePairId;
    activeSide = backup.activeSide;
    alignment = cloneAlignment(backup.alignment);
    status = backup.status;
  };

  const recompute = async (expectedRevision: number) => {
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
        if (expectedRevision !== stateRevision) return;
        status = formatSolveStatus(complete.length, result.rmse, result.warnings);
        analytics.track('alignment_previewed', {
          mode,
          pairCount: complete.length,
          rmseBucket: result.rmse < 0.05 ? '<0.05' : result.rmse < 0.5 ? '0.05-0.5' : '0.5+'
        });
        return;
      }
      await showOverlay(null);
      if (expectedRevision !== stateRevision) return;
      status = result.reason;
      return;
    }

    await showOverlay(null);
    if (expectedRevision !== stateRevision) return;
    const copy = landmarkModeCopy(mode);
    const incomplete = mode === 'overlap' ? `${complete.length}/3 complete pairs. ${copy.incompleteText}` : copy.incompleteText;
    status = splats.target && splats.source ? incomplete : 'Load target and source splats to begin.';
  };

  const loadSplat = async (
    side: SplatSide,
    file: SplatFileInput,
    initiatingRevision: number,
    initiatingAlignmentRevision: number,
    recomputeAfter = true
  ) => {
    const requestId = ++loadRequest[side];
    let loadRevision = initiatingRevision;
    let loadAlignmentRevision = initiatingAlignmentRevision;
    if (pendingLoadCount === 0) loadBackup = captureState();
    pendingLoadCount += 1;

    try {
      alignment = null;
      disarmPick();
      await showOverlay(null);

      const artifact = await readSplatArtifact(side, file);
      if (requestId !== loadRequest[side]) return;
      const loaded: LoadedSplat = {
        ...artifact,
        requestId,
      };

      await setLayer(side, splatRenderInput(loaded));
      if (requestId !== loadRequest[side]) return;
      splats[side] = loaded;
      pairs = createPairsForMode(mode);
      activePairId = pairs[0]?.id ?? 'A';
      activeSide = 'target';
      alignment = null;
      loadRevision = ++stateRevision;
      loadAlignmentRevision = ++alignmentRevision;

      analytics.track('file_loaded', {
        role: side,
        fileType: loaded.stats.fileType,
        sizeBucket: bucketBytes(loaded.stats.sizeBytes),
        splatCountBucket: bucketCount(loaded.stats.vertexCount)
      });
      if (recomputeAfter) await recompute(loadRevision);
      loadBackup = captureState();
    } catch (error) {
      if (requestId === loadRequest[side] && loadBackup) {
        const loadStillOwnsState = stateRevision === loadRevision;
        const loadStillOwnsAlignment = alignmentRevision === loadAlignmentRevision;
        if (loadStillOwnsAlignment && mode === loadBackup.mode) {
          if (loadStillOwnsState) {
            restoreState(loadBackup);
          } else {
            splats.target = loadBackup.splats.target;
            splats.source = loadBackup.splats.source;
            pairs = cloneLandmarkPairs(loadBackup.pairs);
            alignment = cloneAlignment(loadBackup.alignment);
          }
        } else {
          splats.target = loadBackup.splats.target;
          splats.source = loadBackup.splats.source;
        }
        await setLayer(side, splats[side] ? splatRenderInput(splats[side]) : null);
        await showOverlay(alignment);
        if (loadStillOwnsState) status = error instanceof Error ? error.message : String(error);
      }
      if (requestId === loadRequest[side]) throw error;
    } finally {
      pendingLoadCount -= 1;
      if (pendingLoadCount === 0) loadBackup = null;
    }
  };

  const loadSynthetic = async () => {
    const fixture = mode === 'stitch' ? createSyntheticStitchFixture() : createSyntheticAlignmentFixture();
    await loadSplat('target', inMemorySplatFile(fixture.files.target.name, fixture.files.target.buffer), stateRevision, alignmentRevision, false);
    await loadSplat('source', inMemorySplatFile(fixture.files.source.name, fixture.files.source.buffer), stateRevision, alignmentRevision, false);
    const fixtureRevision = ++stateRevision;
    alignmentRevision += 1;
    pairs = fixture.manifest.landmarks.map(landmark => {
      const virtual = fixture.manifest.stitch?.correspondences.find(item => item.id === landmark.id);
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
    await recompute(fixtureRevision);
    if (fixtureRevision !== stateRevision) return;
    analytics.track('fixture_loaded', { type: fixture.manifest.fixtureName, mode, landmarkCount: fixture.manifest.landmarks.length });
    status = landmarkModeCopy(mode).syntheticLoadedText;
  };

  const exportArtifact = (artifact: WorkbenchArtifactKind): WorkbenchProblem | null => {
    if (!alignment || !splats.target || !splats.source) {
      return { code: 'export-unavailable', message: 'Load both splats and complete a valid Alignment before export.' };
    }

    const built = buildWorkbenchArtifact({
      kind: artifact,
      createdAt: now().toISOString(),
      mode,
      target: splats.target,
      source: splats.source,
      pairs,
      alignment
    });
    downloads.save(built.name, built.blob);
    analytics.track('export_completed', { type: artifact });
    return null;
  };

  const execute = async (command: WorkbenchCommand): Promise<WorkbenchOutcome> => {
    if (closed) {
      return fail({ code: 'workbench-closed', message: 'This workbench is closed.' });
    }

    const commandRevision = ++stateRevision;
    if (
      command.kind === 'change-mode' ||
      command.kind === 'load-splat' ||
      command.kind === 'load-synthetic' ||
      command.kind === 'record-pick' ||
      command.kind === 'set-pair-enabled' ||
      command.kind === 'add-pair'
    ) {
      alignmentRevision += 1;
    }
    const commandAlignmentRevision = alignmentRevision;
    try {
      switch (command.kind) {
        case 'change-mode':
          mode = command.mode;
          pairs = createPairsForMode(mode);
          activePairId = pairs[0]?.id ?? 'A';
          activeSide = 'target';
          alignment = null;
          disarmPick();
          await recompute(commandRevision);
          if (commandRevision === stateRevision) analytics.track('alignment_mode_changed', { mode });
          break;
        case 'load-splat':
          await loadSplat(command.side, command.file, commandRevision, commandAlignmentRevision);
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
          await recompute(commandRevision);
          if (commandRevision !== stateRevision) break;
          if (command.side === 'target') {
            viewers.target.setPickMode(false);
            viewers.source.setPickMode(true);
            const label = pairs.find(pair => pair.id === pickedPair)?.label ?? pickedPair;
            status = `Click a point in the source viewer for ${label}.`;
          } else {
            disarmPick();
            if (!alignment) {
              const label = pairs.find(pair => pair.id === pickedPair)?.label ?? `Landmark ${pickedPair}`;
              status = `${label} source point set. ${landmarkModeCopy(mode).sourceCompleteText}`;
            }
          }
          break;
        }
        case 'pick-missed':
          status = `No ${command.side} splat point under click for landmark ${activePairId}. Try zooming closer or click denser splat detail.`;
          break;
        case 'set-pair-enabled':
          pairs = toggleLandmark(pairs, command.pairId, command.enabled);
          await recompute(commandRevision);
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
      return succeed();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const area = command.kind === 'export' ? 'export' : command.kind === 'load-splat' || command.kind === 'load-synthetic' ? 'file_load' : 'workbench';
      analytics.track('error_reported', { area, code: analyticsErrorCode(error) });
      if (commandRevision === stateRevision) status = message;
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
