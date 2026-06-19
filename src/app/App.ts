import { analyticsErrorCode, bucketBytes, bucketCount, createAnalyticsProvider } from '../analytics/analytics';
import { canSolveForMode, createPairsForMode, landmarkModeCopy, nextPairForMode, type AlignmentMode } from '../domain/alignmentMode';
import { completeEnabledPairs, flagResiduals, setLandmarkPoint, toggleLandmark, type LandmarkPair } from '../domain/landmarks';
import { parsePlyHeader } from '../domain/ply';
import { solveSim3, type Sim3Success } from '../domain/sim3';
import { createSyntheticAlignmentFixture, createSyntheticStitchFixture } from '../devFixtures/syntheticSplat';
import { makeDownloadBlob, downloadName } from '../export/exportSession';
import { createMergedSplatPlyBuffer } from '../export/exportPlyTransform';
import { controlSensitivityLabel, DEFAULT_CONTROL_SENSITIVITY, PlayCanvasSplatViewer, wheelZoomFactor } from '../rendering/PlayCanvasSplatViewer';
import { loadSplatCloudFromPly, type SplatCloud, type SplatFileStats } from '../rendering/splatData';
import { createAppMarkup } from './appMarkup';
import { formatSolveStatus } from './solveFeedback';

interface LoadedSplat {
  role: 'target' | 'source';
  displayName: string;
  buffer: ArrayBuffer;
  cloud: SplatCloud;
  stats: SplatFileStats;
}

const analytics = createAnalyticsProvider(import.meta.env.VITE_ANALYTICS_ENDPOINT);

const emptySplatState = () => ({
  target: null as LoadedSplat | null,
  source: null as LoadedSplat | null
});

