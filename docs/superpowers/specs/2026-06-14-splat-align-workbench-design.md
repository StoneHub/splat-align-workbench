# Splat Align Workbench Design

## Goal

Build a public browser app for merging two Gaussian splats by manually matching shared landmarks or adjacent stitch guides. The app should productize a focused standalone workflow between automatic registration tools that fail on hard scenes and manual transform editing in general-purpose splat editors.

## Positioning

Splat Align Workbench is not a replacement for SuperSplat. It focuses on one workflow:

```text
Load two splats, identify matching landmarks or stitch guides, compute alignment, preview, export merged PLY.
```

The app should feel like a focused workbench, not a full editor. SuperSplat remains the place for rich editing, cleanup, publishing, and broader scene manipulation.

Prior art / reference:

```text
VFX-Soup/supersplat-snap
```

`supersplat-snap` is a MIT-licensed SuperSplat patch that supports multi-splat point correspondences and Umeyama alignment inside a local SuperSplat checkout. This project differentiates with a hosted/local-first standalone UX, two independent inspection panels, session/export artifacts, analytics, and an opt-in training-data roadmap.

## Architecture

The app is a fresh web app using PlayCanvas/SuperSplat-quality browser rendering primitives where possible. It is not a fork of SuperSplat unless a renderer spike proves direct reuse is impractical.

Core units:

```text
Viewer Shell
  two independent splat viewports: Target and Source

Landmark System
  paired points: A target <-> A source, B target <-> B source

Alignment Solver
  computes source -> target Sim(3) transform from 3+ pairs

Preview and Export
  overlays target + aligned source and exports merged PLY

Analytics
  records product usage and performance events without uploading splat files
```

## MVP Workflow

1. User opens the site.
2. User loads a target splat and a source splat from local files.
3. The app shows two independent viewers side by side.
4. User navigates each viewer independently to find the same real-world feature or adjacent stitch guide.
5. User records matching landmark pairs in Overlap mode, or join/direction/plane guide pairs in Stitch mode.
6. In Overlap mode, 3 complete matching pairs are required.
7. In Stitch mode, one join pair, one direction pair, and at least two plane guide pairs are required.
8. Once the mode's required pairs are complete, the app computes a source-to-target transform and unlocks overlay preview.
9. At 4+ pairs, the app recomputes a best-fit transform after each pair and shows per-point residuals.
10. User downloads a merged target-plus-aligned-source PLY.

## Non-Goals For MVP

- Manual move/rotate/scale transform controls.
- Full SuperSplat editor replacement.
- Server-side splat uploads.
- Deduped/fused merge cleanup.
- Account system.
- Automatic AI alignment.
- Public sharing or publishing.

## Landmark Behavior

The app should make landmark pairing explicit. Each pair has:

```text
id: A, B, C...
target position
source position
label/name optional
residual after solve
enabled/disabled state
```

Three pairs are the minimum for a 3D similarity transform. More pairs improve the least-squares fit and allow residual diagnostics. The app should flag high-residual pairs as likely mistakes but should not delete user data automatically.

## Alignment Math

Use a pure TypeScript Sim(3) solver based on SVD/Kabsch/Umeyama best-fit alignment:

```text
input: source landmark positions, target landmark positions
output: scale, rotation matrix/quaternion, translation, residuals
mapping: aligned = scale * rotation * source + translation
```

The solver must be unit tested with known transforms, noisy points, scale differences, residual calculation, degenerate collinear points, coplanar warnings, and mismatched pair counts.

## Preview And Export

After 3 pairs, show an overlay preview:

```text
target splat
aligned source splat
landmark markers
residual vectors
```

MVP export:

```text
merged target-plus-aligned-source PLY
```

Later export:

```text
transform JSON
session JSON
deduped/fused merge
SOG/SPZ export
```

## Privacy And Data

Splat files stay local in browser memory by default. The app should not upload splat files, filenames, GPS metadata, source media, screenshots, raw landmarks tied to file identity, or raw error messages as part of normal analytics.

Always-on usage analytics are intentional and should be built from day one. Events can include browser/GPU capability, file type, file size bucket, splat count bucket, load time, FPS bucket, landmark count, solve attempts, residual/error bucket, exports, crashes, and feature usage.

Opt-in training contribution is separate. A later phase can ask users to share anonymized alignment sessions to improve automatic alignment. The opt-in bundle may include anonymized landmark pairs, transforms, residuals, derived/downsampled geometry descriptors, and file stats. Full splat upload requires a separate explicit flow.

## Roadmap

Phase 1: Manual landmark alignment with local file loading, solver, overlay preview, and merged PLY export.

Phase 2: Session import/export, better residual diagnostics, disabled outlier pairs, and support for additional splat formats.

Phase 3: Opt-in shared training corpus using anonymized alignment sessions and derived descriptors.

Phase 4: Suggested correspondences and semi-automatic alignment based on collected sessions.

Phase 5: Automatic initial alignment with human correction and confidence reporting.

## Open Technical Spike

Before committing to renderer architecture, inspect PlayCanvas/SuperSplat internals and prove one of these paths:

```text
Preferred: fresh app using separable PlayCanvas splat rendering primitives
Fallback: focused app built from SuperSplat internals while preserving narrow UX
```

The spike is successful when one page can display two independent local splat viewers and an overlay preview path without importing the full editor UX.
