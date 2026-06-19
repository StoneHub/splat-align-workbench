import { describe, expect, it } from 'vitest';
import { formatSolveStatus } from './solveFeedback';

describe('formatSolveStatus', () => {
  it('turns geometry warnings into actionable picking guidance', () => {
    const status = formatSolveStatus(3, 0.0053, ['coplanar-landmarks', 'clustered-landmarks']);

    expect(status).toContain('3 pairs solved');
    expect(status).toContain('RMSE 0.0053');
    expect(status).toContain('Add landmarks farther apart');
    expect(status).toContain('different depths or heights');
  });
});
