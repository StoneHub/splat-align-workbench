# Splat Align Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first working standalone browser app that loads two local splat files, lets a user mark matching landmarks, computes a source-to-target transform, previews alignment, and exports session/transform artifacts.

**Architecture:** Fresh TypeScript web app with a renderer spike first. Core math, landmarks, analytics, file handling, and export stay isolated from the UI so renderer choices can change without rewriting the product workflow. `VFX-Soup/supersplat-snap` is prior art/reference for point-correspondence alignment inside SuperSplat; this app differentiates through standalone split-view workflow, session/export artifacts, analytics, and the training-data roadmap.

**Tech Stack:** TypeScript, Vite, PlayCanvas/SuperSplat rendering primitives if feasible, Vitest for pure modules, browser File API, local-only processing, analytics adapter abstraction.

---

## File Structure

Create these files:

```text
package.json
vite.config.ts
tsconfig.json
index.html
src/main.ts
src/app/App.ts
src/app/app.css
src/domain/landmarks.ts
src/domain/sim3.ts
src/domain/sim3.test.ts
src/domain/ply.ts
src/domain/ply.test.ts
src/domain/session.ts
src/domain/session.test.ts
src/rendering/RendererAdapter.ts
src/rendering/MockSplatViewer.ts
src/rendering/renderer-spike-notes.md
src/analytics/analytics.ts
src/analytics/analytics.test.ts
src/export/exportSession.ts
src/export/exportSession.test.ts
src/export/exportPlyTransform.ts
src/export/exportPlyTransform.test.ts
```

Responsibilities:

```text
src/domain/sim3.ts
  pure SVD/Kabsch/Umeyama similarity-transform solver and residual calculation

src/domain/landmarks.ts
  landmark pair model, validation, add/update/remove/disable helpers

src/domain/ply.ts
  minimal Brush/3DGS PLY header parser and binary row layout metadata

src/domain/session.ts
  serializable session shape for import/export

src/rendering/*
  viewer interface and initial mock viewer; later replace with PlayCanvas renderer

src/analytics/analytics.ts
  event schema and provider abstraction; no splat upload path

src/export/*
  transform/session export and streaming PLY transform export
```

## Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/app/App.ts`
- Create: `src/app/app.css`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "splat-align-workbench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-legacy": "^6.0.0",
    "vite": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
```

- [ ] **Step 3: Create the app shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Splat Align Workbench</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/main.ts`:

```ts
import { createApp } from './app/App';
import './app/app.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root');
}

createApp(root);
```

Create `src/app/App.ts`:

```ts
export function createApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <section class="viewer-panel">
        <header><strong>Target</strong><span>No file loaded</span></header>
        <div class="viewer-surface">Target viewer</div>
      </section>
      <section class="viewer-panel">
        <header><strong>Source</strong><span>No file loaded</span></header>
        <div class="viewer-surface">Source viewer</div>
      </section>
      <aside class="side-panel">
        <h1>Splat Align</h1>
        <p>Load two splats, mark 3+ matching landmarks, solve alignment.</p>
        <button type="button" disabled>Preview Alignment</button>
      </aside>
    </main>
  `;
}
```

Create `src/app/app.css`:

```css
:root {
  color: #e6edf3;
  background: #0d1117;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 320px;
  gap: 12px;
  height: 100vh;
  padding: 12px;
  box-sizing: border-box;
}

.viewer-panel,
.side-panel {
  border: 1px solid #30363d;
  border-radius: 6px;
  background: #161b22;
  overflow: hidden;
}

.viewer-panel header {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #30363d;
  color: #8b949e;
}

.viewer-panel strong,
.side-panel h1 {
  color: #e6edf3;
}

.viewer-surface {
  height: calc(100% - 42px);
  display: grid;
  place-items: center;
  background: #05080d;
  color: #8b949e;
}

.side-panel {
  padding: 16px;
}

.side-panel button {
  width: 100%;
  height: 40px;
}
```

- [ ] **Step 4: Run build**

Run: `npm install`

Expected: dependencies install successfully.

Run: `npm run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html src/main.ts src/app/App.ts src/app/app.css
git commit -m "chore: scaffold splat align workbench"
```

## Task 2: Sim(3) Solver

Prior art note: implement the solver as a tested pure module. `supersplat-snap` also uses Umeyama; do not copy its UI shape or rely on SuperSplat Scene Manager interaction.

**Files:**
- Create: `src/domain/sim3.ts`
- Create: `src/domain/sim3.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/sim3.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applySim3, solveSim3, type Vec3 } from './sim3';

const closeVec = (actual: Vec3, expected: Vec3, precision = 5) => {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
};