export function createApp(root: HTMLElement): void {
  root.innerHTML = createAppMarkup();

  analytics.track('session_started', { localFilesOnly: true });

  const state = emptySplatState();
  let mode: AlignmentMode = 'overlap';
  let pairs: LandmarkPair[] = createPairsForMode(mode);
  let activePairId = 'A';
  let activeSide: 'target' | 'source' = 'target';
  let alignment: Sim3Success | null = null;

  const targetViewer = new PlayCanvasSplatViewer(root.querySelector('[data-viewer="target"]') as HTMLCanvasElement);
  const sourceViewer = new PlayCanvasSplatViewer(root.querySelector('[data-viewer="source"]') as HTMLCanvasElement);
  const overlayViewer = new PlayCanvasSplatViewer(root.querySelector('[data-viewer="overlay"]') as HTMLCanvasElement);
  const viewers = { target: targetViewer, source: sourceViewer, overlay: overlayViewer };
  let controlSensitivity = DEFAULT_CONTROL_SENSITIVITY;

  const setControlSensitivity = (value: number) => {
    controlSensitivity = value;
    Object.values(viewers).forEach(viewer => viewer.setControlSensitivity(value));
    (root.querySelector('[data-control-sensitivity-label]') as HTMLOutputElement).value = controlSensitivityLabel(value);
  };

  const setStatus = (message: string) => {
    (root.querySelector('[data-status]') as HTMLElement).textContent = message;
  };

  const currentCopy = () => landmarkModeCopy(mode);

  const download = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const recompute = () => {
    const complete = completeEnabledPairs(pairs);
    alignment = null;
    if (canSolveForMode(mode, pairs)) {
      const result = solveSim3(complete.map(pair => pair.source), complete.map(pair => pair.target));
      analytics.track('solve_attempted', { mode, pairCount: complete.length, ok: result.ok });
      if (result.ok) {
        alignment = result;
        const residualMap = Object.fromEntries(complete.map((pair, index) => [pair.id, result.residuals[index]]));
        const threshold = Math.max(0.05, result.rmse * 2.5);
        pairs = flagResiduals(pairs, residualMap, threshold);
        void overlayViewer.setOverlay(
          state.target ? { name: state.target.displayName, buffer: state.target.buffer, cloud: state.target.cloud, role: 'target' } : null,
          state.source ? { name: state.source.displayName, buffer: state.source.buffer, cloud: state.source.cloud, role: 'source' } : null,
          result.transform
        ).catch(error => setStatus(error instanceof Error ? error.message : String(error)));
        setStatus(formatSolveStatus(complete.length, result.rmse, result.warnings));
        analytics.track('alignment_previewed', { mode, pairCount: complete.length, rmseBucket: result.rmse < 0.05 ? '<0.05' : result.rmse < 0.5 ? '0.05-0.5' : '0.5+' });
      } else {
        void overlayViewer.setOverlay(
          state.target ? { name: state.target.displayName, buffer: state.target.buffer, cloud: state.target.cloud, role: 'target' } : null,
          null
        ).catch(error => setStatus(error instanceof Error ? error.message : String(error)));
        setStatus(result.reason);
      }
    } else {
      void overlayViewer.setOverlay(
        state.target ? { name: state.target.displayName, buffer: state.target.buffer, cloud: state.target.cloud, role: 'target' } : null,
        null
      ).catch(error => setStatus(error instanceof Error ? error.message : String(error)));
      const incompleteStatus = mode === 'overlap'
        ? `${complete.length}/3 complete pairs. ${currentCopy().incompleteText}`
        : currentCopy().incompleteText;
      setStatus(state.target && state.source ? incompleteStatus : 'Load target and source splats to begin.');
    }
    renderLandmarks();
    updateButtons();
  };

  const updateButtons = () => {
    const hasAlignment = Boolean(alignment);
    (root.querySelector('[data-action="export-ply"]') as HTMLButtonElement).disabled = !hasAlignment || !state.target || !state.source;
    (root.querySelector('[data-overlay-label]') as HTMLElement).textContent = hasAlignment ? currentCopy().solvedText : currentCopy().needsText;
  };

  const updateModeChrome = () => {
    const copy = currentCopy();
    (root.querySelector('[data-mode-lede]') as HTMLElement).textContent = copy.lede;
    (root.querySelector('[data-landmark-toolbar] strong') as HTMLElement).textContent = copy.toolbarTitle;
    root.querySelectorAll<HTMLButtonElement>('[data-alignment-mode]').forEach(button => {
      const active = button.dataset.alignmentMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const renderLandmarks = () => {
    const list = root.querySelector('[data-landmarks]') as HTMLElement;
    list.innerHTML = pairs.map(pair => {
      const active = pair.id === activePairId;
      const label = pair.label ?? 'Match point';
      const target = pair.target ? pair.target.map(value => value.toFixed(3)).join(', ') : 'pick';
      const source = pair.source ? pair.source.map(value => value.toFixed(3)).join(', ') : 'pick';
      const residual = pair.residual === undefined ? '' : `<span class="residual ${pair.quality === 'outlier' ? 'bad' : ''}">${pair.residual.toFixed(4)}</span>`;
      const targetPickClass = active && activeSide === 'target' ? ' class="armed-pick"' : '';
      const sourcePickClass = active && activeSide === 'source' ? ' class="armed-pick"' : '';
      return `
        <div class="landmark-row ${active ? 'active' : ''}" data-pair="${pair.id}">
          <button type="button" data-select-pair="${pair.id}">${pair.id}</button>
          <label><input type="checkbox" data-toggle-pair="${pair.id}" ${pair.enabled ? 'checked' : ''} /> enabled</label>
          <span class="constraint-label">${label}</span>
          <button type="button" data-pick-side="target" data-pair-id="${pair.id}"${targetPickClass}>Target: ${target}</button>
          <button type="button" data-pick-side="source" data-pair-id="${pair.id}"${sourcePickClass}>Source: ${source}</button>
          ${residual}
        </div>
      `;
    }).join('');
  };

  const armPick = (side: 'target' | 'source', pairId = activePairId) => {
    activePairId = pairId;
    activeSide = side;
    targetViewer.setPickMode(side === 'target');
    sourceViewer.setPickMode(side === 'source');
    renderLandmarks();
    const label = pairs.find(pair => pair.id === pairId)?.label ?? pairId;
    setStatus(`Click a point in the ${side} viewer for ${label}.`);
  };

  const disarmPick = () => {
    targetViewer.setPickMode(false);
    sourceViewer.setPickMode(false);
  };

  const handlePick = (side: 'target' | 'source', point: [number, number, number]) => {
    pairs = setLandmarkPoint(pairs, activePairId, side, point);
    const pickedPair = activePairId;
    activeSide = side === 'target' ? 'source' : 'target';
    analytics.track('landmark_pair_set', { side, pairId: activePairId });
    recompute();
    if (side === 'target') {
      armPick('source', pickedPair);
    } else {
      disarmPick();
      setStatus(`${pairs.find(pair => pair.id === pickedPair)?.label ?? `Landmark ${pickedPair}`} source point set. ${currentCopy().sourceCompleteText}`);
    }
  };

  targetViewer.setPickHandler(point => handlePick('target', point));
  sourceViewer.setPickHandler(point => handlePick('source', point));
  targetViewer.setPickMissHandler(() => setStatus(`No target splat point under click for landmark ${activePairId}. Try zooming closer or click denser splat detail.`));
  sourceViewer.setPickMissHandler(() => setStatus(`No source splat point under click for landmark ${activePairId}. Try zooming closer or click denser splat detail.`));

  const loadFile = async (role: 'target' | 'source', file: File) => {
    const buffer = await file.arrayBuffer();
    const cloud = loadSplatCloudFromPly(buffer);
    const header = parsePlyHeader(buffer);
    const loaded: LoadedSplat = {
      role,
      displayName: file.name,
      buffer,
      cloud,
      stats: { fileType: file.name.split('.').pop()?.toLowerCase() ?? 'unknown', sizeBytes: file.size, vertexCount: header.vertexCount }
    };
    state[role] = loaded;
    const renderInput = { name: file.name, buffer, cloud, role };
    if (role === 'target') await targetViewer.setLayer(renderInput);
    else await sourceViewer.setLayer(renderInput);
    (root.querySelector(`[data-file-label="${role}"]`) as HTMLElement).textContent = `${file.name} · ${header.vertexCount.toLocaleString()} splats`;
    analytics.track('file_loaded', {
      role,
      fileType: loaded.stats.fileType,
      sizeBucket: bucketBytes(file.size),
      splatCountBucket: bucketCount(header.vertexCount)
    });
    recompute();
  };

  const loadSyntheticFixture = async () => {
    const fixture = mode === 'stitch' ? createSyntheticStitchFixture() : createSyntheticAlignmentFixture();
    await loadFile('target', new File([fixture.files.target.buffer], fixture.files.target.name, { type: fixture.files.target.mimeType }));
    await loadFile('source', new File([fixture.files.source.buffer], fixture.files.source.name, { type: fixture.files.source.mimeType }));
    pairs = fixture.manifest.landmarks.map(landmark => {
      const stitchConstraint = fixture.manifest.stitch?.constraints.find(constraint => constraint.id === landmark.id);
      return {
        id: landmark.id,
        label: stitchConstraint?.label ?? 'Match point',
        kind: stitchConstraint?.kind ?? landmark.kind ?? 'match',
        enabled: true,
        quality: 'unset'
      };
    });
    activePairId = pairs[0]?.id ?? 'A';
    activeSide = 'target';
    alignment = null;
    disarmPick();
    recompute();
    analytics.track('fixture_loaded', { type: fixture.manifest.fixtureName, mode, landmarkCount: fixture.manifest.landmarks.length });
    setStatus(currentCopy().syntheticLoadedText);
  };

  root.querySelectorAll<HTMLInputElement>('[data-file-input]').forEach(input => {
    input.addEventListener('change', async () => {
      const role = input.dataset.fileInput as 'target' | 'source';
      const file = input.files?.[0];
      if (!file) return;
      try {
        await loadFile(role, file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        analytics.track('error_reported', { area: 'file_load', code: analyticsErrorCode(error), message });
        setStatus(message);
      }
    });
  });

  root.querySelector<HTMLInputElement>('[data-control-sensitivity]')?.addEventListener('input', event => {
    setControlSensitivity(Number((event.target as HTMLInputElement).value));
  });

  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const selectPair = target.closest<HTMLElement>('[data-select-pair]');
    const pickSide = target.closest<HTMLElement>('[data-pick-side]');
    const toggle = target.closest<HTMLInputElement>('[data-toggle-pair]');
    const action = target.closest<HTMLButtonElement>('[data-action]');
    const modeAction = target.closest<HTMLButtonElement>('[data-alignment-mode]');
    const viewAction = target.closest<HTMLButtonElement>('[data-view-action]');

    if (modeAction) {
      mode = modeAction.dataset.alignmentMode as AlignmentMode;
      pairs = createPairsForMode(mode);
      activePairId = pairs[0]?.id ?? 'A';
      activeSide = 'target';
      alignment = null;
      disarmPick();
      updateModeChrome();
      recompute();
      analytics.track('alignment_mode_changed', { mode });
      return;
    }
    if (selectPair) {
      activePairId = selectPair.dataset.selectPair as string;
      renderLandmarks();
    }
    if (pickSide) {
      armPick(pickSide.dataset.pickSide as 'target' | 'source', pickSide.dataset.pairId as string);
    }
    if (toggle) {
      pairs = toggleLandmark(pairs, toggle.dataset.togglePair as string, toggle.checked);
      recompute();
    }
    if (action?.dataset.action === 'add-pair') {
      const next = nextPairForMode(mode, pairs);
      pairs = [...pairs, next];
      activePairId = next.id;
      renderLandmarks();
    }
    if (action?.dataset.action === 'load-synthetic') {
      void loadSyntheticFixture().catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        analytics.track('error_reported', { area: 'fixture_load', code: analyticsErrorCode(error), message });
        setStatus(message);
      });
    }
    if (action?.dataset.action === 'export-ply' && alignment && state.target && state.source) {
      try {
        const merged = createMergedSplatPlyBuffer(state.target.buffer, state.source.buffer, alignment.transform);
        download(downloadName('merged-splats', new Date().toISOString(), 'ply'), makeDownloadBlob(merged, 'application/octet-stream'));
        analytics.track('export_completed', { type: 'merged-ply' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        analytics.track('error_reported', { area: 'export', code: analyticsErrorCode(error), message });
        setStatus(message);
      }
    }
    if (viewAction) {
      const viewer = viewers[viewAction.dataset.viewTarget as keyof typeof viewers];
      if (viewAction.dataset.viewAction === 'reset') viewer.resetView();
      if (viewAction.dataset.viewAction === 'zoom-in') viewer.zoomBy(wheelZoomFactor(-1, controlSensitivity));
      if (viewAction.dataset.viewAction === 'zoom-out') viewer.zoomBy(wheelZoomFactor(1, controlSensitivity));
    }
  });

  setControlSensitivity(controlSensitivity);
  updateModeChrome();
  renderLandmarks();
  updateButtons();
}
