import { nextLandmarkId, type LandmarkPair } from './landmarks';

export type AlignmentMode = 'overlap' | 'stitch';
export type LandmarkConstraintKind = 'match' | 'join' | 'direction' | 'plane';

interface LandmarkModeCopy {
  lede: string;
  toolbarTitle: string;
  needsText: string;
  incompleteText: string;
  solvedText: string;
  sourceCompleteText: string;
  syntheticLoadedText: string;
}

const pair = (id: string, label: string, kind: LandmarkConstraintKind): LandmarkPair => ({
  id,
  label,
  kind,
  enabled: true,
  quality: 'unset'
});

export function createPairsForMode(mode: AlignmentMode): LandmarkPair[] {
  if (mode === 'stitch') {
    return [
      pair('A', 'Join seam', 'join'),
      pair('B', 'Direction guide', 'direction'),
      pair('C', 'Plane guide 1', 'plane'),
      pair('D', 'Plane guide 2', 'plane')
    ];
  }
  return [
    pair('A', 'Match point', 'match'),
    pair('B', 'Match point', 'match'),
    pair('C', 'Match point', 'match')
  ];
}

export function nextPairForMode(mode: AlignmentMode, pairs: LandmarkPair[]): LandmarkPair {
  const id = nextLandmarkId(pairs);
  if (mode === 'stitch') {
    const existingPlaneGuides = pairs.filter(item => item.kind === 'plane').length;
    return pair(id, `Plane guide ${existingPlaneGuides + 1}`, 'plane');
  }
  return pair(id, 'Match point', 'match');
}

const completeEnabledKindCount = (pairs: LandmarkPair[], kind: LandmarkConstraintKind): number => {
  return pairs.filter(item => item.enabled && item.kind === kind && item.source && item.target).length;
};

export function canSolveForMode(mode: AlignmentMode, pairs: LandmarkPair[]): boolean {
  if (mode === 'stitch') {
    return completeEnabledKindCount(pairs, 'join') >= 1
      && completeEnabledKindCount(pairs, 'direction') >= 1
      && completeEnabledKindCount(pairs, 'plane') >= 2;
  }
  return pairs.filter(item => item.enabled && item.source && item.target).length >= 3;
}

export function landmarkModeCopy(mode: AlignmentMode): LandmarkModeCopy {
  if (mode === 'stitch') {
    return {
      lede: 'Stitch adjacent splats by matching seam, direction, and plane guides.',
      toolbarTitle: 'Stitch guides',
      needsText: 'Needs join, direction, and plane guides',
      incompleteText: 'Pick join, direction, and plane guides on both splats.',
      solvedText: 'Cyan target + magenta stitched source',
      sourceCompleteText: 'Guide set. Add more plane guides or export the merged PLY once alignment looks right.',
      syntheticLoadedText: 'Adjacent road fixture loaded. Pick seam, direction arrow, and plane guide markers.'
    };
  }
  return {
    lede: 'Merge two local splats by matching shared landmarks.',
    toolbarTitle: 'Landmarks',
    needsText: 'Needs 3 matching pairs',
    incompleteText: 'Add matching target/source landmarks.',
    solvedText: 'Cyan target + magenta source',
    sourceCompleteText: 'Landmark set. Add more pairs or export the merged PLY once alignment looks right.',
    syntheticLoadedText: 'Synthetic checkerboard loaded. Pick A-E as red, green, blue, yellow, and magenta tower caps.'
  };
}