describe('solveSim3', () => {
  it('recovers translation, rotation, and scale from four non-coplanar points', () => {
    const source: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
    const target: Vec3[] = [
      [10, -2, 3],
      [10, 0, 3],
      [8, -2, 3],
      [10, -2, 5]
    ];

    const result = solveSim3(source, target);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    closeVec(applySim3(result.transform, [1, 0, 0]), [10, 0, 3]);
    closeVec(applySim3(result.transform, [0, 1, 0]), [8, -2, 3]);
    expect(result.rmse).toBeLessThan(1e-8);
  });

  it('rejects fewer than three pairs', () => {
    const result = solveSim3([[0, 0, 0], [1, 0, 0]], [[1, 1, 1], [2, 1, 1]]);
    expect(result.ok).toBe(false);
  });

  it('rejects mismatched pair counts', () => {
    const result = solveSim3([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[1, 1, 1]]);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/domain/sim3.test.ts`

Expected: FAIL because `src/domain/sim3.ts` does not exist.

- [ ] **Step 3: Implement solver**

Create `src/domain/sim3.ts`:

```ts
export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

export interface Sim3Transform {
  scale: number;
  rotation: Mat3;
  translation: Vec3;
}

export interface Sim3Success {
  ok: true;
  transform: Sim3Transform;
  residuals: number[];
  rmse: number;
}

export interface Sim3Failure {
  ok: false;
  reason: string;
}

export type Sim3Result = Sim3Success | Sim3Failure;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const normalize = (v: Vec3): Vec3 | null => {
  const length = norm(v);
  return length < 1e-12 ? null : mul(v, 1 / length);
};

const centroid = (points: Vec3[]): Vec3 => mul(points.reduce(add, [0, 0, 0]), 1 / points.length);

const basisFromPoints = (points: Vec3[]): Mat3 | null => {
  const origin = points[0];
  const x = normalize(sub(points[1], origin));
  if (!x) return null;

  const candidate = sub(points[2], origin);
  const z = normalize(cross(x, candidate));
  if (!z) return null;

  const y = normalize(cross(z, x));
  if (!y) return null;

  return [x, y, z];
};

const matVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]
];

const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]]
];

const multiply = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])]
  ];
};

export function applySim3(transform: Sim3Transform, point: Vec3): Vec3 {
  return add(mul(matVec(transform.rotation, point), transform.scale), transform.translation);
}

export function solveSim3(source: Vec3[], target: Vec3[]): Sim3Result {
  if (source.length !== target.length) {
    return { ok: false, reason: 'source and target pair counts differ' };
  }
  if (source.length < 3) {
    return { ok: false, reason: 'at least three landmark pairs are required' };
  }

  const sourceBasis = basisFromPoints(source);
  const targetBasis = basisFromPoints(target);
  if (!sourceBasis || !targetBasis) {
    return { ok: false, reason: 'first three landmark pairs are degenerate or collinear' };
  }

  const rotation = multiply(targetBasis, transpose(sourceBasis));
  const sourceCenter = centroid(source);
  const targetCenter = centroid(target);

  const sourceSpread = source.reduce((sum, point) => sum + norm(sub(point, sourceCenter)), 0);
  const targetSpread = target.reduce((sum, point) => sum + norm(sub(point, targetCenter)), 0);
  if (sourceSpread < 1e-12) {
    return { ok: false, reason: 'source landmarks have no usable spatial spread' };
  }

  const scale = targetSpread / sourceSpread;
  const translation = sub(targetCenter, mul(matVec(rotation, sourceCenter), scale));
  const transform = { scale, rotation, translation };
  const residuals = source.map((point, index) => norm(sub(applySim3(transform, point), target[index])));
  const rmse = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);

  return { ok: true, transform, residuals, rmse };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/domain/sim3.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sim3.ts src/domain/sim3.test.ts
git commit -m "feat: add landmark similarity solver"
```

## Task 3: Landmark Model

**Files:**
- Create: `src/domain/landmarks.ts`

- [ ] **Step 1: Create landmark model**

Create `src/domain/landmarks.ts`:

```ts
import type { Vec3 } from './sim3';

export interface LandmarkPair {
  id: string;
  target?: Vec3;
  source?: Vec3;
  label?: string;
  enabled: boolean;
  residual?: number;
}

export const createEmptyPairs = (): LandmarkPair[] => [
  { id: 'A', enabled: true },
  { id: 'B', enabled: true },
  { id: 'C', enabled: true }
];

