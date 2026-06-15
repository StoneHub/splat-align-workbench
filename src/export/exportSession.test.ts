import { describe, expect, it } from 'vitest';
import { downloadName, makeDownloadBlob } from './exportSession';

describe('exportSession', () => {
  it('creates JSON blobs and filesystem-safe names', async () => {
    const blob = makeDownloadBlob('{"ok":true}\n', 'application/json');

    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"ok":true}\n');
    expect(downloadName('session', '2026-06-15T12:00:00.000Z', 'json')).toBe('session-2026-06-15T12-00-00-000Z.json');
  });
});
