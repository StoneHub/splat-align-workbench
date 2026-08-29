# Large PLY export and spherical-harmonic fidelity

Status: measured design for issue #7. The current full-buffer exporter remains the production path and is not certified for medium or large fixtures. Chunked export and SH rotation are follow-up implementation work, not claims about current behavior.

## Local fixture inventory

The audit read only each PLY header and file size. It did not merge the six files above 470 MiB.

| Local fixture | Size | Vertices | Vertex stride |
|---|---:|---:|---:|
| `Bucky's Tree.ply` | 65.030 MiB | 274,950 | 248 bytes |
| `Cedar mtn Spring_15000_clean.ply` | 419.019 MiB | 1,861,745 | 236 bytes |
| `SR-22.ply` | 469.933 MiB | 2,087,964 | 236 bytes |
| `SR-22 immersive.ply` | 679.080 MiB | 3,017,226 | 236 bytes |
| `Belle View Falls lookout.ply` | 1,057.111 MiB | 4,696,864 | 236 bytes |
| `Belle View bridge.ply` | 1,087.313 MiB | 4,831,054 | 236 bytes |
| `Lake Summit Dam.ply` | 1,125.337 MiB | 5,000,000 | 236 bytes |
| `Bennets Bald.ply` | 1,698.538 MiB | 7,546,800 | 236 bytes |

All eight files are binary little-endian, vertex-only PLYs with three DC fields and 45 `f_rest_*` fields. That is the standard degree-3 3DGS coefficient count. Property order varies:

- Six fixtures declare `f_rest_*` in lexicographic name order.
- Cedar declares fields in numeric order after position, scale, opacity, rotation, and DC fields.
- Bucky uses numeric order and also includes `nx`, `ny`, and `nz`.
- Only Lake Summit Dam declares `comment SH degree: 3`.

The current exporter compares declaration order, so semantically compatible Cedar and SR-22 schemas cannot merge. The replacement must map properties by name and write rows in the Target splat's order.

## Current allocation bound

Let `T` and `S` be the full Target and Source file sizes. The current path retains both inputs, clones the Source for transformation, and allocates the complete merged output.

```text
Peak before Blob construction ~= 2T + 3S
Conservative peak with Blob   ~= 3T + 4S
```

Predicted same-file costs:

| Pair | Output | Before Blob | Conservative Blob peak |
|---|---:|---:|---:|
| Bucky + Bucky | 130.059 MiB | 325.150 MiB | 455.209 MiB |
| Cedar + Cedar | 838.037 MiB | 2,095.094 MiB | 2,933.131 MiB |
| SR-22 + SR-22 | 939.866 MiB | 2,349.666 MiB | 3,289.532 MiB |

Those estimates exclude renderer copies, diagnostic tint buffers, PlayCanvas and GPU allocations, and sampled point arrays. The medium fixtures must not run through the current browser exporter.

## Fail-closed budget

The replacement exporter must use:

```text
row-aligned chunk size:             8 MiB
normal incremental allocation:    24 MiB
hard incremental allocation cap:  64 MiB
queued writes:                          1
Blob output cap:                  256 MiB
```

Outputs above 256 MiB require a streaming local file sink. If the browser cannot provide one, Merged PLY export fails closed while Alignment session JSON remains available. There is no server-upload fallback.

## Chosen module interfaces

```ts
interface PlyByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
}

interface LocalOutputSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}
```

`File.slice()` is the browser source adapter. `FileSystemWritableFileStream` is the large-output adapter where supported. A Blob adapter is allowed only below the 256 MiB prediction gate. Tests use in-memory adapters.

The exporter will:

1. Read headers in bounded slices, failing if a header exceeds 1 MiB.
2. Validate both schemas before opening or truncating output.
3. Write the merged Target header.
4. Copy Target rows unchanged in row-aligned chunks.
5. Transform Source rows in row-aligned 8 MiB chunks inside a Web Worker.
6. Transfer chunk ownership rather than clone buffers.
7. Await every sink write and keep one write in flight.
8. Close on success or abort the partial file on error or cancellation.

Supported schemas require binary little-endian, vertex-only scalar float32 rows; complete `x/y/z`; complete scale, quaternion, normal, and DC groups when present; and complete `f_rest_*` sets for SH degrees 0 through 3. Unknown scalar float fields are preserved by name. Gaps, duplicate suffixes, conflicting SH comments, or a non-positive Sim(3) scale fail before output begins.