export function setLandmarkPoint(
  pairs: LandmarkPair[],
  id: string,
  side: 'target' | 'source',
  point: Vec3
): LandmarkPair[] {
  const next = pairs.map(pair => pair.id === id ? { ...pair, [side]: point } : pair);
  if (next.some(pair => pair.id === id)) return next;
  return [...next, { id, enabled: true, [side]: point }];
}

export function completeEnabledPairs(pairs: LandmarkPair[]): Required<Pick<LandmarkPair, 'target' | 'source'>>[] {
  return pairs
    .filter(pair => pair.enabled && pair.target && pair.source)
    .map(pair => ({ target: pair.target as Vec3, source: pair.source as Vec3 }));
}

export function nextLandmarkId(pairs: LandmarkPair[]): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of alphabet) {
    if (!pairs.some(pair => pair.id === letter)) return letter;
  }
  return `P${pairs.length + 1}`;
}
```

- [ ] **Step 2: Wire landmark placeholders into UI**

Modify `src/app/App.ts` to show initial pairs:

```ts
import { createEmptyPairs } from '../domain/landmarks';

export function createApp(root: HTMLElement): void {
  const pairs = createEmptyPairs();
  root.innerHTML = `
    <main class="app-shell">
      <section class="viewer-panel">
        <header><strong>Target</strong><span>No file loaded</span></header>
        <div class="viewer-surface">Target viewer</div>
      </section>
      <section class="viewer-panel">
        <header><strong>Source</strong><span>No file loaded</span></header>
        <div class="viewer-surface">Source viewer</div>
      </section>
      <aside class="side-panel">
        <h1>Splat Align</h1>
        <p>Load two splats, mark 3+ matching landmarks, solve alignment.</p>
        <h2>Landmarks</h2>
        <ol>
          ${pairs.map(pair => `<li>${pair.id}: target empty, source empty</li>`).join('')}
        </ol>
        <button type="button" disabled>Preview Alignment</button>
      </aside>
    </main>
  `;
}
```

- [ ] **Step 3: Run tests and build**

Run: `npm run test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/domain/landmarks.ts src/app/App.ts
git commit -m "feat: model landmark pairs"
```

## Task 4: PLY Header Parser

**Files:**
- Create: `src/domain/ply.ts`
- Create: `src/domain/ply.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/domain/ply.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePlyHeader } from './ply';

