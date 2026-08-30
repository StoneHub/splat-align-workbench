import { createMergedSplatPlyBuffer } from '../export/exportPlyTransform';
import type { Sim3Transform } from '../domain/sim3';

interface BrowserMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface BenchmarkPerformance extends Performance {
  memory?: BrowserMemory;
}

const identity: Sim3Transform = {
  scale: 1,
  rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  translation: [0, 0, 0]
};
const baselineInputCapBytes = 70 * 1024 * 1024;

const targetInput = document.querySelector<HTMLInputElement>('[data-target]');
const sourceInput = document.querySelector<HTMLInputElement>('[data-source]');
const runButton = document.querySelector<HTMLButtonElement>('[data-run]');
const results = document.querySelector<HTMLElement>('[data-results]');

if (!targetInput || !sourceInput || !runButton || !results) {
  throw new Error('Benchmark controls are missing.');
}

const memorySnapshot = () => {
  const memory = (performance as BenchmarkPerformance).memory;
  return memory ? {
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    totalJSHeapSize: memory.totalJSHeapSize,
    usedJSHeapSize: memory.usedJSHeapSize
  } : null;
};

runButton.addEventListener('click', async () => {
  const target = targetInput.files?.[0];
  const source = sourceInput.files?.[0];
  if (!target || !source) {
    results.textContent = 'Choose both PLY files.';
    return;
  }
  if (target.size > baselineInputCapBytes || source.size > baselineInputCapBytes) {
    results.textContent = JSON.stringify({
      error: 'This full-buffer baseline fails closed above 70 MiB per input. Use the future chunked benchmark for medium fixtures.',
      targetBytes: target.size,
      sourceBytes: source.size,
      inputCapBytes: baselineInputCapBytes
    }, null, 2);
    return;
  }

  runButton.disabled = true;
  results.textContent = 'Reading local files...';
  const startedAt = performance.now();
  const memoryBeforeRead = memorySnapshot();

  try {
    const [targetBuffer, sourceBuffer] = await Promise.all([target.arrayBuffer(), source.arrayBuffer()]);
    const memoryBeforeMerge = memorySnapshot();
    const mergeStartedAt = performance.now();
    const merged = createMergedSplatPlyBuffer(targetBuffer, sourceBuffer, identity);
    const mergeFinishedAt = performance.now();
    const blob = new Blob([merged], { type: 'application/octet-stream' });
    const finishedAt = performance.now();
    const memoryAfterBlob = memorySnapshot();
    const mergeSeconds = (mergeFinishedAt - mergeStartedAt) / 1000;

    const report = {
      browser: navigator.userAgent,
      deviceMemoryGiB: 'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory: number }).deviceMemory : null,
      target: { name: target.name, bytes: target.size },
      source: { name: source.name, bytes: source.size },
      outputBytes: merged.byteLength,
      blobBytes: blob.size,
      readAndMergeMilliseconds: Math.round(mergeFinishedAt - startedAt),
      mergeMilliseconds: Math.round(mergeFinishedAt - mergeStartedAt),
      blobMilliseconds: Math.round(finishedAt - mergeFinishedAt),
      mergeMiBPerSecond: Number(((merged.byteLength / 1024 / 1024) / mergeSeconds).toFixed(2)),
      memoryBeforeRead,
      memoryBeforeMerge,
      memoryAfterBlob
    };
    results.textContent = JSON.stringify(report, null, 2);
    console.info('splat-export-benchmark', report);
  } catch (error) {
    results.textContent = JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2);
  } finally {
    runButton.disabled = false;
  }
});
