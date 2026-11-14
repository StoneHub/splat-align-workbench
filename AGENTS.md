# Splat Align Workbench Instructions

Workflow gates are hard requirements. Inspect this file, the product spec, and the implementation plan before editing.

This file is the single source of truth for every coding agent that works in this repository, whatever provider runs it (Claude Code, Codex, t3code, Cursor, Copilot and others). `CLAUDE.md` only imports this file. Add provider-neutral rules here; do not duplicate them in provider-specific files.

## Project Purpose

This repo is for a public, browser-based Gaussian splat alignment workbench. It is not a SuperSplat replacement and not part of the native Splats app.

Core promise:

```text
Align two Gaussian splats by matching real-world landmarks.
```

Prior art / reference:

```text
VFX-Soup/supersplat-snap
```

`supersplat-snap` is a MIT-licensed SuperSplat patch that adds point-correspondence alignment inside a local SuperSplat checkout. This project must not claim to be the first point-correspondence splat alignment tool. The product moat is the standalone public site, split-view workflow, local-first privacy boundary, explicit session/export layer, analytics, and opt-in training-data roadmap.

MVP workflow:

```text
Load target splat
Load source splat
Navigate both splats independently
Pick 3+ matching landmark pairs
Compute source -> target similarity transform
Preview aligned overlay
Download merged PLY and session JSON
```

## Product Principles

- Splat files stay local in the browser by default.
- Product usage analytics are intentional from day one.
- Training-data contribution is opt-in and separate from usage analytics.
- Do not add manual move/rotate/scale controls to the MVP. The point is to avoid manual transform work.
- Export a merged target-plus-aligned-source PLY as the primary artifact.
- Prefer SuperSplat/PlayCanvas-quality browser rendering primitives over native rendering.
- Keep the tool narrow: alignment, confidence, preview, export.
- Use a real SVD/Kabsch/Umeyama similarity solve. Do not ship the earlier approximate three-point basis solver as the final core solver.

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

## Build and CI environments

Monroe's development runs on Monroe's own hardware. These rules hold for any agent, in any provider's harness, and they hold whether or not the infrastructure below exists yet.

### Where work runs

| Work | Runs on | Status |
| --- | --- | --- |
| `npm ci`, `npm run test` (vitest), `npm run build` (tsc + vite), lint | `fcfdev`, a Linux ARM server, as a self-hosted GitHub Actions runner in Docker containers | planned, see #11. Today `.github/workflows/ci.yml` runs on GitHub-hosted `ubuntu-latest` for every push and pull request |
| Local iteration (`npm run dev`, tests while editing) | the agent's own sandbox or container, or the dev machine, with `node_modules`, `.vite` and `dist` inside the repo checkout (all gitignored) | live |
| Browser rendering and GPU checks on real splats | a real browser on real hardware, never a headless run in a shared container, when a number or a visual result is being claimed | live |
| Deploy (`npm run deploy:pages`, Cloudflare Pages) | manual, run by Monroe | live |

### Hard rules

- Never spend paid GitHub-hosted runner minutes or any third-party runner service (Blacksmith and the like). The hosted workflow that exists today starts on its own on every push; do not push repeatedly to make it run. Run `npm run test` and `npm run build` locally first, then push once. A docs-only commit may carry `[skip ci]` in its message.
- Keep Monroe's main macOS user account clean. The Mac Pro is Monroe's daily machine: no stray caches, global npm installs, or runner state in its home folder. Node comes from `.nvmrc` through nvm, fnm or mise; project dependencies stay in the checkout.
- Infrastructure is planned until this table says live. Do not change `runs-on`, add runner registrations or Docker files for runners that are not registered yet; propose them on #11 instead. When the fcfdev lane goes live, update this table and `runs-on` in the same PR.
- Performance claims need real hardware and a real browser. Say which machine and browser produced every number you report.

## Required Docs

Read before implementation:

```text
docs/superpowers/specs/2026-06-14-splat-align-workbench-design.md
docs/superpowers/plans/2026-06-14-splat-align-workbench.md
```

## Agent skills

### Issue tracker

Track work in GitHub Issues for `StoneHub/splat-align-workbench`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default Matt triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain layout. See `docs/agents/domain.md`.
