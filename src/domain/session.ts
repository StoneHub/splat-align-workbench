import type { AlignmentMode } from './alignmentMode';
import type { LandmarkPair } from './landmarks';
import type { Sim3Transform } from './sim3';

export interface AppAttribution {
  appName: string;
  appUrl: string;
  author: string;
  site: string;
}

export const APP_ATTRIBUTION: AppAttribution = {
  appName: 'Splat Align Workbench',
  appUrl: 'https://merge.monroes.space',
  author: 'Monroe Stone',
  site: 'https://monroes.space'
};

export interface SplatStats {
  fileType?: string;
  sizeBucket?: string;
  splatCountBucket?: string;
}

export interface AlignmentSession extends AppAttribution {
  version: 1;
  createdAt: string;
  mode: AlignmentMode;
  target: SplatStats;
  source: SplatStats;
  landmarks: LandmarkPair[];
  transform?: Sim3Transform;
  rmse?: number;
  warnings?: string[];
}

export interface CreateSessionInput {
  createdAt?: string;
  mode: AlignmentMode;
  target: SplatStats;
  source: SplatStats;
  landmarks: LandmarkPair[];
  transform?: Sim3Transform;
  rmse?: number;
  warnings?: string[];
}

export function createSession(input: CreateSessionInput): AlignmentSession {
  return {
    ...APP_ATTRIBUTION,
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    mode: input.mode,
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
