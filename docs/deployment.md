# Deployment Plan

## Decision

Deploy Splat Align Workbench as a standalone static app on Cloudflare Pages.

Primary product URL:

```text
merge.monroes.space
```

Friendly discovery URL:

```text
monroes.space/merge
```

The `/merge` URL should redirect or link into the Cloudflare Pages app. Keep the app itself in this standalone repository.

## Why This Shape

- The app is static-first: Vite build output, local file loading, browser-side rendering, browser-side exports.
- Splat files stay local; hosting does not need to store user splats for the MVP.
- A Cloudflare Pages project keeps deployment independent from the main `monroes.space` site.
- A `monroes.space` subdomain gives product credit and a serious public URL.
- The main site can still promote it with a simple `/merge` route, link, or redirect.
- Cloudflare Workers/R2 remain available later for opt-in training-data contributions without moving hosts.

## URL Policy

Use `merge.monroes.space` for the actual app shell.

Use `monroes.space/merge` as the human-friendly entry point from the main Monroe site.

Avoid deploying this app directly into the main `monroes.space` build unless there is a strong reason. Path-based hosting would couple two products and make deploys more fragile.

## Build Settings

Cloudflare Pages:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Node version: 20.19.0 or newer
```

Optional environment variable:

```text
VITE_ANALYTICS_ENDPOINT=/analytics
```

Leave it unset for local-only analytics during development. Set it to a Cloudflare Worker or other collector endpoint when the privacy-safe event pipeline is ready.

Repository command checks:

```bash
npm run test
npm run build
```

## Privacy And Credit

The public app should clearly state:

- files stay local in the browser by default
- usage analytics do not upload splats, filenames, screenshots, GPS metadata, raw landmarks, or raw error messages by default
- opt-in training contribution is separate and comes later
- built by Monroe Stone / monroes.space

Public V1 exports a merged target-plus-aligned-source PLY. Session/transform JSON can return later, but should not be documented as a current public output until the UI exposes it again.

The app only emits allowlisted analytics fields. Do not send raw filenames, full error messages, raw landmarks, screenshots, GPS/location metadata, or splat file contents from the browser.

## Static Headers

Vite emits hashed assets under `/assets/*`. Keep `public/_headers` so Cloudflare Pages serves those files with long immutable caching and basic browser security headers.

## Rollout Steps

1. Stabilize the current local MVP with real splat pick/solve/export QA.
2. Commit the current renderer and workflow changes.
3. Create/push the GitHub repository.
4. Create a Cloudflare Pages project from the GitHub repo.
5. Add `merge.monroes.space` as the Cloudflare Pages custom domain.
6. Add a `monroes.space/merge` entry point in the main site.
7. Add CI for `npm run test` and `npm run build`.
8. Add basic privacy-safe analytics.
9. Add attribution metadata if session/transform JSON returns.
10. Later: add opt-in training contribution via Cloudflare Workers/R2 or another backend.

## Alternatives

GitHub Pages is acceptable for docs or a simple public demo, but not the preferred product host because GitHub Pages is explicitly limited static hosting and not the right long-term home for a product-style web tool.

Firebase Hosting is acceptable if the project later needs Firebase Analytics/Auth/Firestore, but it adds more product-stack complexity than the static MVP needs.

Vercel is acceptable for fast previews and a polished developer workflow, but Cloudflare Pages fits the `monroes.space` domain and future Workers/R2 path better.
