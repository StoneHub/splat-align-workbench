import { controlSensitivityLabel, DEFAULT_CONTROL_SENSITIVITY } from '../rendering/PlayCanvasSplatViewer';

export function createAppMarkup(): string {
  return `
    <main class="app-shell">
      <section class="viewer-panel" data-role="target">
        <header>
          <div><strong>Target</strong><span data-file-label="target">No file loaded</span></div>
          <div class="viewer-actions">
            <button data-view-action="reset" data-view-target="target" type="button" title="Reset target view">Reset</button>
            <button data-view-action="zoom-in" data-view-target="target" type="button" title="Zoom target in">+</button>
            <button data-view-action="zoom-out" data-view-target="target" type="button" title="Zoom target out">-</button>
            <label class="file-button">Load target<input data-file-input="target" type="file" accept=".ply" /></label>
          </div>
        </header>
        <canvas class="viewer-surface" data-viewer="target"></canvas>
      </section>
      <section class="viewer-panel" data-role="source">
        <header>
          <div><strong>Source</strong><span data-file-label="source">No file loaded</span></div>
          <div class="viewer-actions">
            <button data-view-action="reset" data-view-target="source" type="button" title="Reset source view">Reset</button>
            <button data-view-action="zoom-in" data-view-target="source" type="button" title="Zoom source in">+</button>
            <button data-view-action="zoom-out" data-view-target="source" type="button" title="Zoom source out">-</button>
            <label class="file-button">Load source<input data-file-input="source" type="file" accept=".ply" /></label>
          </div>
        </header>
        <canvas class="viewer-surface" data-viewer="source"></canvas>
      </section>
      <aside class="side-panel">
        <div class="brand-row">
          <h1>Splat Align</h1>
        </div>
        <p class="lede" data-mode-lede>Merge two local splats by matching shared landmarks.</p>
        <div class="mode-row" role="group" aria-label="Alignment mode">
          <button data-alignment-mode="overlap" type="button" class="active">Overlap Align</button>
          <button data-alignment-mode="stitch" type="button">Experimental Stitch</button>
        </div>
        <div class="fixture-row">
          <button data-action="load-synthetic" type="button">Load Synthetic Set</button>
        </div>
        <div class="control-row">
          <label for="control-sensitivity">Control speed <output data-control-sensitivity-label>${controlSensitivityLabel(DEFAULT_CONTROL_SENSITIVITY)}</output></label>
          <input id="control-sensitivity" data-control-sensitivity type="range" min="0.15" max="2.5" step="0.05" value="${DEFAULT_CONTROL_SENSITIVITY}" />
        </div>
        <div class="status-card" data-status>Load target and source splats to begin.</div>
        <div class="landmark-toolbar" data-landmark-toolbar>
          <strong>Landmarks</strong>
          <button data-action="add-pair" type="button" title="Add landmark pair">+</button>
        </div>
        <div class="landmark-list" data-landmarks></div>
        <div class="export-row">
          <button data-action="export-ply" type="button" disabled>Merged PLY</button>
          <button data-action="export-session" type="button" disabled>Session JSON</button>
        </div>
      </aside>
      <section class="overlay-panel">
        <header>
          <strong>Overlay Preview</strong>
          <div class="viewer-actions">
            <span data-overlay-label>Needs 3 matching pairs</span>
            <button data-view-action="reset" data-view-target="overlay" type="button" title="Reset overlay view">Reset</button>
            <button data-view-action="zoom-in" data-view-target="overlay" type="button" title="Zoom overlay in">+</button>
            <button data-view-action="zoom-out" data-view-target="overlay" type="button" title="Zoom overlay out">-</button>
          </div>
        </header>
        <canvas class="viewer-surface" data-viewer="overlay"></canvas>
      </section>
    </main>
  `;
}
