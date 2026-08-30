import { describe, expect, it } from 'vitest';
import { MemoryAnalyticsProvider } from '../analytics/analytics';
import { applySim3, type Vec3 } from '../domain/sim3';
import { createSyntheticAlignmentFixture } from '../devFixtures/syntheticSplat';
import { InMemorySplatViewer } from '../rendering/InMemorySplatViewer';
import { loadSplatCloudFromPly } from '../rendering/splatData';
import { createWorkbenchController, type DownloadAdapter, type SplatFileInput, type WorkbenchController } from './WorkbenchController';

class MemoryDownloads implements DownloadAdapter {
  readonly saved: Array<{ name: string; blob: Blob }> = [];
  save(name: string, blob: Blob): void { this.saved.push({ name, blob }); }
}

const fixtureFile = (name: string, buffer: ArrayBuffer): SplatFileInput => ({
  name,
  size: buffer.byteLength,
  arrayBuffer: async () => buffer.slice(0)
});

const expectVecClose = (actual: Vec3, expected: Vec3) => {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
};

const createHarness = () => {
  const viewers = {
    target: new InMemorySplatViewer(),
    source: new InMemorySplatViewer(),
    overlay: new InMemorySplatViewer()
  };
  const analytics = new MemoryAnalyticsProvider();
  const downloads = new MemoryDownloads();
  const controller = createWorkbenchController({
    viewers,
    analytics,
    downloads,
    now: () => new Date('2026-08-29T12:00:00.000Z')
  });
  return { controller, viewers, analytics, downloads };
};

const identityPoints: Array<{ id: string; point: Vec3 }> = [
  { id: 'A', point: [0, 0, 0] },
  { id: 'B', point: [1, 0, 0] },
  { id: 'C', point: [0, 1, 0] }
];

const solveIdentity = async (controller: WorkbenchController) => {
  for (const { id, point } of identityPoints) {
    await controller.execute({ kind: 'select-pair', pairId: id });
    await controller.execute({ kind: 'record-pick', side: 'target', point });
    await controller.execute({ kind: 'record-pick', side: 'source', point });
  }
};

