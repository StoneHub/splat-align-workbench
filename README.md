# Splat Align Workbench

Standalone browser workbench for aligning Gaussian splats by matching real-world landmarks.

## What It Is

Splat Align Workbench is a focused local-first site:

- load a target splat and a source splat from local files
- inspect them in independent view panels
- pick 3+ matching landmarks
- compute a source-to-target similarity transform
- preview the aligned overlay
- export transform JSON, session JSON, and an aligned source PLY

## Prior Art

[`VFX-Soup/supersplat-snap`](https://github.com/VFX-Soup/supersplat-snap) validates the same point-correspondence alignment idea inside a patched local SuperSplat checkout. This project is intentionally different: a standalone public site with split-view inspection, session/export artifacts, analytics boundaries, and a future opt-in training-data path.

## Privacy Boundary

Splat files stay local in the browser by default. Usage analytics should track workflow health and performance without uploading splat files, filenames, screenshots, GPS metadata, or raw private landmarks.

## Development

```bash
npm install
npm run dev
npm run test
npm run build
```

The first renderer is a sampled point-cloud spike so the workflow can be exercised while the PlayCanvas/SuperSplat renderer integration remains replaceable.
