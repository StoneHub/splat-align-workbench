# Splat Align Workbench

Standalone browser workbench for merging Gaussian splats by matching real-world landmarks or experimental virtual correspondences.

## What It Is

Splat Align Workbench is a focused browser tool:

- load a target PLY and a source PLY from local files
- inspect them in independent view panels
- use Overlap Align for shared landmarks
- use Experimental Stitch for seam, direction, and plane labels that remain equal-weight virtual correspondence pairs
- compute a source-to-target similarity transform
- preview the aligned overlay
- export a merged target-plus-aligned-source PLY and companion alignment session JSON

## Prior Art

[`VFX-Soup/supersplat-snap`](https://github.com/VFX-Soup/supersplat-snap) validates the same point-correspondence alignment idea inside a patched local SuperSplat checkout. This project is intentionally different: a standalone public site with split-view inspection, a merged export artifact, analytics boundaries, and a future opt-in training-data path.

## Privacy Boundary

Splat files stay local in the browser by default. The app can record privacy-safe workflow events in memory. Outbound analytics stay disabled until this project has an isolated quota, retention policy, and fail-closed budget. Analytics must not upload splat files, filenames, screenshots, GPS metadata, raw landmarks, or raw error messages.

## Live Deployment

The public deployment is a standalone Cloudflare Pages app at `https://merge.monroes.space`, with `https://monroes.space/merge` as the friendly entry point from the main Monroe site. See [docs/deployment.md](docs/deployment.md).

## Development

```bash
npm install
npm run dev:checked
npm run test
npm run build
npm run smoke:live
```

Use `npm run dev:checked` when asking an agent to spin up the workbench. It checks the preferred port, reuses an already healthy server, skips stale TCP listeners that fail HTTP verification, starts Vite on the first usable local port, and prints the verified URL. Avoid detached `nohup ... &` launch attempts from Codex; keep the verified Vite session running in the tool session instead.

Cloudflare Pages should use Node `20.19.0` or newer, `npm run build`, and `dist` as the output directory.

Deploy the current branch manually with:

```bash
npm run deploy:pages
```

Keep `VITE_ANALYTICS_ENDPOINT` unset in local and production environments. Issue [#8](https://github.com/StoneHub/splat-align-workbench/issues/8) tracks the proof required before outbound collection can be enabled.

The current renderer uses PlayCanvas `gsplat` components for local PLY loading, independent viewer navigation, overlay preview, and depth-buffer world picking. Its declarative scene contract makes replacement latest-call-wins and keeps the last committed scene visible if a new asset fails to load. The Overlay renders target/source Landmark crosses, residual vectors, selected-pair emphasis, and outlier emphasis. Viewer resize, stale picks, pending loads, and teardown are explicit lifecycle behavior.

## Synthetic Fixtures

Use the app's `Load Synthetic Set` button when real splats make picking and navigation too noisy to debug. In Overlap mode it generates a target/source checkerboard scene with five colored tower-cap landmarks. In Experimental Stitch mode it generates adjacent road segments with seam, direction, and plane labels. These labels are virtual corresponding points, not geometric constraints.

`Merged PLY` exports the target splat plus the aligned source splat in one file. This is the primary output. `Session JSON` exports the same Alignment and Landmark pairs without raw filenames or splat contents.

The current Merged PLY exporter uses full browser buffers and is not certified for medium or large files. A 65.030 MiB Bucky self-pair added about 200.261 MiB of browser-reported used heap while producing a 130.059 MiB Blob. Do not run the 419 MiB Cedar or larger fixtures through this path. The measured chunked-export budget, fail-closed gates, and spherical-harmonic rotation contract are in [docs/large-ply-export-plan.md](docs/large-ply-export-plan.md).

## Viewer Controls

- Click a viewer to focus it.
- Use each viewer's `Reset`, `+`, and `-` buttons for quick framing and close inspection.
- Adjust `Control speed` when wheel zoom, drag, pan, or keyboard movement feels too fast or too slow for the current splat scale.
- Drag to orbit.
- Shift-drag, right-drag, or middle-drag to pan.
- Wheel to dolly in/out.
- `W` / `S` move forward/back.
- `A` / `D` strafe left/right.
- `Q` / `E` move down/up.
- Arrow keys look around.
- Hold Shift for faster keyboard movement, Option/Alt for slower movement.
- `F` frames the loaded splat again.
- Press `Target: pick` or `Source: pick` to arm landmark picking; the next click in that viewer records the point or reports a miss.
