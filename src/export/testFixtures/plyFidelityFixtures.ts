export type PlyFidelityFixtureId =
  | 'degree-0-numeric'
  | 'degree-1-lexicographic'
  | 'degree-2-numeric'
  | 'degree-3-lexicographic'
  | 'degree-3-normals';

export interface PlyFidelityFixture {
  readonly id: PlyFidelityFixtureId;
  readonly shDegree: 0 | 1 | 2 | 3;
  readonly buffer: ArrayBuffer;
}

interface FixtureDefinition {
  readonly id: PlyFidelityFixtureId;
  readonly shDegree: 0 | 1 | 2 | 3;
  readonly order: 'numeric' | 'lexicographic';
  readonly normals?: boolean;
}

const definitions: readonly FixtureDefinition[] = [
  { id: 'degree-0-numeric', shDegree: 0, order: 'numeric' },
  { id: 'degree-1-lexicographic', shDegree: 1, order: 'lexicographic' },
  { id: 'degree-2-numeric', shDegree: 2, order: 'numeric' },
  { id: 'degree-3-lexicographic', shDegree: 3, order: 'lexicographic' },
  { id: 'degree-3-normals', shDegree: 3, order: 'numeric', normals: true }
];

const propertyNames = (definition: FixtureDefinition): string[] => {
  const restCount = 3 * ((definition.shDegree + 1) ** 2 - 1);
  const rest = Array.from({ length: restCount }, (_, index) => `f_rest_${index}`);
  if (definition.order === 'lexicographic') {
    return [
      'f_dc_0', 'f_dc_1', 'f_dc_2',
      ...rest.sort(),
      'opacity',
      'rot_0', 'rot_1', 'rot_2', 'rot_3',
      'scale_0', 'scale_1', 'scale_2',
      'x', 'y', 'z'
    ];
  }
  return [
    'x', 'y', 'z',
    ...(definition.normals ? ['nx', 'ny', 'nz'] : []),
    'f_dc_0', 'f_dc_1', 'f_dc_2',
    ...rest,
    'opacity',
    'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3'
  ];
};

const propertyValue = (name: string, vertex: number): number => {
  const sign = vertex === 0 ? 1 : -1;
  if (name === 'x') return vertex + 1;
  if (name === 'y') return vertex + 2;
  if (name === 'z') return vertex + 3;
  if (name === 'nx') return vertex === 0 ? 1 : 0;
  if (name === 'ny') return vertex === 0 ? 2 : 0;
  if (name === 'nz') return vertex === 0 ? 3 : 0;
  if (name.startsWith('f_dc_')) return sign * (Number(name.slice(5)) + 1) * 0.1;
  if (name.startsWith('f_rest_')) return sign * (Number(name.slice(7)) + 1) * 0.01;
  if (name === 'opacity') return 0.75;
  if (name.startsWith('scale_')) return -1 - Number(name.slice(6)) * 0.1;
  if (name === 'rot_0') return 1;
  if (name.startsWith('rot_')) return 0;
  throw new Error(`No fidelity value for ${name}`);
};

const createFixture = (definition: FixtureDefinition): PlyFidelityFixture => {
  const properties = propertyNames(definition);
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    `comment SH degree: ${definition.shDegree}`,
    'element vertex 2',
    ...properties.map(name => `property float ${name}`),
    'end_header',
    ''
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const body = new ArrayBuffer(2 * properties.length * 4);
  const view = new DataView(body);
  for (let vertex = 0; vertex < 2; vertex += 1) {
    properties.forEach((name, property) => {
      view.setFloat32((vertex * properties.length + property) * 4, propertyValue(name, vertex), true);
    });
  }
  const bytes = new Uint8Array(headerBytes.byteLength + body.byteLength);
  bytes.set(headerBytes, 0);
  bytes.set(new Uint8Array(body), headerBytes.byteLength);
  return { id: definition.id, shDegree: definition.shDegree, buffer: bytes.buffer };
};

export const plyFidelityFixtures = (): PlyFidelityFixture[] => definitions.map(createFixture);
