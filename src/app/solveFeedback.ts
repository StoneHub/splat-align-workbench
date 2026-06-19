const warningCopy: Record<string, string> = {
  'clustered-landmarks': 'Add landmarks farther apart',
  'coplanar-landmarks': 'add points at different depths or heights'
};

export function formatSolveStatus(pairCount: number, rmse: number, warnings: string[]): string {
  const summary = `${pairCount} pairs solved. RMSE ${rmse.toFixed(4)}`;
  const guidance = warnings
    .map(warning => warningCopy[warning] ?? warning)
    .filter((warning, index, all) => all.indexOf(warning) === index);
  return guidance.length ? `${summary}. ${guidance.join('; ')}.` : summary;
}
