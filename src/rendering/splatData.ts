import { parsePlyHeader } from '../domain/ply';
import { applySim3, type Sim3Transform, type Vec3 } from '../domain/sim3';

export interface SplatCloud {
  points: Vec3[];
  vertexCount: number;
  boundsMin: Vec3;
  boundsMax: Vec3;
  center: Vec3;
  radius: number;
}

export interface SplatFileStats {
  fileType: string;
  sizeBytes: number;
  vertexCount: number;
}

const toVec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

const updateBounds = (min: Vec3, max: Vec3, point: Vec3) => {
  for (let i = 0; i < 3; i += 1) {
    min[i] = Math.min(min[i], point[i]);
    max[i] = Math.max(max[i], point[i]);
  }
};

const buildCloud = (points: Vec3[], vertexCount: number): SplatCloud => {
  const boundsMin: Vec3 = [Infinity, Infinity, Infinity];
  const boundsMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  points.forEach(point => updateBounds(boundsMin, boundsMax, point));
  const center: Vec3 = [
    (boundsMin[0] + boundsMax[0]) / 2,
    (boundsMin[1] + boundsMax[1]) / 2,
    (boundsMin[2] + boundsMax[2]) / 2
  ];
  const radius = Math.max(
    boundsMax[0] - boundsMin[0],
    boundsMax[1] - boundsMin[1],
    boundsMax[2] - boundsMin[2],
    1
  ) / 2;
  return { points, vertexCount, boundsMin, boundsMax, center, radius };
};

export function loadSplatCloudFromPly(buffer: ArrayBuffer, sampleLimit = 90_000): SplatCloud {
  const header = parsePlyHeader(buffer);
  if (header.format !== 'binary_little_endian') {
    throw new Error('MVP viewer supports binary_little_endian PLY files');
  }
  const xIndex = header.properties.indexOf('x');
  const yIndex = header.properties.indexOf('y');
  const zIndex = header.properties.indexOf('z');
  if (xIndex === -1 || yIndex === -1 || zIndex === -1) {
    throw new Error('PLY is missing x/y/z properties');
  }

  const view = new DataView(buffer);
  const stride = header.properties.length * 4;
  const step = Math.max(1, Math.ceil(header.vertexCount / sampleLimit));
  const points: Vec3[] = [];

  for (let vertex = 0; vertex < header.vertexCount; vertex += step) {
    const row = header.headerByteLength + vertex * stride;
    points.push(toVec3(
      view.getFloat32(row + xIndex * 4, true),
      view.getFloat32(row + yIndex * 4, true),
      view.getFloat32(row + zIndex * 4, true)
    ));
  }

  return buildCloud(points, header.vertexCount);
}

export function transformedCloud(cloud: SplatCloud, transform: Sim3Transform): SplatCloud {
  return buildCloud(cloud.points.map(point => applySim3(transform, point)), cloud.vertexCount);
}