describe('WorkbenchController', () => {
  it('owns mode changes and Experimental Stitch policy behind one interface', async () => {
    const { controller } = createHarness();

    const outcome = await controller.execute({ kind: 'change-mode', mode: 'stitch' });

    expect(outcome.ok).toBe(true);
    expect(outcome.snapshot.mode).toBe('stitch');
    expect(outcome.snapshot.pairs).toHaveLength(4);
    expect(outcome.snapshot.pairs.map(pair => pair.label)).toEqual([
      'Join seam',
      'Direction guide',
      'Plane guide 1',
      'Plane guide 2'
    ]);
  });

  it('keeps the latest load for each splat side', async () => {
    const { controller } = createHarness();
    const fixture = createSyntheticAlignmentFixture();
    let releaseFirst: ((buffer: ArrayBuffer) => void) | undefined;
    const first: SplatFileInput = {
      name: 'old.ply',
      size: fixture.files.target.buffer.byteLength,
      arrayBuffer: () => new Promise(resolve => { releaseFirst = resolve; })
    };

    const oldLoad = controller.execute({ kind: 'load-splat', side: 'target', file: first });
    await Promise.resolve();
    await controller.execute({
      kind: 'load-splat',
      side: 'target',
      file: fixtureFile('latest.ply', fixture.files.target.buffer)
    });
    releaseFirst?.(fixture.files.target.buffer.slice(0));
    await oldLoad;

    expect(controller.current().splats.target?.displayName).toBe('latest.ply');
  });

  it('orders same-side viewer layers by replacement request', async () => {
    const { controller, viewers } = createHarness();
    const fixture = createSyntheticAlignmentFixture();
    await controller.execute({ kind: 'load-synthetic' });
    const oldGate = viewers.target.delayNextReplacement();
    const oldLoad = controller.execute({
      kind: 'load-splat',
      side: 'target',
      file: fixtureFile('old.ply', fixture.files.target.buffer)
    });
    await oldGate.started;

    const latestGate = viewers.target.delayNextReplacement();
    const latestLoad = controller.execute({
      kind: 'load-splat',
      side: 'target',
      file: fixtureFile('latest.ply', fixture.files.target.buffer)
    });
    oldGate.release();
    await latestGate.started;
    latestGate.release();
    await Promise.all([oldLoad, latestLoad]);

    expect(controller.current().splats.target?.displayName).toBe('latest.ply');
    expect(viewers.target.currentScene()).toMatchObject({ kind: 'single', splat: { name: 'latest.ply' } });
  });

  it('keeps load failures and premature exports inside the controller interface', async () => {
    const { controller } = createHarness();
    const invalid = new TextEncoder().encode('not a ply').buffer;

    const loadOutcome = await controller.execute({
      kind: 'load-splat',
      side: 'target',
      file: fixtureFile('broken.ply', invalid)
    });
    const exportOutcome = await controller.execute({ kind: 'export', artifact: 'session-json' });

    expect(loadOutcome).toMatchObject({ ok: false, problem: { code: 'operation-failed' } });
    expect(controller.current().splats.target).toBeNull();
    expect(exportOutcome).toMatchObject({ ok: false, problem: { code: 'export-unavailable' } });
  });

  it('solves through commands and exports matching PLY and session artifacts', async () => {
    const { controller, viewers, downloads } = createHarness();
    const fixture = createSyntheticAlignmentFixture();
    await controller.execute({ kind: 'load-synthetic' });

    for (const landmark of fixture.manifest.landmarks.slice(0, 3)) {
      await controller.execute({ kind: 'select-pair', pairId: landmark.id });
      await controller.execute({ kind: 'record-pick', side: 'target', point: landmark.target });
      expect(controller.current().activeSide).toBe('source');
      expect(viewers.source.isPickModeEnabled()).toBe(true);
      await controller.execute({ kind: 'record-pick', side: 'source', point: landmark.source });
      expect(viewers.source.isPickModeEnabled()).toBe(false);
      if (landmark.id !== 'C') expect(controller.current().exports.mergedPly).toBe(false);
    }

    const solved = controller.current().alignment;
    expect(solved?.ok).toBe(true);
    expect(solved?.transform.scale).toBeCloseTo(fixture.manifest.knownSourceToTarget.scale, 6);
    expect(controller.current().exports).toEqual({ mergedPly: true, sessionJson: true });
    expect(controller.current().status).toContain('3 pairs solved. RMSE');
    expect(controller.current().pairs.slice(0, 3).every(pair => pair.residual !== undefined)).toBe(true);
    expect(viewers.overlay.currentScene()).toMatchObject({
      kind: 'overlay',
      source: { sourceToTarget: solved?.transform },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ id: 'A', selected: false, target: fixture.manifest.landmarks[0].target, source: fixture.manifest.landmarks[0].source }),
        expect.objectContaining({ id: 'C', selected: true })
      ])
    });

    await controller.execute({ kind: 'select-pair', pairId: 'B' });
    expect(viewers.overlay.currentScene()).toMatchObject({
      kind: 'overlay',
      diagnostics: expect.arrayContaining([expect.objectContaining({ id: 'B', selected: true })])
    });

    await controller.execute({ kind: 'set-pair-enabled', pairId: 'E', enabled: false });

    await controller.execute({ kind: 'export', artifact: 'merged-ply' });
    await controller.execute({ kind: 'export', artifact: 'session-json' });

    expect(downloads.saved.map(item => item.name)).toEqual([
      'merged-splats-2026-08-29T12-00-00-000Z.ply',
      'splat-align-session-2026-08-29T12-00-00-000Z.json'
    ]);
    const json = await downloads.saved[1].blob.text();
    const parsed = JSON.parse(json);
    expect(parsed.appName).toBe('Splat Align Workbench');
    expect(parsed.mode).toBe('overlap');
    expect(parsed.transform).toEqual(solved?.transform);
    expect(parsed.landmarks.some((pair: { id: string }) => pair.id === 'E')).toBe(false);
    expect(json).not.toContain('synthetic-target.ply');
    expect(json).not.toContain('synthetic-source.ply');

    const merged = loadSplatCloudFromPly(await downloads.saved[0].blob.arrayBuffer());
    const target = loadSplatCloudFromPly(fixture.files.target.buffer);
    const source = loadSplatCloudFromPly(fixture.files.source.buffer);
    const expectedSourcePoint = applySim3(parsed.transform, source.points[0]);
    expectVecClose(merged.points[target.vertexCount], expectedSourcePoint);
  });

  it('invalidates the Alignment as soon as either splat starts changing', async () => {
    const { controller, viewers } = createHarness();
    const fixture = createSyntheticAlignmentFixture();
    await controller.execute({ kind: 'load-synthetic' });
    await solveIdentity(controller);
    let release: ((buffer: ArrayBuffer) => void) | undefined;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const replacement: SplatFileInput = {
      name: 'replacement.ply',
      size: fixture.files.target.buffer.byteLength,
      arrayBuffer: () => {
        signalStarted();
        return new Promise(resolve => { release = resolve; });
      }
    };

    const pendingLoad = controller.execute({ kind: 'load-splat', side: 'target', file: replacement });
    await started;
    expect(controller.current().alignment).toBeNull();
    expect(controller.current().exports).toEqual({ mergedPly: false, sessionJson: false });
    expect(viewers.overlay.currentScene()).toMatchObject({ kind: 'overlay', source: null });
    expect(await controller.execute({ kind: 'export', artifact: 'merged-ply' })).toMatchObject({
      ok: false,
      problem: { code: 'export-unavailable' }
    });
    release?.(fixture.files.target.buffer.slice(0));
    await pendingLoad;
  });

  it('restores user landmarks and the valid preview when a replacement fails', async () => {
    const { controller, viewers } = createHarness();
    await controller.execute({ kind: 'load-synthetic' });
    await solveIdentity(controller);
    const before = controller.current();
    const invalid = new TextEncoder().encode('not a ply').buffer;

    const outcome = await controller.execute({
      kind: 'load-splat',
      side: 'target',
      file: fixtureFile('broken-replacement.ply', invalid)
    });

    expect(outcome).toMatchObject({ ok: false, problem: { code: 'operation-failed' } });
    expect(controller.current().pairs).toEqual(before.pairs);
    expect(controller.current().alignment).toEqual(before.alignment);
    expect(controller.current().exports).toEqual({ mergedPly: true, sessionJson: true });
    expect(viewers.overlay.currentScene()).toMatchObject({ kind: 'overlay', source: { sourceToTarget: before.alignment?.transform } });
  });

  it('restores a valid Alignment after an export attempt during a failed replacement', async () => {
    const { controller, viewers } = createHarness();
    await controller.execute({ kind: 'load-synthetic' });
    await solveIdentity(controller);
    const before = controller.current();
    let release!: (buffer: ArrayBuffer) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const replacement: SplatFileInput = {
      name: 'broken-replacement.ply',
      size: 9,
      arrayBuffer: () => {
        signalStarted();
        return new Promise(resolve => { release = resolve; });
      }
    };

    const pendingLoad = controller.execute({ kind: 'load-splat', side: 'target', file: replacement });
    await started;
    expect(await controller.execute({ kind: 'export', artifact: 'merged-ply' })).toMatchObject({
      ok: false,
      problem: { code: 'export-unavailable' }
    });
    release(new TextEncoder().encode('not a ply').buffer);
    await pendingLoad;

    expect(controller.current().pairs).toEqual(before.pairs);
    expect(controller.current().alignment).toEqual(before.alignment);
    expect(controller.current().exports).toEqual({ mergedPly: true, sessionJson: true });
    expect(viewers.overlay.currentScene()).toMatchObject({ kind: 'overlay', source: { sourceToTarget: before.alignment?.transform } });
  });

  it('does not restore an old Alignment after mode changes during a failed replacement', async () => {
    const { controller, viewers } = createHarness();
    const fixture = createSyntheticAlignmentFixture();
    await controller.execute({ kind: 'load-synthetic' });
    await solveIdentity(controller);
    const originalTarget = controller.current().splats.target;
    let release!: (buffer: ArrayBuffer) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const replacement: SplatFileInput = {
      name: 'broken-replacement.ply',
      size: 9,
      arrayBuffer: () => {
        signalStarted();
        return new Promise(resolve => { release = resolve; });
      }
    };

    const pendingLoad = controller.execute({ kind: 'load-splat', side: 'target', file: replacement });
    await started;
    await controller.execute({ kind: 'change-mode', mode: 'stitch' });
    release(new TextEncoder().encode('not a ply').buffer);
    const outcome = await pendingLoad;

    expect(outcome).toMatchObject({ ok: false, problem: { code: 'operation-failed' } });
    expect(controller.current().mode).toBe('stitch');
    expect(controller.current().pairs).toHaveLength(4);
    expect(controller.current().alignment).toBeNull();
    expect(controller.current().exports).toEqual({ mergedPly: false, sessionJson: false });
    expect(viewers.overlay.currentScene()).toMatchObject({ kind: 'overlay', source: null });
    expect(controller.current().splats.target).toEqual(originalTarget);
  });

  it('keeps newer Alignment state ahead of delayed Overlay work', async () => {
    const { controller, viewers } = createHarness();
    await controller.execute({ kind: 'load-synthetic' });
    for (const { id, point } of identityPoints.slice(0, 2)) {
      await controller.execute({ kind: 'select-pair', pairId: id });
      await controller.execute({ kind: 'record-pick', side: 'target', point });
      await controller.execute({ kind: 'record-pick', side: 'source', point });
    }
    await controller.execute({ kind: 'select-pair', pairId: 'C' });
    await controller.execute({ kind: 'record-pick', side: 'target', point: identityPoints[2].point });

    const overlayGate = viewers.overlay.delayNextReplacement();
    const solve = controller.execute({ kind: 'record-pick', side: 'source', point: identityPoints[2].point });
    await overlayGate.started;
    const disable = controller.execute({ kind: 'set-pair-enabled', pairId: 'A', enabled: false });
    overlayGate.release();
    await Promise.all([solve, disable]);

    expect(controller.current().alignment).toBeNull();
    expect(controller.current().status).not.toContain('solved. RMSE');
    expect(viewers.overlay.currentScene()).toMatchObject({ kind: 'overlay', source: null });
  });

  it('does not let delayed solve feedback overwrite a newer pick instruction', async () => {
    const { controller, viewers } = createHarness();
    await controller.execute({ kind: 'load-synthetic' });
    for (const { id, point } of identityPoints.slice(0, 2)) {
      await controller.execute({ kind: 'select-pair', pairId: id });
      await controller.execute({ kind: 'record-pick', side: 'target', point });
      await controller.execute({ kind: 'record-pick', side: 'source', point });
    }
    await controller.execute({ kind: 'select-pair', pairId: 'C' });
    await controller.execute({ kind: 'record-pick', side: 'target', point: identityPoints[2].point });

    const overlayGate = viewers.overlay.delayNextReplacement();
    const solve = controller.execute({ kind: 'record-pick', side: 'source', point: identityPoints[2].point });
    await overlayGate.started;
    await controller.execute({ kind: 'arm-pick', pairId: 'B', side: 'target' });
    overlayGate.release();
    await solve;

    expect(controller.current().status).toBe('Click a point in the target viewer for Match point.');
    expect(viewers.target.isPickModeEnabled()).toBe(true);
  });

  it('returns deep snapshots that cannot mutate controller state', async () => {
    const { controller } = createHarness();
    await controller.execute({ kind: 'load-synthetic' });
    await solveIdentity(controller);

    const external = controller.current();
    const expectedPoint = [...(external.pairs[0].target as Vec3)] as Vec3;
    const expectedTranslation = [...(external.alignment?.transform.translation as Vec3)] as Vec3;
    (external.pairs[0].target as Vec3)[0] = 99;
    (external.alignment?.transform.translation as Vec3)[0] = 99;

    expect(controller.current().pairs[0].target).toEqual(expectedPoint);
    expect(controller.current().alignment?.transform.translation).toEqual(expectedTranslation);
  });

  it('rejects commands after close', async () => {
    const { controller } = createHarness();
    controller.close();

    const outcome = await controller.execute({ kind: 'add-pair' });

    expect(outcome).toMatchObject({ ok: false, problem: { code: 'workbench-closed' } });
  });
});
