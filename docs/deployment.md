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
Production branch: main
```

Reserved environment variable:

```text
VITE_ANALYTICS_ENDPOINT=/analytics
```

Leave it unset in local and production environments. Enable it only after issue #8 proves project-isolated quota, retention, payload, and fail-closed budget controls.

Repository command checks:

```bash
npm run test
npm run build
npm run smoke:live
```

Manual deploy command:

```bash
npm run deploy:pages
```

## Privacy And Credit

The public app should clearly state:

- files stay local in the browser by default
- usage analytics do not upload splats, filenames, screenshots, GPS metadata, raw landmarks, or raw error messages by default
- opt-in training contribution is separate and comes later
- built by Monroe Stone / monroes.space

Public V1 provides a Merged PLY as the primary artifact and Alignment session JSON as its companion. Transform JSON remains internal.

The app only emits allowlisted analytics fields. Do not send raw filenames, full error messages, raw landmarks, screenshots, GPS/location metadata, or splat file contents from the browser.

## Static Headers

Vite emits hashed assets under `/assets/*`. Keep `public/_headers` so Cloudflare Pages serves those files with long immutable caching and basic browser security headers.

## Rollout Status

- Live app: `https://merge.monroes.space`
- Friendly entry point: `https://monroes.space/merge`
- Cloudflare Pages project: `splat-align-workbench`
- GitHub repo: `StoneHub/splat-align-workbench`
- Public V1 artifacts: primary Merged PLY plus companion Alignment session JSON

Next:

1. Keep `main` as the launch branch.
2. Run `npm run test`, `npm run build`, and `npm run smoke:live` before public announcements.
3. Keep `VITE_ANALYTICS_ENDPOINT` unset until issue #8 proves the privacy, isolation, retention, and budget gates.
4. Later: add opt-in training contribution via Cloudflare Workers/R2 or another backend.

## Alternatives

GitHub Pages is acceptable for docs or a simple public demo, but not the preferred product host because GitHub Pages is explicitly limited static hosting and not the right long-term home for a product-style web tool.

Firebase Hosting is acceptable if the project later needs Firebase Analytics/Auth/Firestore, but it adds more product-stack complexity than the static MVP needs.

Vercel is acceptable for fast previews and a polished developer workflow, but Cloudflare Pages fits the `monroes.space` domain and future Workers/R2 path better.
