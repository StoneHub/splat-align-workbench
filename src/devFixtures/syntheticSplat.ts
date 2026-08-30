import { addVec3, applySim3, scaleVec3, type Sim3Transform, type Vec3 } from '../domain/sim3';

type Rgb = [number, number, number];

interface SyntheticSplat {
  position: Vec3;
  color: Rgb;
  alpha: number;
  scale: Vec3;
}

interface SyntheticLandmark {
  id: string;
  name: string;
  hint: string;
  kind?: 'match' | 'join' | 'direction' | 'plane';
  source: Vec3;
  target: Vec3;
}

export interface SyntheticAlignmentManifest {
  fixtureName: string;
  files: {
    target: string;
    source: string;
  };
  knownSourceToTarget: Sim3Transform;
  landmarks: SyntheticLandmark[];
  overlap: {
    sharedElements: string[];
    sourceOnlyElements: string[];
    targetOnlyElements: string[];
  };
  stitch?: {
    correspondences: Array<{
      id: string;
      kind: 'join' | 'direction' | 'plane';
      label: string;
      meaning: string;
    }>;
  };
  notes: string[];
}

export interface SyntheticFixtureFile {
  name: string;
  buffer: ArrayBuffer;
  mimeType: string;
}

export interface SyntheticAlignmentFixture {
  files: {
    target: SyntheticFixtureFile;
    source: SyntheticFixtureFile;
    manifest: {
      name: string;
      content: string;
      mimeType: string;
    };
  };
  manifest: SyntheticAlignmentManifest;
}

const SH_C0 = 0.28209479177387814;

const PLY_PROPERTIES = [
  'x', 'y', 'z',
  'f_dc_0', 'f_dc_1', 'f_dc_2',
  'opacity',
  'scale_0', 'scale_1', 'scale_2',
  'rot_0', 'rot_1', 'rot_2', 'rot_3'
] as const;

const SOURCE_TO_TARGET: Sim3Transform = {
  scale: 1.28,
  rotation: [
    [0.838670567945424, -0.5446390350150271, 0],
    [0.5446390350150271, 0.838670567945424, 0],
    [0, 0, 1]
  ],
  translation: [1.15, -0.72, 0.58]
};

const STITCH_SOURCE_TO_TARGET: Sim3Transform = {
  scale: 1.05,
  rotation: [
    [0.9271838545667874, -0.374606593415912, 0],
    [0.374606593415912, 0.9271838545667874, 0],
    [0, 0, 1]
  ],
  translation: [0.4, -0.25, 0.18]
};

const COLORS = {
  floorLight: [0.78, 0.82, 0.87] as Rgb,
  floorDark: [0.16, 0.19, 0.23] as Rgb,
  red: [1, 0.08, 0.06] as Rgb,
  green: [0.1, 0.95, 0.18] as Rgb,
  blue: [0.08, 0.32, 1] as Rgb,
  yellow: [1, 0.9, 0.08] as Rgb,
  magenta: [1, 0.1, 0.78] as Rgb,
  cyan: [0.08, 0.9, 1] as Rgb,
  orange: [1, 0.48, 0.08] as Rgb,
  violet: [0.52, 0.26, 1] as Rgb,
  white: [0.95, 0.97, 1] as Rgb
};

const landmarkDefinitions = [
  { id: 'A', name: 'red northwest tower cap', hint: 'red tower top', source: [-2.1, -2.1, 1.25] as Vec3, color: COLORS.red },
  { id: 'B', name: 'green southeast tower cap', hint: 'green tower top', source: [2.15, -1.8, 1.55] as Vec3, color: COLORS.green },
  { id: 'C', name: 'blue northeast tower cap', hint: 'blue tower top', source: [2, 2.05, 1.15] as Vec3, color: COLORS.blue },
  { id: 'D', name: 'yellow southwest tower cap', hint: 'yellow tower top', source: [-1.95, 1.9, 1.4] as Vec3, color: COLORS.yellow },
  { id: 'E', name: 'magenta center mast cap', hint: 'highest magenta top', source: [0.15, 0.2, 2.15] as Vec3, color: COLORS.magenta }
] as const;

const addVec = (splats: SyntheticSplat[], position: Vec3, color: Rgb, scale = 0.055, alpha = 0.88) => {
  splats.push({ position, color, alpha, scale: [scale, scale, scale] });
};

