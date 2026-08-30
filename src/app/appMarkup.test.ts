import { describe, expect, it } from 'vitest';
import { createAppMarkup } from './appMarkup';

describe('createAppMarkup', () => {
  it('keeps the side panel focused on landmark selection and the two accepted exports', () => {
    const markup = createAppMarkup();

    expect(markup).not.toContain('Preview Alignment');
    expect(markup).not.toContain('Transform JSON');
    expect(markup).not.toContain('supersplat-snap');
    expect(markup).not.toContain('local-first');
    expect(markup).not.toContain('.splat');
    expect(markup).toContain('accept=".ply"');
    expect(markup).toContain('data-alignment-mode="overlap"');
    expect(markup).toContain('data-alignment-mode="stitch"');
    expect(markup).toContain('Experimental Stitch');
    expect(markup).toContain('data-landmark-toolbar');
    expect(markup).toContain('data-action="add-pair"');
    expect(markup).toContain('>+</button>');
    expect(markup).toContain('Merged PLY');
    expect(markup).toContain('Session JSON');
  });
});
