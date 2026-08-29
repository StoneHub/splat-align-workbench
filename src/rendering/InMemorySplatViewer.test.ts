import { describe, expect, it } from 'vitest';
import { InMemorySplatViewer } from './InMemorySplatViewer';
import { ViewerDisposedError, type PickEvent, type SplatRenderSource, type ViewerScene } from './RendererAdapter';

const splat = (name: string): SplatRenderSource => ({
  name,
  buffer: new ArrayBuffer(8),
  cloud: {
    points: [[0, 0, 0]],
    vertexCount: 1,
    boundsMin: [0, 0, 0],
    boundsMax: [0, 0, 0],
    center: [0, 0, 0],
    radius: 0.5
  }
});

describe('InMemorySplatViewer', () => {
  it('applies a declarative scene through the renderer interface', async () => {
    const viewer = new InMemorySplatViewer();
    const scene = { kind: 'single', splat: splat('target.ply') } as const;

    await expect(viewer.replace(scene)).resolves.toEqual({ status: 'applied' });
    expect(viewer.currentScene()).toEqual(scene);
  });

  it('preserves the applied scene when its replacement fails', async () => {
    const viewer = new InMemorySplatViewer();
    const first = { kind: 'single', splat: splat('first.ply') } as const;
    const replacement = { kind: 'single', splat: splat('broken.ply') } as const;
    await viewer.replace(first);
    viewer.failNextReplacement(new Error('asset load failed'));

    await expect(viewer.replace(replacement)).rejects.toThrow('asset load failed');
    expect(viewer.currentScene()).toEqual(first);
  });

  it('preserves the complete overlay transform and diagnostics contract', async () => {
    const viewer = new InMemorySplatViewer();
    const scene: ViewerScene = {
      kind: 'overlay',
      target: splat('target.ply'),
      source: {
        splat: splat('source.ply'),
        sourceToTarget: {
          scale: 2,
          rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
          translation: [3, 4, 5]
        }
      },
      diagnostics: [{
        id: 'A',
        target: [3, 6, 5],
        source: [1, 0, 0],
        enabled: true,
        selected: true,
        quality: 'good'
      }]
    };

    await viewer.replace(scene);

    expect(viewer.currentScene()).toEqual(scene);
  });

  it('lets the latest replacement win when an older load finishes last', async () => {
    const viewer = new InMemorySplatViewer();
    const older = { kind: 'single', splat: splat('older.ply') } as const;
    const latest = { kind: 'single', splat: splat('latest.ply') } as const;
    const gate = viewer.delayNextReplacement();

    const olderReplacement = viewer.replace(older);
    await gate.started;
    await expect(viewer.replace(latest)).resolves.toEqual({ status: 'applied' });
    gate.release();

    await expect(olderReplacement).resolves.toEqual({ status: 'superseded' });
    expect(viewer.currentScene()).toEqual(latest);
  });

  it('publishes one hit-or-miss stream only while picking is armed', () => {
    const viewer = new InMemorySplatViewer();
    const events: PickEvent[] = [];
    const unsubscribe = viewer.onPick(event => events.push(event));

    viewer.emitHit([9, 9, 9]);
    viewer.setPickMode(true);
    viewer.emitHit([1, 2, 3]);
    viewer.emitMiss();
    unsubscribe();
    viewer.emitMiss();

    expect(events).toEqual([
      { kind: 'hit', worldPosition: [1, 2, 3] },
      { kind: 'miss' }
    ]);
  });

  it('records sensitivity, navigation, and resize through the common interface', () => {
    const viewer = new InMemorySplatViewer();

    viewer.setControlSensitivity(0.8);
    viewer.navigate({ kind: 'reset' });
    viewer.navigate({ kind: 'zoom', factor: 0.5 });
    viewer.resize();
    viewer.resize();

    expect(viewer.currentControlSensitivity()).toBe(0.8);
    expect(viewer.navigationHistory()).toEqual([
      { kind: 'reset' },
      { kind: 'zoom', factor: 0.5 }
    ]);
    expect(viewer.resizeCount()).toBe(2);
  });

  it('tears down idempotently and supersedes pending replacement work', async () => {
    const viewer = new InMemorySplatViewer();
    const events: PickEvent[] = [];
    viewer.onPick(event => events.push(event));
    viewer.setPickMode(true);
    const gate = viewer.delayNextReplacement();
    const pending = viewer.replace({ kind: 'single', splat: splat('pending.ply') });
    await gate.started;

    viewer.dispose();
    viewer.dispose();
    viewer.emitHit([1, 2, 3]);
    gate.release();

    await expect(pending).resolves.toEqual({ status: 'superseded' });
    expect(viewer.currentScene()).toEqual({ kind: 'empty' });
    expect(viewer.isDisposed()).toBe(true);
    expect(events).toEqual([]);
  });

  it('rejects common-interface work after disposal', async () => {
    const viewer = new InMemorySplatViewer();
    viewer.dispose();

    await expect(viewer.replace({ kind: 'empty' })).rejects.toBeInstanceOf(ViewerDisposedError);
    expect(() => viewer.onPick(() => undefined)).toThrow(ViewerDisposedError);
    expect(() => viewer.setPickMode(true)).toThrow(ViewerDisposedError);
    expect(() => viewer.setControlSensitivity(1)).toThrow(ViewerDisposedError);
    expect(() => viewer.navigate({ kind: 'reset' })).toThrow(ViewerDisposedError);
    expect(() => viewer.resize()).toThrow(ViewerDisposedError);
  });
});
