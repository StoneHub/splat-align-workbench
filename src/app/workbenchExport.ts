import { bucketBytes, bucketCount } from '../analytics/analytics';
import type { AlignmentMode } from '../domain/alignmentMode';
import type { LandmarkPair } from '../domain/landmarks';
import { createSession, serializeSession } from '../domain/session';
import type { Sim3Success } from '../domain/sim3';
import type { SplatArtifact } from '../domain/splatArtifact';
import { downloadName, makeDownloadBlob } from '../export/exportSession';
import { createMergedSplatPlyBuffer } from '../export/exportPlyTransform';

export type WorkbenchArtifactKind = 'merged-ply' | 'session-json';

export interface WorkbenchArtifactInput {
  kind: WorkbenchArtifactKind;
  createdAt: string;
  mode: AlignmentMode;
  target: SplatArtifact;
  source: SplatArtifact;
  pairs: LandmarkPair[];
  alignment: Sim3Success;
}

export interface BuiltWorkbenchArtifact {
  name: string;
  blob: Blob;
}

const sessionStats = (artifact: SplatArtifact) => ({
  fileType: artifact.stats.fileType,
  sizeBucket: bucketBytes(artifact.stats.sizeBytes),
  splatCountBucket: bucketCount(artifact.stats.vertexCount)
});

export function buildWorkbenchArtifact(input: WorkbenchArtifactInput): BuiltWorkbenchArtifact {
  if (input.kind === 'merged-ply') {
    const merged = createMergedSplatPlyBuffer(input.target.buffer, input.source.buffer, input.alignment.transform);
    return {
      name: downloadName('merged-splats', input.createdAt, 'ply'),
      blob: makeDownloadBlob(merged, 'application/octet-stream')
    };
  }

  const session = createSession({
    createdAt: input.createdAt,
    mode: input.mode,
    target: sessionStats(input.target),
    source: sessionStats(input.source),
    landmarks: input.pairs.filter(pair => pair.enabled),
    transform: input.alignment.transform,
    rmse: input.alignment.rmse,
    warnings: input.alignment.warnings
  });
  return {
    name: downloadName('splat-align-session', input.createdAt, 'json'),
    blob: makeDownloadBlob(serializeSession(session), 'application/json')
  };
}
