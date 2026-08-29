import type { Vec3 } from '../domain/sim3';
import {
  ViewerDisposedError,
  type PickEvent,
  type SceneReplacement,
  type SplatViewer,
  type ViewerNavigation,
  type ViewerScene
} from './RendererAdapter';

interface ReplacementGate {
  started(): void;
  wait: Promise<void>;
}

export class InMemorySplatViewer implements SplatViewer {
  private scene: ViewerScene = { kind: 'empty' };
  private nextReplacementError: Error | null = null;
  private nextReplacementGate: ReplacementGate | null = null;
  private replacementRevision = 0;
  private readonly pickHandlers = new Set<(event: PickEvent) => void>();
  private pickMode = false;
  private controlSensitivity = 1;
  private readonly navigations: ViewerNavigation[] = [];
  private resizeCallCount = 0;
  private disposed = false;

  async replace(scene: ViewerScene): Promise<SceneReplacement> {
    this.requireActive();
    const revision = ++this.replacementRevision;
    const error = this.nextReplacementError;
    const gate = this.nextReplacementGate;
    this.nextReplacementError = null;
    this.nextReplacementGate = null;
    if (gate) {
      gate.started();
      await gate.wait;
    }
    if (revision !== this.replacementRevision) return { status: 'superseded' };
    if (error) throw error;
    this.scene = scene;
    return { status: 'applied' };
  }

  failNextReplacement(error: Error): void {
    this.nextReplacementError = error;
  }

  delayNextReplacement(): { started: Promise<void>; release(): void } {
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    this.nextReplacementGate = { started: markStarted, wait };
    return { started, release };
  }

  onPick(handler: (event: PickEvent) => void): () => void {
    this.requireActive();
    this.pickHandlers.add(handler);
    return () => this.pickHandlers.delete(handler);
  }

  setPickMode(enabled: boolean): void {
    this.requireActive();
    this.pickMode = enabled;
  }

  setControlSensitivity(value: number): void {
    this.requireActive();
    this.controlSensitivity = value;
  }

  navigate(command: ViewerNavigation): void {
    this.requireActive();
    this.navigations.push(command);
  }

  resize(): void {
    this.requireActive();
    this.resizeCallCount += 1;
  }

  currentControlSensitivity(): number {
    return this.controlSensitivity;
  }

  isPickModeEnabled(): boolean {
    return this.pickMode;
  }

  navigationHistory(): readonly ViewerNavigation[] {
    return [...this.navigations];
  }

  resizeCount(): number {
    return this.resizeCallCount;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.replacementRevision += 1;
    this.scene = { kind: 'empty' };
    this.pickMode = false;
    this.pickHandlers.clear();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private requireActive(): void {
    if (this.disposed) throw new ViewerDisposedError();
  }

  emitHit(worldPosition: Vec3): void {
    this.emitPick({ kind: 'hit', worldPosition });
  }

  emitMiss(): void {
    this.emitPick({ kind: 'miss' });
  }

  private emitPick(event: PickEvent): void {
    if (!this.pickMode) return;
    this.pickHandlers.forEach(handler => handler(event));
  }

  currentScene(): ViewerScene {
    return this.scene;
  }
}
