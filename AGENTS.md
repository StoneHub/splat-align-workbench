# Splat Align Workbench Instructions

Workflow gates are hard requirements. Inspect this file, the product spec, and the implementation plan before editing.

## Project Purpose

This repo is for a public, browser-based Gaussian splat alignment workbench. It is not a SuperSplat replacement and not part of the native Splats app.

Core promise:

```text
Align two Gaussian splats by matching real-world landmarks.
```

MVP workflow:

```text
Load target splat
Load source splat
Navigate both splats independently
Pick 3+ matching landmark pairs
Compute source -> target similarity transform
Preview aligned overlay
Download aligned source and session JSON
```

## Product Principles

- Splat files stay local in the browser by default.
- Product usage analytics are intentional from day one.
- Training-data contribution is opt-in and separate from usage analytics.
- Do not add manual move/rotate/scale controls to the MVP. The point is to avoid manual transform work.
- Export aligned source before attempting fused or deduped merge.
- Prefer SuperSplat/PlayCanvas-quality browser rendering primitives over native rendering.
- Keep the tool narrow: alignment, confidence, preview, export.

## Data Boundaries

Always-on analytics may include:

```text
session started
browser / OS / GPU capability
file type loaded
file size bucket
splat count bucket
load time
render FPS bucket
landmark count
solve attempt count
residual/error score
export type
crashes/errors
feature usage
```

Do not send by default:

```text
full splat files
raw filenames
GPS/location metadata
source media
screenshots
raw landmarks tied to file identity
```

Opt-in training contribution may later send anonymized landmark pairs, derived geometry descriptors, transforms, residuals, and file stats.

## Engineering Defaults

- Keep modules small and testable.
- Use TypeScript for core app code.
- Put math in pure modules with unit tests before wiring UI.
- Use browser-local file APIs for loading and export.
- Treat large splats as a performance constraint from the first version.
- Do not introduce server-side upload paths unless the product spec explicitly changes.

## Required Docs

Read before implementation:

```text
docs/superpowers/specs/2026-06-14-splat-align-workbench-design.md
docs/superpowers/plans/2026-06-14-splat-align-workbench.md
```
