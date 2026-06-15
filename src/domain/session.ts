import type { LandmarkPair } from './landmarks';
import type { Sim3Transform } from './sim3';

export interface SplatStats {
  fileType?: string;
  sizeBucket?: string;
  splatCountBucket?: string;
}

export interface AlignmentSession {
  version: 1;
  createdAt: string;
  target: SplatStats;
  source: SplatStats;
  landmarks: LandmarkPair[];
  transform?: Sim3Transform;
  rmse?: number;
  warnings?: string[];
}

export interface CreateSessionInput {
  createdAt?: string;
  target: SplatStats;
  source: SplatStats;
  landmarks: LandmarkPair[];
  transform?: Sim3Transform;
  rmse?: number;
  warnings?: string[];
}

export function createSession(input: CreateSessionInput): AlignmentSession {
  return {
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    target: input.target,
    source: input.source,
    landmarks: input.landmarks,
    transform: input.transform,
    rmse: input.rmse,
    warnings: input.warnings
  };
}

export function serializeSession(session: AlignmentSession): string {
  return `${JSON.stringify(session, null, 2)}\n`;
}