const addCheckerboard = (splats: SyntheticSplat[]) => {
  const halfCells = 8;
  const step = 0.3;
  for (let x = -halfCells; x <= halfCells; x += 1) {
    for (let y = -halfCells; y <= halfCells; y += 1) {
      const color = (x + y) % 2 === 0 ? COLORS.floorLight : COLORS.floorDark;
      addVec(splats, [x * step, y * step, 0], color, 0.045, 0.82);
    }
  }
};

const addAxisGuides = (splats: SyntheticSplat[]) => {
  for (let i = -9; i <= 9; i += 1) {
    addVec(splats, [i * 0.28, -2.75, 0.12], COLORS.red, 0.04, 0.9);
    addVec(splats, [-2.75, i * 0.28, 0.12], COLORS.green, 0.04, 0.9);
  }
  for (let i = 0; i <= 10; i += 1) {
    addVec(splats, [-2.75, -2.75, i * 0.18], COLORS.blue, 0.042, 0.9);
  }
};

const addTower = (splats: SyntheticSplat[], top: Vec3, color: Rgb) => {
  const levels = 11;
  for (let level = 0; level <= levels; level += 1) {
    const z = top[2] * (level / levels);
    addVec(splats, [top[0], top[1], z], color, 0.072, 0.93);
  }

  const ringRadius = 0.14;
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    addVec(splats, [
      top[0] + Math.cos(angle) * ringRadius,
      top[1] + Math.sin(angle) * ringRadius,
      top[2]
    ], COLORS.white, 0.048, 0.86);
  }
  addVec(splats, top, color, 0.1, 0.97);
};

const addSourceOnlyContext = (splats: SyntheticSplat[]) => {
  addAxisGuides(splats);
  for (let index = 0; index < 20; index += 1) {
    const t = index / 19;
    addVec(splats, [-2.1 + t * 4.1, 2.55, 0.28 + Math.sin(t * Math.PI) * 0.55], COLORS.cyan, 0.04, 0.86);
  }
};

const addTargetOnlyContext = (splats: SyntheticSplat[]) => {
  for (let index = 0; index < 34; index += 1) {
    const t = index / 33;
    addVec(splats, [2.65, -2.2 + t * 4.4, 0.18 + (index % 3) * 0.16], COLORS.orange, 0.045, 0.88);
  }
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    addVec(splats, [
      0.4 + Math.cos(angle) * 0.58,
      -0.35 + Math.sin(angle) * 0.58,
      0.72
    ], COLORS.violet, 0.052, 0.88);
  }
};

const createSharedSplats = (): SyntheticSplat[] => {
  const splats: SyntheticSplat[] = [];
  addCheckerboard(splats);
  landmarkDefinitions.forEach(landmark => addTower(splats, landmark.source, landmark.color));
  return splats;
};

const createSourceSplats = (): SyntheticSplat[] => {
  const splats = createSharedSplats();
  addSourceOnlyContext(splats);
  return splats;
};

const createTargetWorldSplats = (): SyntheticSplat[] => {
  const splats = createSharedSplats();
  addTargetOnlyContext(splats);
  return splats;
};

const transformedSplats = (source: SyntheticSplat[]): SyntheticSplat[] => source.map(splat => ({
  ...splat,
  position: applySim3(SOURCE_TO_TARGET, splat.position),
  scale: splat.scale.map(value => value * SOURCE_TO_TARGET.scale) as Vec3
}));

const transformedStitchSplats = (source: SyntheticSplat[]): SyntheticSplat[] => source.map(splat => ({
  ...splat,
  position: applySim3(STITCH_SOURCE_TO_TARGET, splat.position),
  scale: splat.scale.map(value => value * STITCH_SOURCE_TO_TARGET.scale) as Vec3
}));

const stitchForward = (): Vec3 => applySim3(STITCH_SOURCE_TO_TARGET, [1, 0, 0]).map((value, index) => {
  const seam = STITCH_SOURCE_TO_TARGET.translation[index];
  return (value - seam) / STITCH_SOURCE_TO_TARGET.scale;
}) as Vec3;

const stitchSide = (): Vec3 => applySim3(STITCH_SOURCE_TO_TARGET, [0, 1, 0]).map((value, index) => {
  const seam = STITCH_SOURCE_TO_TARGET.translation[index];
  return (value - seam) / STITCH_SOURCE_TO_TARGET.scale;
}) as Vec3;

