import { describe, expect, it } from 'vitest';
import { MemoryAnalyticsProvider } from '../analytics/analytics';
import type { Sim3Transform, Vec3 } from '../domain/sim3';
import { createSyntheticAlignmentFixture } from '../devFixtures/syntheticSplat';
import type { SplatRenderInput, SplatViewer } from '../rendering/RendererAdapter';
import { createWorkbenchController, type DownloadAdapter, type SplatFileInput } from './WorkbenchController';

class MemoryViewer implements SplatViewer {
  pickMode = false;
  sensitivity = 1;
  layer: SplatRenderInput | null = null;
  overlay: { target: SplatRenderInput | null; source: SplatRenderInput | null; transform?: Sim3Transform } | null = null;

  setPickHandler(): void {}
  setPickMissHandler(): void {}
  setPickMode(enabled: boolean): void { this.pickMode = enabled; }
  setControlSensitivity(value: number): void { this.sensitivity = value; }
  async setLayer(input: SplatRenderInput | null): Promise<void> { this.layer = input; }
  async setOverlay(target: SplatRenderInput | null, source: SplatRenderInput | null, transform?: Sim3Transform): Promise<void> {
    this.overlay = { target, source, transform };
  }
  resetView(): void {}
  zoomBy(): void {}
  resize(): void {}
}

class MemoryDownloads implements DownloadAdapter {
  readonly saved: Array<{ name: string; blob: Blob }> = [];
  save(name: string, blob: Blob): void { this.saved.push({ name, blob }); }
}

const fixtureFile = (name: string, buffer: ArrayBuffer): SplatFileInput => ({
  name,
  size: buffer.byteLength,
  arrayBuffer: async () => buffer.slice(0)
});

const createHarness = () => {
  const viewers = {
    target: new MemoryViewer(),
    source: new MemoryViewer(),
    overlay: new MemoryViewer()
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

  it('solves through commands and exports matching PLY and session artifacts', async () => {
    const { controller, downloads } = createHarness();
    await controller.execute({ kind: 'load-synthetic' });

    const points: Array<{ id: string; point: Vec3 }> = [
      { id: 'A', point: [0, 0, 0] },
      { id: 'B', point: [1, 0, 0] },
      { id: 'C', point: [0, 1, 0] }
    ];
    for (const { id, point } of points) {
      await controller.execute({ kind: 'select-pair', pairId: id });
      await controller.execute({ kind: 'record-pick', side: 'target', point });
      await controller.execute({ kind: 'record-pick', side: 'source', point });
    }

    expect(controller.current().alignment?.ok).toBe(true);
    expect(controller.current().exports).toEqual({ mergedPly: true, sessionJson: true });

    await controller.execute({ kind: 'export', artifact: 'merged-ply' });
    await controller.execute({ kind: 'export', artifact: 'session-json' });

    expect(downloads.saved.map(item => item.name)).toEqual([
      'merged-splats-2026-08-29T12-00-00-000Z.ply',
      'splat-align-session-2026-08-29T12-00-00-000Z.json'
    ]);
    const json = await downloads.saved[1].blob.text();
    expect(json).toContain('"appName": "Splat Align Workbench"');
    expect(json).not.toContain('synthetic-target.ply');
    expect(json).not.toContain('synthetic-source.ply');
  });

  it('rejects commands after close', async () => {
    const { controller } = createHarness();
    controller.close();

    const outcome = await controller.execute({ kind: 'add-pair' });

    expect(outcome).toMatchObject({ ok: false, problem: { code: 'workbench-closed' } });
  });
});