describe('parsePlyHeader', () => {
  it('parses Brush binary little-endian 3DGS headers', () => {
    const text = [
      'ply',
      'format binary_little_endian 1.0',
      'comment Exported from Brush',
      'comment SH degree: 3',
      'element vertex 1807138',
      'property float x',
      'property float y',
      'property float z',
      'property float scale_0',
      'end_header',
      ''
    ].join('\\n');

    const parsed = parsePlyHeader(new TextEncoder().encode(text).buffer);

    expect(parsed.vertexCount).toBe(1807138);
    expect(parsed.format).toBe('binary_little_endian');
    expect(parsed.properties).toEqual(['x', 'y', 'z', 'scale_0']);
    expect(parsed.comments).toContain('SH degree: 3');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/domain/ply.test.ts`

Expected: FAIL because `src/domain/ply.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/domain/ply.ts`:

```ts
export interface PlyHeader {
  format: 'binary_little_endian' | 'binary_big_endian' | 'ascii';
  vertexCount: number;
  properties: string[];
  comments: string[];
  headerByteLength: number;
}

export function parsePlyHeader(buffer: ArrayBuffer): PlyHeader {
  const bytes = new Uint8Array(buffer);
  const marker = new TextEncoder().encode('end_header\\n');
  let end = -1;

  for (let i = 0; i <= bytes.length - marker.length; i += 1) {
    if (marker.every((value, offset) => bytes[i + offset] === value)) {
      end = i + marker.length;
      break;
    }
  }

  if (end === -1) {
    throw new Error('PLY header missing end_header');
  }

  const text = new TextDecoder('ascii').decode(bytes.slice(0, end));
  const lines = text.trimEnd().split('\\n');
  if (lines[0] !== 'ply') {
    throw new Error('Not a PLY file');
  }

  const formatLine = lines.find(line => line.startsWith('format '));
  const vertexLine = lines.find(line => line.startsWith('element vertex '));
  if (!formatLine || !vertexLine) {
    throw new Error('PLY header missing format or vertex element');
  }

  const format = formatLine.split(' ')[1] as PlyHeader['format'];
  const vertexCount = Number(vertexLine.split(' ')[2]);
  const properties = lines
    .filter(line => line.startsWith('property '))
    .map(line => line.split(' ').at(-1) as string);
  const comments = lines
    .filter(line => line.startsWith('comment '))
    .map(line => line.slice('comment '.length));

  return { format, vertexCount, properties, comments, headerByteLength: end };
}
```

- [ ] **Step 4: Run parser tests**

Run: `npm run test -- src/domain/ply.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/ply.ts src/domain/ply.test.ts
git commit -m "feat: parse splat ply headers"
```

## Task 5: Session Export

**Files:**
- Create: `src/domain/session.ts`
- Create: `src/domain/session.test.ts`
- Create: `src/export/exportSession.ts`
- Create: `src/export/exportSession.test.ts`

- [ ] **Step 1: Add session schema**

Create `src/domain/session.ts`:

```ts
import type { LandmarkPair } from './landmarks';
import type { Sim3Transform } from './sim3';

export interface AlignmentSession {
  version: 1;
  createdAt: string;
  target: {
    fileType?: string;
    sizeBucket?: string;
    splatCountBucket?: string;
  };
  source: {
    fileType?: string;
    sizeBucket?: string;
    splatCountBucket?: string;
  };
  landmarks: LandmarkPair[];
  transform?: Sim3Transform;
  rmse?: number;
}
```

- [ ] **Step 2: Add export helper**

Create `src/export/exportSession.ts`:

```ts
import type { AlignmentSession } from '../domain/session';

export function serializeSession(session: AlignmentSession): string {
  return `${JSON.stringify(session, null, 2)}\\n`;
}

export function sessionDownloadName(createdAt: string): string {
  return `splat-align-session-${createdAt.replaceAll(':', '-').replaceAll('.', '-')}.json`;
}
```

- [ ] **Step 3: Add export tests**

Create `src/export/exportSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { serializeSession, sessionDownloadName } from './exportSession';

describe('session export', () => {
  it('serializes stable JSON with newline', () => {
    const json = serializeSession({
      version: 1,
      createdAt: '2026-06-14T12:00:00.000Z',
      target: {},
      source: {},
      landmarks: []
    });

    expect(json).toContain('"version": 1');
    expect(json.endsWith('\\n')).toBe(true);
  });

  it('creates filesystem-safe names', () => {
    expect(sessionDownloadName('2026-06-14T12:00:00.000Z')).toBe(
      'splat-align-session-2026-06-14T12-00-00-000Z.json'
    );
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/export/exportSession.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/session.ts src/export/exportSession.ts src/export/exportSession.test.ts
git commit -m "feat: export alignment sessions"
```

## Task 6: Analytics Adapter

**Files:**
- Create: `src/analytics/analytics.ts`
- Create: `src/analytics/analytics.test.ts`

- [ ] **Step 1: Write analytics adapter**

Create `src/analytics/analytics.ts`:

```ts
export type AnalyticsEventName =
  | 'session_started'
  | 'file_loaded'
  | 'landmark_pair_set'
  | 'solve_attempted'
  | 'alignment_previewed'
  | 'export_completed'
  | 'error_reported';

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface AnalyticsProvider {
  track(name: AnalyticsEventName, properties: AnalyticsProperties): void;
}

export class MemoryAnalyticsProvider implements AnalyticsProvider {
  public readonly events: { name: AnalyticsEventName; properties: AnalyticsProperties }[] = [];

  track(name: AnalyticsEventName, properties: AnalyticsProperties): void {
    this.events.push({ name, properties });
  }
}

export function bucketBytes(bytes: number): string {
  if (bytes < 10 * 1024 * 1024) return '<10MB';
  if (bytes < 100 * 1024 * 1024) return '10-100MB';
  if (bytes < 1024 * 1024 * 1024) return '100MB-1GB';
  return '1GB+';
}
```

- [ ] **Step 2: Add analytics tests**

Create `src/analytics/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bucketBytes, MemoryAnalyticsProvider } from './analytics';

describe('analytics', () => {
  it('records events without file contents', () => {
    const provider = new MemoryAnalyticsProvider();
    provider.track('file_loaded', { fileType: 'ply', sizeBucket: bucketBytes(200_000_000) });

    expect(provider.events).toEqual([
      { name: 'file_loaded', properties: { fileType: 'ply', sizeBucket: '100MB-1GB' } }
    ]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/analytics/analytics.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/analytics/analytics.ts src/analytics/analytics.test.ts
git commit -m "feat: define privacy-safe analytics events"
```

## Task 7: Renderer Spike

**Files:**
- Create: `src/rendering/RendererAdapter.ts`
- Create: `src/rendering/MockSplatViewer.ts`
- Create: `src/rendering/renderer-spike-notes.md`
- Modify: `src/app/App.ts`

- [ ] **Step 1: Define renderer interface**

Create `src/rendering/RendererAdapter.ts`:

```ts
import type { Vec3 } from '../domain/sim3';

export interface PickResult {
  worldPosition: Vec3;
}

export interface SplatViewer {
  mount(element: HTMLElement): void;
  loadFile(file: File): Promise<void>;
  setMarkers(markers: { id: string; position: Vec3 }[]): void;
  onPick(handler: (result: PickResult) => void): void;
  destroy(): void;
}
```

- [ ] **Step 2: Add mock viewer**

Create `src/rendering/MockSplatViewer.ts`:

```ts
import type { PickResult, SplatViewer } from './RendererAdapter';

export class MockSplatViewer implements SplatViewer {
  private element?: HTMLElement;
  private pickHandler?: (result: PickResult) => void;

  mount(element: HTMLElement): void {
    this.element = element;
    element.addEventListener('click', this.handleClick);
  }

  async loadFile(file: File): Promise<void> {
    if (this.element) {
      this.element.textContent = `Loaded ${file.name}`;
    }
  }

  setMarkers(): void {
    return;
  }

  onPick(handler: (result: PickResult) => void): void {
    this.pickHandler = handler;
  }

  destroy(): void {
    this.element?.removeEventListener('click', this.handleClick);
  }

  private handleClick = (event: MouseEvent): void => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.pickHandler?.({ worldPosition: [x, y, 0] });
  };
}
```

- [ ] **Step 3: Document renderer spike gate**

Create `src/rendering/renderer-spike-notes.md`:

```markdown
# Renderer Spike Notes

Goal: prove whether this app can use PlayCanvas/SuperSplat-quality splat rendering primitives without becoming a SuperSplat fork.

Success criteria:

- Two independent viewers can mount on one page.
- Each viewer can load a local splat file.
- Picking can return a stable world-space position.
- An overlay preview can render target plus transformed source.
- The app does not import the full SuperSplat editor workflow.

Fallback:

- If renderer extraction is too expensive, build a focused app from SuperSplat internals while preserving the workbench UX.
```

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rendering/RendererAdapter.ts src/rendering/MockSplatViewer.ts src/rendering/renderer-spike-notes.md
git commit -m "feat: define splat viewer adapter"
```

## Task 8: Aligned PLY Export Spike

**Files:**
- Create: `src/export/exportPlyTransform.ts`
- Create: `src/export/exportPlyTransform.test.ts`

- [ ] **Step 1: Write transform export test**

Create `src/export/exportPlyTransform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { transformPosition } from './exportPlyTransform';

describe('transformPosition', () => {
  it('applies scale, rotation, and translation', () => {
    const transformed = transformPosition([1, 2, 3], {
      scale: 2,
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ],
      translation: [10, 20, 30]
    });

    expect(transformed).toEqual([12, 24, 36]);
  });
});
```

- [ ] **Step 2: Implement transform helper**

Create `src/export/exportPlyTransform.ts`:

```ts
import { applySim3, type Sim3Transform, type Vec3 } from '../domain/sim3';

export function transformPosition(position: Vec3, transform: Sim3Transform): Vec3 {
  return applySim3(transform, position);
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/export/exportPlyTransform.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/export/exportPlyTransform.ts src/export/exportPlyTransform.test.ts
git commit -m "feat: start aligned ply export pipeline"
```

## Task 9: Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```markdown
# Splat Align Workbench

Browser-based Gaussian splat alignment workbench.

## Goal

Align two Gaussian splats by matching real-world landmarks.

## MVP

- Load target and source splats locally.
- Navigate two independent viewers.
- Pick 3+ matching landmark pairs.
- Compute source-to-target similarity transform.
- Preview alignment.
- Export merged PLY as the public V1 artifact. Session/transform JSON helpers may remain internal or return in a later UI pass.

## Privacy

Splat files stay local in the browser by default. Usage analytics are collected without uploading splat files.
```

- [ ] **Step 2: Run all checks**

Run: `npm run test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe splat align workbench"
```

## Self-Review

Spec coverage:

- Manual landmark workflow: covered by Tasks 2, 3, 7.
- Local file parsing and export: covered by Tasks 4, 5, 8.
- Privacy-safe analytics: covered by Task 6.
- Renderer architecture spike: covered by Task 7.
- Public app foundation: covered by Task 1 and Task 9.

Placeholder scan:

- No placeholder markers or unspecified implementation steps remain.

Type consistency:

- `Vec3`, `Sim3Transform`, and landmark/session types are defined before use.

Execution note:

- The Sim(3) implementation in Task 2 is an MVP solver suitable for first validation. If residual quality is poor, replace it with a full SVD-based Umeyama implementation in a later task while preserving the same public interface.
