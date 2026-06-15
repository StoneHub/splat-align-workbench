import { bucketBytes, bucketCount, MemoryAnalyticsProvider } from '../analytics/analytics';
import { completeEnabledPairs, createEmptyPairs, flagResiduals, nextLandmarkId, setLandmarkPoint, toggleLandmark, type LandmarkPair } from '../domain/landmarks';
import { parsePlyHeader } from '../domain/ply';
import { createSession, serializeSession } from '../domain/session';
import { solveSim3, type Sim3Success } from '../domain/sim3';
import { makeDownloadBlob, downloadName } from '../export/exportSession';
import { transformBrushPlyBuffer } from '../export/exportPlyTransform';
import { loadSplatCloudFromPly, PointCloudViewer, type SplatCloud, type SplatFileStats } from '../rendering/PointCloudViewer';

interface LoadedSplat {
  role: 'target' | 'source';
  displayName: string;
  buffer: ArrayBuffer;
  cloud: SplatCloud;
  stats: SplatFileStats;
}

const analytics = new MemoryAnalyticsProvider();

const emptySplatState = () => ({
  target: null as LoadedSplat | null,
  source: null as LoadedSplat | null
});

export function createApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <section class="viewer-panel" data-role="target">
        <header>
          <div><strong>Target</strong><span data-file-label="target">No file loaded</span></div>
          <label class="file-button">Load target<input data-file-input="target" type="file" accept=".ply,.splat" /></label>
        </header>
        <canvas class="viewer-surface" data-viewer="target"></canvas>
      </section>
      <section class="viewer-panel" data-role="source">
        <header>
          <div><strong>Source</strong><span data-file-label="source">No file loaded</span></div>
          <label class="file-button">Load source<input data-file-input="source" type="file" accept=".ply,.splat" /></label>
        </header>
        <canvas class="viewer-surface" data-viewer="source"></canvas>
      </section>
      <aside class="side-panel">
        <div class="brand-row">
          <h1>Splat Align</h1>
          <span>local-first</span>
        </div>
        <p class="lede">A standalone landmark workbench. Files stay in your browser; usage events track workflow health without uploading splats.</p>
        <div class="toolbar-row">
          <button data-action="add-pair" type="button">Add Pair</button>
          <button data-action="solve" type="button" disabled>Preview Alignment</button>
        </div>
        <div class="status-card" data-status>Load target and source splats to begin.</div>
        <div class="landmark-list" data-landmarks></div>
        <div class="export-row">
          <button data-action="export-transform" type="button" disabled>Transform JSON</button>
          <button data-action="export-session" type="button" disabled>Session JSON</button>
          <button data-action="export-ply" type="button" disabled>Aligned PLY</button>
        </div>
        <details>
          <summary>Prior art note</summary>
          <p><code>supersplat-snap</code> validates point-correspondence alignment inside SuperSplat. This app focuses on hosted split-view workflow, session export, and a training-data path.</p>
        </details>
      </aside>
      <section class="overlay-panel">
        <header><strong>Overlay Preview</strong><span data-overlay-label>Needs 3 matching pairs</span></header>
        <canvas class="viewer-surface" data-viewer="overlay"></canvas>
      </section>
    </main>
  `;

  analytics.track('session_started', { localFilesOnly: true });

  const state = emptySplatState();
  let pairs: LandmarkPair[] = createEmptyPairs();
  let activePairId = 'A';
  let activeSide: 'target' | 'source' = 'target';
  let alignment: Sim3Success | null = null;

  const targetViewer = new PointCloudViewer(root.querySelector('[data-viewer="target"]') as HTMLCanvasElement);
  const sourceViewer = new PointCloudViewer(root.querySelector('[data-viewer="source"]') as HTMLCanvasElement);
  const overlayViewer = new PointCloudViewer(root.querySelector('[data-viewer="overlay"]') as HTMLCanvasElement);

  const setStatus = (message: string) => {
    (root.querySelector('[data-status]') as HTMLElement).textContent = message;
  };

  const safeStats = (loaded: LoadedSplat | null) => loaded ? {
    fileType: loaded.stats.fileType,
    sizeBucket: bucketBytes(loaded.stats.sizeBytes),
    splatCountBucket: bucketCount(loaded.stats.vertexCount)
  } : {};

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
    if (complete.length >= 3) {
      const result = solveSim3(complete.map(pair => pair.source), complete.map(pair => pair.target));
      analytics.track('solve_attempted', { pairCount: complete.length, ok: result.ok });
      if (result.ok) {
        alignment = result;
        const residualMap = Object.fromEntries(complete.map((pair, index) => [pair.id, result.residuals[index]]));
        const threshold = Math.max(0.05, result.rmse * 2.5);
        pairs = flagResiduals(pairs, residualMap, threshold);
        overlayViewer.setOverlay(state.target?.cloud ?? null, state.source?.cloud ?? null, result.transform);
        setStatus(`${complete.length} pairs solved. RMSE ${result.rmse.toFixed(4)}${result.warnings.length ? ` · ${result.warnings.join(', ')}` : ''}`);
        analytics.track('alignment_previewed', { pairCount: complete.length, rmseBucket: result.rmse < 0.05 ? '<0.05' : result.rmse < 0.5 ? '0.05-0.5' : '0.5+' });
      } else {
        overlayViewer.setOverlay(state.target?.cloud ?? null, null);
        setStatus(result.reason);
      }
    } else {
      overlayViewer.setOverlay(state.target?.cloud ?? null, null);
      setStatus(state.target && state.source ? `${complete.length}/3 complete pairs. Add matching target/source landmarks.` : 'Load target and source splats to begin.');
    }
    renderLandmarks();
    updateButtons();
  };

  const updateButtons = () => {
    const canSolve = completeEnabledPairs(pairs).length >= 3;
    const hasAlignment = Boolean(alignment);
    (root.querySelector('[data-action="solve"]') as HTMLButtonElement).disabled = !canSolve;
    (root.querySelector('[data-action="export-transform"]') as HTMLButtonElement).disabled = !hasAlignment;
    (root.querySelector('[data-action="export-session"]') as HTMLButtonElement).disabled = !state.target || !state.source;
    (root.querySelector('[data-action="export-ply"]') as HTMLButtonElement).disabled = !hasAlignment || !state.source;
    (root.querySelector('[data-overlay-label]') as HTMLElement).textContent = hasAlignment ? 'Target + aligned source' : 'Needs 3 matching pairs';
  };

  const renderLandmarks = () => {
    const list = root.querySelector('[data-landmarks]') as HTMLElement;
    list.innerHTML = pairs.map(pair => {
      const active = pair.id === activePairId;
      const target = pair.target ? pair.target.map(value => value.toFixed(3)).join(', ') : 'pick';
      const source = pair.source ? pair.source.map(value => value.toFixed(3)).join(', ') : 'pick';
      const residual = pair.residual === undefined ? '' : `<span class="residual ${pair.quality === 'outlier' ? 'bad' : ''}">${pair.residual.toFixed(4)}</span>`;
      return `
        <div class="landmark-row ${active ? 'active' : ''}" data-pair="${pair.id}">
          <button type="button" data-select-pair="${pair.id}">${pair.id}</button>
          <label><input type="checkbox" data-toggle-pair="${pair.id}" ${pair.enabled ? 'checked' : ''} /> enabled</label>
          <button type="button" data-pick-side="target" data-pair-id="${pair.id}">Target: ${target}</button>
          <button type="button" data-pick-side="source" data-pair-id="${pair.id}">Source: ${source}</button>
          ${residual}
        </div>
      `;
    }).join('');
  };

  const handlePick = (side: 'target' | 'source', point: [number, number, number]) => {
    pairs = setLandmarkPoint(pairs, activePairId, side, point);
    activeSide = side === 'target' ? 'source' : 'target';
    analytics.track('landmark_pair_set', { side, pairId: activePairId });
    recompute();
  };

  targetViewer.setPickHandler(point => handlePick('target', point));
  sourceViewer.setPickHandler(point => handlePick('source', point));

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
    if (role === 'target') targetViewer.setLayer(cloud, 'target');
    else sourceViewer.setLayer(cloud, 'source');
    (root.querySelector(`[data-file-label="${role}"]`) as HTMLElement).textContent = `${file.name} · ${header.vertexCount.toLocaleString()} splats`;
    analytics.track('file_loaded', {
      role,
      fileType: loaded.stats.fileType,
      sizeBucket: bucketBytes(file.size),
      splatCountBucket: bucketCount(header.vertexCount)
    });
    recompute();
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
        analytics.track('error_reported', { area: 'file_load', message });
        setStatus(message);
      }
    });
  });

  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const selectPair = target.closest<HTMLElement>('[data-select-pair]');
    const pickSide = target.closest<HTMLElement>('[data-pick-side]');
    const toggle = target.closest<HTMLInputElement>('[data-toggle-pair]');
    const action = target.closest<HTMLButtonElement>('[data-action]');

    if (selectPair) {
      activePairId = selectPair.dataset.selectPair as string;
      renderLandmarks();
    }
    if (pickSide) {
      activePairId = pickSide.dataset.pairId as string;
      activeSide = pickSide.dataset.pickSide as 'target' | 'source';
      renderLandmarks();
      setStatus(`Click a point in the ${activeSide} viewer for landmark ${activePairId}.`);
    }
    if (toggle) {
      pairs = toggleLandmark(pairs, toggle.dataset.togglePair as string, toggle.checked);
      recompute();
    }
    if (action?.dataset.action === 'add-pair') {
      const id = nextLandmarkId(pairs);
      pairs = [...pairs, { id, enabled: true, quality: 'unset' }];
      activePairId = id;
      renderLandmarks();
    }
    if (action?.dataset.action === 'solve') {
      recompute();
    }
    if (action?.dataset.action === 'export-transform' && alignment) {
      download(downloadName('splat-align-transform', new Date().toISOString(), 'json'), makeDownloadBlob(`${JSON.stringify(alignment.transform, null, 2)}\n`, 'application/json'));
      analytics.track('export_completed', { type: 'transform' });
    }
    if (action?.dataset.action === 'export-session') {
      const session = createSession({
        target: safeStats(state.target),
        source: safeStats(state.source),
        landmarks: pairs,
        transform: alignment?.transform,
        rmse: alignment?.rmse,
        warnings: alignment?.warnings
      });
      download(downloadName('splat-align-session', session.createdAt, 'json'), makeDownloadBlob(serializeSession(session), 'application/json'));
      analytics.track('export_completed', { type: 'session' });
    }
    if (action?.dataset.action === 'export-ply' && alignment && state.source) {
      const transformed = transformBrushPlyBuffer(state.source.buffer, alignment.transform);
      download(downloadName('aligned-source', new Date().toISOString(), 'ply'), makeDownloadBlob(transformed, 'application/octet-stream'));
      analytics.track('export_completed', { type: 'aligned-ply' });
    }
  });

  renderLandmarks();
  updateButtons();
}
