import { describe, expect, it } from 'vitest';
import {
  RemoteAnalyticsProvider,
  analyticsErrorCode,
  bucketBytes,
  bucketCount,
  createAnalyticsProvider,
  MemoryAnalyticsProvider,
  PrivacySafeAnalyticsProvider,
  sanitizeAnalyticsProperties,
  type AnalyticsPayload,
  type AnalyticsTransport
} from './analytics';

describe('analytics', () => {
  it('records privacy-safe usage events', () => {
    const provider = new MemoryAnalyticsProvider();
    provider.track('file_loaded', {
      role: 'target',
      fileType: 'ply',
      sizeBucket: bucketBytes(426_486_149),
      splatCountBucket: bucketCount(1_807_138)
    });

    expect(provider.events).toEqual([
      {
        name: 'file_loaded',
        properties: {
          role: 'target',
          fileType: 'ply',
          sizeBucket: '100MB-1GB',
          splatCountBucket: '1M-5M'
        }
      }
    ]);
  });

  it('records alignment mode changes without file details', () => {
    const provider = new MemoryAnalyticsProvider();

    provider.track('alignment_mode_changed', { mode: 'stitch' });

    expect(provider.events).toEqual([
      {
        name: 'alignment_mode_changed',
        properties: { mode: 'stitch' }
      }
    ]);
  });

  it('strips raw messages and filenames before analytics leaves the app boundary', () => {
    expect(sanitizeAnalyticsProperties('error_reported', {
      area: 'file_load',
      message: 'Failed loading /Users/monroe/Downloads/private-scene.ply',
      filename: 'private-scene.ply',
      code: 'unsupported-ply-format'
    })).toEqual({
      area: 'file_load',
      code: 'unsupported-ply-format'
    });
  });

  it('wraps providers with privacy-safe sanitization', () => {
    const memory = new MemoryAnalyticsProvider();
    const provider = new PrivacySafeAnalyticsProvider(memory);

    provider.track('error_reported', {
      area: 'export',
      message: 'Combined preview export requires target and source PLY files with matching vertex properties',
      fileName: 'barn-east.ply',
      code: analyticsErrorCode(new Error('Only binary_little_endian PLY export is supported in the MVP'))
    });

    expect(memory.events).toEqual([
      {
        name: 'error_reported',
        properties: {
          area: 'export',
          code: 'unsupported-ply-format'
        }
      }
    ]);
  });

  it('can send sanitized events to a configured analytics endpoint', () => {
    const sent: { endpoint: string; payload: AnalyticsPayload }[] = [];
    const transport: AnalyticsTransport = {
      send(endpoint, payload) {
        sent.push({ endpoint, payload });
      }
    };
    const provider = new PrivacySafeAnalyticsProvider(new RemoteAnalyticsProvider('/analytics', transport));

    provider.track('error_reported', {
      area: 'export',
      code: 'unexpected-error',
      message: 'Raw browser exception with local file details'
    });

    expect(sent).toEqual([
      {
        endpoint: '/analytics',
        payload: {
          name: 'error_reported',
          properties: {
            area: 'export',
            code: 'unexpected-error'
          }
        }
      }
    ]);
  });

  it('uses remote analytics only when an endpoint is configured', () => {
    expect(createAnalyticsProvider()).toBeInstanceOf(PrivacySafeAnalyticsProvider);
    expect(createAnalyticsProvider('')).toBeInstanceOf(PrivacySafeAnalyticsProvider);
    expect(createAnalyticsProvider('/analytics')).toBeInstanceOf(PrivacySafeAnalyticsProvider);
  });
});
