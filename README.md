# Splat Align Workbench

Standalone browser workbench for merging Gaussian splats by matching real-world landmarks or stitch guides.

## What It Is

Splat Align Workbench is a focused browser tool:

- load a target PLY and a source PLY from local files
- inspect them in independent view panels
- use Overlap Align for shared landmarks
- use Stitch Adjacent for seam, direction, and plane guides
- compute a source-to-target similarity transform
- preview the aligned overlay
- export a merged target-plus-aligned-source PLY

## Prior Art

[`VFX-Soup/supersplat-snap`](https://github.com/VFX-Soup/supersplat-snap) validates the same point-correspondence alignment idea inside a patched local SuperSplat checkout. This project is intentionally different: a standalone public site with split-view inspection, a merged export artifact, analytics boundaries, and a future opt-in training-data path.

## Privacy Boundary

Splat files stay local in the browser by default. Usage analytics track workflow health and performance using coarse buckets and event names. They must not upload splat files, filenames, screenshots, GPS metadata, raw landmarks, or raw error messages.

## Deployment Direction

The intended public deployment is a standalone Cloudflare Pages app at `merge.monroes.space`, with `monroes.space/merge` as the friendly entry point from the main Monroe site. See [docs/deployment.md](docs/deployment.md).

## Development

```bash
npm install
npm run dev:checked
npm run test
npm run build
```

Use `npm run dev:checked` when asking an agent to spin up the workbench. It checks the preferred port, reuses an already healthy server, skips stale TCP listeners that fail HTTP verification, starts Vite on the first usable local port, and prints the verified URL. Avoid detached `nohup ... &` launch attempts from Codex; keep the verified Vite session running in the tool session instead.

Cloudflare Pages should use Node `20.19.0` or newer, `npm run build`, and `dist` as the output directory.

Optional production analytics can be enabled with `VITE_ANALYTICS_ENDPOINT`. Keep it unset locally; when configured, outbound events are allowlisted before they leave the browser.

The current renderer uses PlayCanvas `gsplat` components for local PLY loading, independent viewer navigation, overlay preview, and depth-buffer world picking. The renderer stays behind a small adapter so the workbench can keep its split-view product flow while adopting more SuperSplat-quality internals over time.

## Synthetic Fixtures

Use the app's `Load Synthetic Set` button when real splats make picking and navigation too noisy to debug. In Overlap mode it generates a target/source checkerboard scene with five colored tower-cap landmarks. In Stitch mode it generates adjacent road segments with seam, direction, and plane guide markers.

`Merged PLY` exports the target splat plus the aligned source splat in one file. This is the primary output of the tool.

Large PLY files are processed locally in browser memory. Practical limits depend on the user's machine and browser.

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
