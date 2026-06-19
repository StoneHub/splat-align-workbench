export type AnalyticsEventName =
  | 'session_started'
  | 'file_loaded'
  | 'landmark_pair_set'
  | 'solve_attempted'
  | 'alignment_previewed'
  | 'alignment_mode_changed'
  | 'export_completed'
  | 'fixture_loaded'
  | 'error_reported';

export type AnalyticsProperties = Record<string, string | number | boolean | null>;
export interface AnalyticsPayload {
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
}

export interface AnalyticsProvider {
  track(name: AnalyticsEventName, properties: AnalyticsProperties): void;
}

export interface AnalyticsTransport {
  send(endpoint: string, payload: AnalyticsPayload): void;
}

const allowedProperties: Record<AnalyticsEventName, Set<string>> = {
  session_started: new Set(['localFilesOnly']),
  file_loaded: new Set(['role', 'fileType', 'sizeBucket', 'splatCountBucket']),
  landmark_pair_set: new Set(['side', 'pairId']),
  solve_attempted: new Set(['pairCount', 'ok', 'mode']),
  alignment_previewed: new Set(['pairCount', 'rmseBucket', 'mode']),
  alignment_mode_changed: new Set(['mode']),
  export_completed: new Set(['type']),
  fixture_loaded: new Set(['type', 'mode', 'landmarkCount']),
  error_reported: new Set(['area', 'code'])
};

export function sanitizeAnalyticsProperties(name: AnalyticsEventName, properties: AnalyticsProperties): AnalyticsProperties {
  const allowed = allowedProperties[name];
  return Object.fromEntries(Object.entries(properties).filter(([key]) => allowed.has(key)));
}

export function analyticsErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('binary_little_endian')) return 'unsupported-ply-format';
  if (message.includes('matching vertex properties')) return 'incompatible-ply-properties';
  if (message.includes('missing x/y/z')) return 'invalid-ply';
  if (message.includes('no spatial spread') || message.includes('collinear') || message.includes('mirrored transform')) return 'solve-input-invalid';
  return 'unexpected-error';
}

export class MemoryAnalyticsProvider implements AnalyticsProvider {
  public readonly events: AnalyticsPayload[] = [];

  track(name: AnalyticsEventName, properties: AnalyticsProperties): void {
    this.events.push({ name, properties });
  }
}

export class BrowserAnalyticsTransport implements AnalyticsTransport {
  send(endpoint: string, payload: AnalyticsPayload): void {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true
    });
  }
}

export class RemoteAnalyticsProvider implements AnalyticsProvider {
  constructor(
    private readonly endpoint: string,
    private readonly transport: AnalyticsTransport = new BrowserAnalyticsTransport()
  ) {}

  track(name: AnalyticsEventName, properties: AnalyticsProperties): void {
    this.transport.send(this.endpoint, { name, properties });
  }
}

export class PrivacySafeAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly delegate: AnalyticsProvider) {}

  track(name: AnalyticsEventName, properties: AnalyticsProperties): void {
    this.delegate.track(name, sanitizeAnalyticsProperties(name, properties));
  }
}

export function createAnalyticsProvider(endpoint?: string): AnalyticsProvider {
  const configuredEndpoint = endpoint?.trim();
  const delegate = configuredEndpoint
    ? new RemoteAnalyticsProvider(configuredEndpoint)
    : new MemoryAnalyticsProvider();
  return new PrivacySafeAnalyticsProvider(delegate);
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
