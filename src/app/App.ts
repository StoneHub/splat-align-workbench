import { createAnalyticsProvider } from '../analytics/analytics';
import { landmarkModeCopy } from '../domain/alignmentMode';
import { controlSensitivityLabel, DEFAULT_CONTROL_SENSITIVITY, PlayCanvasSplatViewer, wheelZoomFactor } from '../rendering/PlayCanvasSplatViewer';
import { createAppMarkup } from './appMarkup';
import {
  createWorkbenchController,
  type DownloadAdapter,
  type SplatSide,
  type ViewerName,
  type WorkbenchCommand,
  type WorkbenchSnapshot
} from './WorkbenchController';

const browserDownloads: DownloadAdapter = {
  save(name, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }
};

const landmarkRows = (snapshot: WorkbenchSnapshot): string => snapshot.pairs.map(pair => {
  const active = pair.id === snapshot.activePairId;
  const label = pair.label ?? 'Match point';
  const target = pair.target ? pair.target.map(value => value.toFixed(3)).join(', ') : 'pick';
  const source = pair.source ? pair.source.map(value => value.toFixed(3)).join(', ') : 'pick';
  const residual = pair.residual === undefined ? '' : `<span class="residual ${pair.quality === 'outlier' ? 'bad' : ''}">${pair.residual.toFixed(4)}</span>`;
  const targetPickClass = active && snapshot.activeSide === 'target' ? ' class="armed-pick"' : '';
  const sourcePickClass = active && snapshot.activeSide === 'source' ? ' class="armed-pick"' : '';
  return `
    <div class="landmark-row ${active ? 'active' : ''}" data-pair="${pair.id}">
      <button type="button" data-select-pair="${pair.id}">${pair.id}</button>
      <label><input type="checkbox" data-toggle-pair="${pair.id}" ${pair.enabled ? 'checked' : ''} /> enabled</label>
      <span class="pair-label">${label}</span>
      <button type="button" data-pick-side="target" data-pair-id="${pair.id}"${targetPickClass}>Target: ${target}</button>
      <button type="button" data-pick-side="source" data-pair-id="${pair.id}"${sourcePickClass}>Source: ${source}</button>
      ${residual}
    </div>
  `;
}).join('');

const fileLabel = (snapshot: WorkbenchSnapshot, side: SplatSide): string => {
  const splat = snapshot.splats[side];
  return splat ? `${splat.displayName} · ${splat.vertexCount.toLocaleString()} splats` : 'No file loaded';
};

