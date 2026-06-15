import { describe, expect, it } from 'vitest';
import { bucketBytes, bucketCount, MemoryAnalyticsProvider } from './analytics';

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
});
