import { parsePlyHeader } from './ply';
import type { SplatRenderSource } from '../rendering/RendererAdapter';
import { loadSplatCloudFromPly, type SplatCloud, type SplatFileStats } from '../rendering/splatData';

export type SplatSide = 'target' | 'source';

export interface SplatFileInput {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface SplatArtifact {
  side: SplatSide;
  displayName: string;
  vertexCount: number;
  buffer: ArrayBuffer;
  cloud: SplatCloud;
  stats: SplatFileStats;
}

export async function readSplatArtifact(side: SplatSide, file: SplatFileInput): Promise<SplatArtifact> {
  const buffer = await file.arrayBuffer();
  const cloud = loadSplatCloudFromPly(buffer);
  const header = parsePlyHeader(buffer);
  return {
    side,
    displayName: file.name,
    vertexCount: header.vertexCount,
    buffer,
    cloud,
    stats: {
      fileType: file.name.split('.').pop()?.toLowerCase() ?? 'unknown',
      sizeBytes: file.size,
      vertexCount: header.vertexCount
    }
  };
}

export function splatRenderSource(artifact: SplatArtifact): SplatRenderSource {
  return {
    name: artifact.displayName,
    buffer: artifact.buffer,
    cloud: artifact.cloud
  };
}

export function inMemorySplatFile(name: string, buffer: ArrayBuffer): SplatFileInput {
  return {
    name,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.slice(0)
  };
}
