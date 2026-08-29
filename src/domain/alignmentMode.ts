import { nextLandmarkId, type LandmarkPair } from './landmarks';

export type AlignmentMode = 'overlap' | 'stitch';
export type LandmarkPairKind = 'match' | 'join' | 'direction' | 'plane';

interface LandmarkModeCopy {
  lede: string;
  toolbarTitle: string;
  needsText: string;
  incompleteText: string;
  solvedText: string;
  sourceCompleteText: string;
  syntheticLoadedText: string;
}

const pair = (id: string, label: string, kind: LandmarkPairKind): LandmarkPair => ({
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

const completeEnabledKindCount = (pairs: LandmarkPair[], kind: LandmarkPairKind): number => {
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
      lede: 'Experimental Stitch matches adjacent scenes with virtual corresponding points, not geometric constraints.',
      toolbarTitle: 'Virtual correspondences',
      needsText: 'Needs seam, direction, and plane-labeled pairs',
      incompleteText: 'Pick seam, direction, and plane-labeled points on both splats.',
      solvedText: 'Cyan target + magenta aligned source',
      sourceCompleteText: 'Virtual correspondence set. Add more pairs or export once the Alignment looks right.',
      syntheticLoadedText: 'Adjacent road fixture loaded. Pick the labeled virtual corresponding points.'
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
