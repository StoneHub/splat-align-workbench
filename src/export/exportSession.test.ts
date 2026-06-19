import { describe, expect, it } from 'vitest';
import { createTransformExport, downloadName, makeDownloadBlob, serializeJsonExport } from './exportSession';
import type { Sim3Transform } from '../domain/sim3';

describe('exportSession', () => {
  it('creates JSON blobs and filesystem-safe names', async () => {
    const blob = makeDownloadBlob('{"ok":true}\n', 'application/json');

    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"ok":true}\n');
    expect(downloadName('session', '2026-06-15T12:00:00.000Z', 'json')).toBe('session-2026-06-15T12-00-00-000Z.json');
  });

  it('wraps transform JSON with product attribution', () => {
    const transform: Sim3Transform = {
      scale: 1,
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ],
      translation: [0, 0, 0]
    };

    const json = serializeJsonExport(createTransformExport(transform));
    const parsed = JSON.parse(json);

    expect(parsed).toMatchObject({
      appName: 'Splat Align Workbench',
      appUrl: 'https://merge.monroes.space',
      author: 'Monroe Stone',
      site: 'https://monroes.space',
      transform
    });
    expect(json.endsWith('\n')).toBe(true);
  });
});
