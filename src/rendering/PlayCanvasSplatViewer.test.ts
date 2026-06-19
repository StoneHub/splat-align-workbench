import { describe, expect, it } from 'vitest';
import { controlSensitivityLabel, navigationMoveStep, wheelZoomFactor } from './PlayCanvasSplatViewer';

describe('navigationMoveStep', () => {
  it('keeps close-range keyboard movement proportional to zoom distance', () => {
    expect(navigationMoveStep(0.001, 0.016, 1)).toBeLessThan(0.00025);
  });

  it('still scales with fast and slow modifiers', () => {
    const base = navigationMoveStep(2, 0.016, 1);

    expect(navigationMoveStep(2, 0.016, 3)).toBeCloseTo(base * 3);
    expect(navigationMoveStep(2, 0.016, 0.25)).toBeCloseTo(base * 0.25);
  });

  it('applies control sensitivity to keyboard movement', () => {
    const base = navigationMoveStep(2, 0.016, 1, 1);

    expect(navigationMoveStep(2, 0.016, 1, 0.4)).toBeCloseTo(base * 0.4);
    expect(navigationMoveStep(2, 0.016, 1, 2)).toBeCloseTo(base * 2);
  });
});

describe('wheelZoomFactor', () => {
  it('keeps low sensitivity wheel zoom closer to the current distance', () => {
    const low = wheelZoomFactor(-120, 0.35);
    const high = wheelZoomFactor(-120, 1.8);

    expect(low).toBeGreaterThan(high);
    expect(Math.abs(1 - low)).toBeLessThan(Math.abs(1 - high));
  });

  it('formats control sensitivity as a compact multiplier', () => {
    expect(controlSensitivityLabel(0.65)).toBe('0.65x');
    expect(controlSensitivityLabel(2)).toBe('2.00x');
  });
});