export function createApp(root: HTMLElement): void {
  root.innerHTML = createAppMarkup();

  const targetViewer = new PlayCanvasSplatViewer(root.querySelector('[data-viewer="target"]') as HTMLCanvasElement);
  const sourceViewer = new PlayCanvasSplatViewer(root.querySelector('[data-viewer="source"]') as HTMLCanvasElement);
  const overlayViewer = new PlayCanvasSplatViewer(root.querySelector('[data-viewer="overlay"]') as HTMLCanvasElement);
  const viewers = { target: targetViewer, source: sourceViewer, overlay: overlayViewer };
  const controller = createWorkbenchController({
    viewers,
    analytics: createAnalyticsProvider(),
    downloads: browserDownloads
  });

  const render = (snapshot: WorkbenchSnapshot) => {
    const copy = landmarkModeCopy(snapshot.mode);
    (root.querySelector('[data-status]') as HTMLElement).textContent = snapshot.status;
    (root.querySelector('[data-mode-lede]') as HTMLElement).textContent = copy.lede;
    (root.querySelector('[data-landmark-toolbar] strong') as HTMLElement).textContent = copy.toolbarTitle;
    (root.querySelector('[data-landmarks]') as HTMLElement).innerHTML = landmarkRows(snapshot);
    (root.querySelector('[data-file-label="target"]') as HTMLElement).textContent = fileLabel(snapshot, 'target');
    (root.querySelector('[data-file-label="source"]') as HTMLElement).textContent = fileLabel(snapshot, 'source');
    (root.querySelector('[data-control-sensitivity-label]') as HTMLOutputElement).value = controlSensitivityLabel(snapshot.controlSensitivity);

    root.querySelectorAll<HTMLButtonElement>('[data-alignment-mode]').forEach(button => {
      const active = button.dataset.alignmentMode === snapshot.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    (root.querySelector('[data-action="export-ply"]') as HTMLButtonElement).disabled = !snapshot.exports.mergedPly;
    (root.querySelector('[data-action="export-session"]') as HTMLButtonElement).disabled = !snapshot.exports.sessionJson;
    (root.querySelector('[data-overlay-label]') as HTMLElement).textContent = snapshot.alignment ? copy.solvedText : copy.needsText;
  };

  const executeAndRender = async (command: WorkbenchCommand) => {
    const outcome = await controller.execute(command);
    render(outcome.snapshot);
  };

  targetViewer.setPickHandler(point => void executeAndRender({ kind: 'record-pick', side: 'target', point }));
  sourceViewer.setPickHandler(point => void executeAndRender({ kind: 'record-pick', side: 'source', point }));
  targetViewer.setPickMissHandler(() => void executeAndRender({ kind: 'pick-missed', side: 'target' }));
  sourceViewer.setPickMissHandler(() => void executeAndRender({ kind: 'pick-missed', side: 'source' }));

  root.querySelectorAll<HTMLInputElement>('[data-file-input]').forEach(input => {
    input.addEventListener('change', () => {
      const side = input.dataset.fileInput as SplatSide;
      const file = input.files?.[0];
      if (file) void executeAndRender({ kind: 'load-splat', side, file });
    });
  });

  root.querySelector<HTMLInputElement>('[data-control-sensitivity]')?.addEventListener('input', event => {
    void executeAndRender({ kind: 'set-control-sensitivity', value: Number((event.target as HTMLInputElement).value) });
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
      void executeAndRender({ kind: 'change-mode', mode: modeAction.dataset.alignmentMode as 'overlap' | 'stitch' });
      return;
    }
    if (selectPair) void executeAndRender({ kind: 'select-pair', pairId: selectPair.dataset.selectPair as string });
    if (pickSide) void executeAndRender({
      kind: 'arm-pick',
      side: pickSide.dataset.pickSide as SplatSide,
      pairId: pickSide.dataset.pairId as string
    });
    if (toggle) void executeAndRender({ kind: 'set-pair-enabled', pairId: toggle.dataset.togglePair as string, enabled: toggle.checked });
    if (action?.dataset.action === 'add-pair') void executeAndRender({ kind: 'add-pair' });
    if (action?.dataset.action === 'load-synthetic') void executeAndRender({ kind: 'load-synthetic' });
    if (action?.dataset.action === 'export-ply') void executeAndRender({ kind: 'export', artifact: 'merged-ply' });
    if (action?.dataset.action === 'export-session') void executeAndRender({ kind: 'export', artifact: 'session-json' });
    if (viewAction) {
      const viewer = viewAction.dataset.viewTarget as ViewerName;
      if (viewAction.dataset.viewAction === 'reset') void executeAndRender({ kind: 'reset-view', viewer });
      if (viewAction.dataset.viewAction === 'zoom-in') void executeAndRender({
        kind: 'zoom-view',
        viewer,
        factor: wheelZoomFactor(-1, controller.current().controlSensitivity)
      });
      if (viewAction.dataset.viewAction === 'zoom-out') void executeAndRender({
        kind: 'zoom-view',
        viewer,
        factor: wheelZoomFactor(1, controller.current().controlSensitivity)
      });
    }
  });

  void executeAndRender({ kind: 'set-control-sensitivity', value: DEFAULT_CONTROL_SENSITIVITY });
}