## SH rotation contract

The exporter resolves `f_rest_i` by numeric suffix, never declaration position. For degree `L`, each color channel has `(L + 1)^2 - 1` non-DC coefficients. Degree-3 layout is:

```text
f_rest_0..14   red
f_rest_15..29  green
f_rest_30..44  blue
```

Translation and scale do not change SH coefficients. For Target-space direction `d` and alignment rotation `R`:

```text
rotatedSH(d) = sourceSH(R^T d)
```

Build real-SH rotation matrices once per export for degrees 1, 2, and 3. Apply each degree independently to each RGB channel. DC remains unchanged. Complete normals rotate by `R`.

The test suite generates these small deterministic binary fixtures; no rows from Monroe's large PLY files belong in the repository:

| Fixture | Schema and truth |
|---|---|
| `degree-0-numeric.ply` | Numeric property order, DC only, identity transform |
| `degree-1-lexicographic.ply` | Brush-style lexicographic property order, one active coefficient per RGB channel, 90-degree Y rotation |
| `degree-2-numeric.ply` | Numeric property order, deterministic mixed coefficients, 90-degree X rotation |
| `degree-3-lexicographic.ply` | Lexicographic property order, deterministic mixed coefficients, 90-degree Z rotation |
| `degree-3-normals.ply` | Bucky-style numeric order with nonzero and zero normals, arbitrary normalized-axis rotation |
| Future `chunk-boundary.ply` | Rows positioned so 4, 8, and 16 MiB reads split between vertices once the chunk reader exists |

`src/export/testFixtures/plyFidelityFixtures.ts` now materializes degree 0 through 3, numeric and lexicographic property orders, deterministic coefficients, and Bucky-style normals. Its tests pin exact byte lengths, schema order, SH counts, and truth values. When SH rotation is implemented, analytic tests will compare `rotatedSH(d)` with `sourceSH(R^T d)` over a fixed sphere-direction set. They must preserve DC exactly and per-degree energy within float tolerance, survive rotation followed by its inverse, preserve results across property orders, and transform the first, middle, and last Source rows identically.

## Benchmark gate

The dev-only route at `/benchmarks/export.html` runs the real current exporter without constructing PlayCanvas. It records browser version, browser heap limit when exposed, input and output bytes, merge time, Blob time, throughput, and heap snapshots.

### Current full-buffer baseline

Run on 2026-08-29 in isolated Headless Chrome 151 using Bucky as both Target and Source:

| Fact | Measurement |
|---|---:|
| Browser-reported device memory | 32 GiB |
| Browser JS heap limit | 4,395,630,592 bytes (4.094 GiB) |
| Input per side | 68,189,131 bytes (65.030 MiB) |
| Merged output and Blob | 136,376,795 bytes (130.059 MiB) |
| Read plus merge | 157 ms |
| Merge only | 91 ms |
| Blob construction | 12 ms |
| Merge throughput | 1,422.97 MiB/s |
| Used JS heap before merge | 162,007,268 bytes (154.502 MiB) |
| Used JS heap after Blob | 371,996,153 bytes (354.763 MiB) |
| Sampled used-heap increase | 209,988,885 bytes (200.261 MiB) |

The heap snapshots bracket the operation; they are not a sampled peak. Even this 65 MiB self-pair adds roughly 200 MiB of reported used heap. That is enough to reject medium-fixture runs on the current path. The 4.094 GiB browser heap limit is not a safe export budget because the running renderer and other application state share it.

Run only this sequence:

1. Bucky self-pair on the current exporter. Completed above.
2. Implement the chunked exporter and run Bucky at 4, 8, and 16 MiB.
3. Select the fastest chunk size that stays below the 64 MiB cap.
4. Run Cedar self-pair once, then SR-22 self-pair once.
5. Run Cedar Target plus SR-22 Source once to prove property-name remapping.
6. Stop. The six larger fixtures need a separate approval gate.

Issue #7 remains open. This commit establishes the local fixture inventory, current-path baseline, fail-closed budget, module design, and generated fidelity inputs. It does not implement SH rotation or contain a medium-file chunked run. Steps 2-5 are the remaining implementation and evidence gates; step 6 remains a separate Monroe approval gate.
