# Splat Align Workbench Design

## Goal

Build a public browser app for aligning two Gaussian splats by manually matching shared landmarks. The app should solve the missing workflow between automatic registration tools that fail on hard scenes and manual transform editing in general-purpose splat editors.

## Positioning

Splat Align Workbench is not a replacement for SuperSplat. It focuses on one missing feature:

```text
Load two splats, identify matching real-world points, compute alignment, preview, export.
```

The app should feel like a focused workbench, not a full editor. SuperSplat remains the place for rich editing, cleanup, publishing, and broader scene manipulation.

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
  overlays target + aligned source and exports aligned source/session files

Analytics
  records product usage and performance events without uploading splat files
```

## MVP Workflow

1. User opens the site.
2. User loads a target splat and a source splat from local files.
3. The app shows two independent viewers side by side.
4. User navigates each viewer independently to find the same real-world feature.
5. User records matching landmark pairs.
6. At 0-2 pairs, the app shows that 3 pairs are required.
7. At 3 pairs, the app computes a first source-to-target transform and unlocks overlay preview.
8. At 4+ pairs, the app recomputes a best-fit transform after each pair and shows per-point residuals.
9. User downloads an aligned source PLY and session JSON.

## Non-Goals For MVP

- Manual move/rotate/scale transform controls.
- Full SuperSplat editor replacement.
- Server-side splat uploads.
- Fused/deduped merge export.
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

Use a pure TypeScript Sim(3) solver based on Umeyama/Kabsch-style best-fit alignment:

```text
input: source landmark positions, target landmark positions
output: scale, rotation matrix/quaternion, translation, residuals
mapping: aligned = scale * rotation * source + translation
```

The solver must be unit tested with known transforms, noisy points, degenerate collinear points, and mismatched pair counts.

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
aligned source PLY
transform JSON
session JSON
```

Later export:

```text
combined PLY
deduped/fused merge
SOG/SPZ export
```

## Privacy And Data

Splat files stay local in browser memory by default. The app should not upload splat files, filenames, GPS metadata, source media, screenshots, or raw landmarks tied to file identity as part of normal analytics.

Always-on usage analytics are intentional and should be built from day one. Events can include browser/GPU capability, file type, file size bucket, splat count bucket, load time, FPS bucket, landmark count, solve attempts, residual/error bucket, exports, crashes, and feature usage.

Opt-in training contribution is separate. A later phase can ask users to share anonymized alignment sessions to improve automatic alignment. The opt-in bundle may include anonymized landmark pairs, transforms, residuals, derived/downsampled geometry descriptors, and file stats. Full splat upload requires a separate explicit flow.

## Roadmap

Phase 1: Manual landmark alignment with local file loading, solver, overlay preview, and aligned-source export.

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
