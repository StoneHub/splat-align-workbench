import { APP_ATTRIBUTION, type AppAttribution } from '../domain/session';
import type { Sim3Transform } from '../domain/sim3';

export interface TransformExport extends AppAttribution {
  transform: Sim3Transform;
}

export function makeDownloadBlob(content: string | ArrayBuffer, type: string): Blob {
  return new Blob([content], { type });
}

export function downloadName(prefix: string, timestamp: string, extension: string): string {
  return `${prefix}-${timestamp.replaceAll(':', '-').replaceAll('.', '-')}.${extension}`;
}

export function serializeJsonExport(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function createTransformExport(transform: Sim3Transform): TransformExport {
  return {
    ...APP_ATTRIBUTION,
    transform
  };
}