const addRoadPatch = (
  splats: SyntheticSplat[],
  origin: Vec3,
  forward: Vec3,
  side: Vec3,
  start: number,
  end: number,
  colorA: Rgb,
  colorB: Rgb
) => {
  const lanes = [-0.9, -0.45, 0, 0.45, 0.9];
  for (let longitudinal = start; longitudinal <= end + 1e-6; longitudinal += 0.28) {
    lanes.forEach((lane, laneIndex) => {
      const position = addVec3(addVec3(origin, scaleVec3(forward, longitudinal)), scaleVec3(side, lane));
      const color = Math.round(longitudinal * 10 + laneIndex) % 2 === 0 ? colorA : colorB;
      addVec(splats, position, color, 0.045, 0.83);
    });
  }
};

const addStitchMarkers = (splats: SyntheticSplat[], landmarks: readonly { source: Vec3; color: Rgb }[]) => {
  landmarks.forEach(landmark => {
    addVec(splats, landmark.source, landmark.color, 0.12, 0.98);
    addVec(splats, [landmark.source[0], landmark.source[1], landmark.source[2] + 0.18], COLORS.white, 0.055, 0.9);
  });
};

const encodeColor = (color: Rgb): Rgb => color.map(value => (value - 0.5) / SH_C0) as Rgb;

const encodeOpacity = (alpha: number): number => Math.log(alpha / (1 - alpha));

const writeSplat = (view: DataView, byteOffset: number, splat: SyntheticSplat) => {
  const dc = encodeColor(splat.color);
  const values = [
    splat.position[0], splat.position[1], splat.position[2],
    dc[0], dc[1], dc[2],
    encodeOpacity(splat.alpha),
    Math.log(splat.scale[0]), Math.log(splat.scale[1]), Math.log(splat.scale[2]),
    1, 0, 0, 0
  ];
  values.forEach((value, index) => view.setFloat32(byteOffset + index * 4, value, true));
};

const serializePly = (splats: SyntheticSplat[], comment: string): ArrayBuffer => {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'comment splat-align-workbench synthetic fixture',
    `comment ${comment}`,
    `element vertex ${splats.length}`,
    ...PLY_PROPERTIES.map(property => `property float ${property}`),
    'end_header',
    ''
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const stride = PLY_PROPERTIES.length * 4;
  const buffer = new ArrayBuffer(headerBytes.byteLength + splats.length * stride);
  new Uint8Array(buffer).set(headerBytes);
  const view = new DataView(buffer);
  splats.forEach((splat, index) => writeSplat(view, headerBytes.byteLength + index * stride, splat));
  return buffer;
};

export function createSyntheticAlignmentFixture(): SyntheticAlignmentFixture {
  const sourceSplats = createSourceSplats();
  const targetSplats = transformedSplats(createTargetWorldSplats());
  const landmarks = landmarkDefinitions.map(landmark => ({
    id: landmark.id,
    name: landmark.name,
    hint: landmark.hint,
    source: landmark.source,
    target: applySim3(SOURCE_TO_TARGET, landmark.source)
  }));

  const manifest: SyntheticAlignmentManifest = {
    fixtureName: 'checkerboard-landmark-sim3',
    files: {
      target: 'synthetic-target-checkerboard.ply',
      source: 'synthetic-source-checkerboard.ply'
    },
    knownSourceToTarget: SOURCE_TO_TARGET,
    landmarks,
    overlap: {
      sharedElements: [
        'checkerboard floor patch',
        'red, green, blue, yellow corner tower caps',
        'magenta center mast cap'
      ],
      sourceOnlyElements: [
        'red/green/blue axis guides',
        'cyan raised back ribbon'
      ],
      targetOnlyElements: [
        'orange side scan strip',
        'violet circular marker ring'
      ]
    },
    notes: [
      'Use the five colored tower caps as matching landmarks.',
      'The target and source are intentionally not identical: they share landmarks and checkerboard structure, but each side has view-specific context.',
      'The app should recover the knownSourceToTarget transform with near-zero residuals when the caps are picked accurately.'
    ]
  };

  return {
    files: {
      target: {
        name: manifest.files.target,
        buffer: serializePly(targetSplats, 'target scene transformed from source by knownSourceToTarget'),
        mimeType: 'application/octet-stream'
      },
      source: {
        name: manifest.files.source,
        buffer: serializePly(sourceSplats, 'source scene with checkerboard and colored landmark towers'),
        mimeType: 'application/octet-stream'
      },
      manifest: {
        name: 'synthetic-checkerboard-landmarks.json',
        content: `${JSON.stringify(manifest, null, 2)}\n`,
        mimeType: 'application/json'
      }
    },
    manifest
  };
}

