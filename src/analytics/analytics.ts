export type AnalyticsEventName =
  | 'session_started'
  | 'file_loaded'
  | 'landmark_pair_set'
  | 'solve_attempted'
  | 'alignment_previewed'
  | 'export_completed'
  | 'error_reported';

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface AnalyticsProvider {
  track(name: AnalyticsEventName, properties: AnalyticsProperties): void;
}

export class MemoryAnalyticsProvider implements AnalyticsProvider {
  public readonly events: { name: AnalyticsEventName; properties: AnalyticsProperties }[] = [];

  track(name: AnalyticsEventName, properties: AnalyticsProperties): void {
    this.events.push({ name, properties });
  }
}

export function bucketBytes(bytes: number): string {
  if (bytes < 10 * 1024 * 1024) return '<10MB';
  if (bytes < 100 * 1024 * 1024) return '10-100MB';
  if (bytes < 1024 * 1024 * 1024) return '100MB-1GB';
  return '1GB+';
}

export function bucketCount(count: number): string {
  if (count < 100_000) return '<100k';
  if (count < 1_000_000) return '100k-1M';
  if (count < 5_000_000) return '1M-5M';
  return '5M+';
}