export function createSyntheticStitchFixture(): SyntheticAlignmentFixture {
  const stitchLandmarks = [
    { id: 'A', name: 'join seam', hint: 'white seam marker where the two road segments touch', kind: 'join' as const, source: [0, 0, 0] as Vec3, color: COLORS.white },
    { id: 'B', name: 'direction guide', hint: 'cyan path sample paired with the matching target path sample', kind: 'direction' as const, source: [1.25, 0, 0] as Vec3, color: COLORS.cyan },
    { id: 'C', name: 'plane guide left', hint: 'yellow road-edge sample paired with the matching target sample', kind: 'plane' as const, source: [0.15, 0.85, 0] as Vec3, color: COLORS.yellow },
    { id: 'D', name: 'plane guide height', hint: 'magenta height sample paired with the matching target sample', kind: 'plane' as const, source: [0.1, 0, 0.65] as Vec3, color: COLORS.magenta }
  ] as const;

  const sourceSplats: SyntheticSplat[] = [];
  addRoadPatch(sourceSplats, [0, 0, 0], [1, 0, 0], [0, 1, 0], 0, 4.2, COLORS.floorLight, COLORS.floorDark);
  for (let i = 0; i < 18; i += 1) {
    addVec(sourceSplats, [i * 0.22, -1.15, 0.18 + (i % 3) * 0.08], COLORS.green, 0.045, 0.88);
  }
  addStitchMarkers(sourceSplats, stitchLandmarks);

  const targetSplats: SyntheticSplat[] = [];
  const seam = STITCH_SOURCE_TO_TARGET.translation;
  const forward = stitchForward();
  const side = stitchSide();
  addRoadPatch(targetSplats, seam, forward, side, -4.2, 0, COLORS.floorLight, COLORS.floorDark);
  for (let i = 0; i < 22; i += 1) {
    const t = i / 21;
    addVec(targetSplats, addVec3(addVec3(seam, scaleVec3(forward, -4.45 + t * 3.6)), scaleVec3(side, 1.2)), COLORS.orange, 0.045, 0.88);
  }
  addStitchMarkers(targetSplats, stitchLandmarks.map(landmark => ({
    source: applySim3(STITCH_SOURCE_TO_TARGET, landmark.source),
    color: landmark.color
  })));

  const landmarks = stitchLandmarks.map(landmark => ({
    id: landmark.id,
    name: landmark.name,
    hint: landmark.hint,
    kind: landmark.kind,
    source: landmark.source,
    target: applySim3(STITCH_SOURCE_TO_TARGET, landmark.source)
  }));

  const manifest: SyntheticAlignmentManifest = {
    fixtureName: 'adjacent-road-stitch-sim3',
    files: {
      target: 'synthetic-target-road-stitch.ply',
      source: 'synthetic-source-road-stitch.ply'
    },
    knownSourceToTarget: STITCH_SOURCE_TO_TARGET,
    landmarks,
    overlap: {
      sharedElements: [],
      sourceOnlyElements: [
        'source road segment after the seam',
        'green source-side scan strip'
      ],
      targetOnlyElements: [
        'target road segment before the seam',
        'orange target-side scan strip'
      ]
    },
    stitch: {
      correspondences: [
        { id: 'A', kind: 'join', label: 'Join seam', meaning: 'a source seam point corresponding to the target seam point' },
        { id: 'B', kind: 'direction', label: 'Direction guide', meaning: 'a source path sample corresponding to a target path sample' },
        { id: 'C', kind: 'plane', label: 'Plane guide 1', meaning: 'a source road-edge sample corresponding to a target road-edge sample' },
        { id: 'D', kind: 'plane', label: 'Plane guide 2', meaning: 'a source height sample corresponding to a target height sample' }
      ]
    },
    notes: [
      'This fixture has adjacent road segments rather than shared surface overlap.',
      'Use A as the seam pair, B as the direction-labeled pair, and C/D as plane-labeled pairs.',
      'The app should recover the knownSourceToTarget transform and export one continuous merged PLY.'
    ]
  };

  return {
    files: {
      target: {
        name: manifest.files.target,
        buffer: serializePly(targetSplats, 'target road segment before stitch seam'),
        mimeType: 'application/octet-stream'
      },
      source: {
        name: manifest.files.source,
        buffer: serializePly(sourceSplats, 'source road segment after stitch seam'),
        mimeType: 'application/octet-stream'
      },
      manifest: {
        name: 'synthetic-adjacent-road-stitch.json',
        content: `${JSON.stringify(manifest, null, 2)}\n`,
        mimeType: 'application/json'
      }
    },
    manifest
  };
}
