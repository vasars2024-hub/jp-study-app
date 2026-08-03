# Licensing plan

Governed by **ADR-001** — the combined work becomes GPL-3.0, flipped at the start of Phase 2.
**This is engineering analysis, not legal advice.** If the app is ever distributed publicly,
get a specialist review first.

## Current declaration — UPDATED 2026-08-02

`package.json`: **`"license": "GPL-3.0-or-later"`**, `"private": true`. The ADR-001 flip has
happened. *(This section previously read `"license": "MIT"` and called it inaccurate; that was
true when written and had not been revisited.)*

## Transitive audit — 2026-08-02 (slice 47i), re-runnable

```
node docs/migration/tools/license-audit-gate.mjs          # exit 0 = posture unchanged
```

The 2026-07-27 table below covers **17** declared runtime dependencies. `package.json` now
declares **81**, and the lockfile resolves **623 non-dev packages**. The checklist item
"`npx license-checker --production` over the transitive tree" is now done — by a gate that
reads the *installed* tree rather than a registry, because what ships is what is on disk, and
because installing `license-checker` to answer a question about what is installed is circular.

| Class | Count | Notes |
|---|---:|---|
| permissive | 600 | MIT/ISC/BSD/Apache-2.0 |
| dual, permissive branch available | 4 | `jszip (MIT OR GPL-3.0-or-later)`, `rc`, `type-fest` ×2 — an `OR` is the licensee's choice |
| weak copyleft | 15 | `@img/sharp-libvips-*` (LGPL-3.0) and **`jassub`** |
| **strong copyleft** | **2** | `ffmpeg-static` (GPL-3.0-or-later) and **`rvfc-polyfill` (GPL-3.0)** |
| AGPL | **0** | the one family that would change the answer rather than the paperwork |
| no declared license | 2 | `fast-shallow-equal`, `react-universal-interface` |

**`rvfc-polyfill` was not in any record.** A GPL-3.0 `requestVideoFrameCallback` polyfill in the
shipped tree. It is *fine* for a GPL-3.0-or-later work — the point is that it arrived without a
decision, which is exactly what an unchecked box hides. It is now on the gate's acknowledged
list, so a *third* one appearing fails the gate.

`jassub` (LGPL) is the subtitle renderer this migration adopted; LGPL→GPL-3.0 is permitted.

> A gate correctness note, kept because it nearly became a false finding: the first run
> reported `jszip` as unrecorded strong copyleft. `(MIT OR GPL-3.0-or-later)` is a **choice**,
> and taking MIT is permitted. Only an expression whose every branch is copyleft constrains
> anything.

## Runtime dependency audit — 2026-07-27 (superseded by the table above, kept for its reasoning)

All 17 declared runtime dependencies, read from installed `node_modules/*/package.json`:

| Package | Version | License | GPL-3.0 compatible |
|---|---|---|---|
| `@huggingface/transformers` | 4.2.0 | Apache-2.0 | yes (one-way) |
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | yes (one-way) |
| `@sglkc/kuromoji` | 1.1.0 | Apache-2.0 | yes (one-way) |
| `adm-zip` | 0.5.17 | MIT | yes |
| `electron-squirrel-startup` | 1.0.1 | Apache-2.0 | yes (one-way) |
| `epubjs` | 0.3.93 | BSD-2-Clause | yes |
| `fflate` | 0.8.3 | MIT | yes |
| **`ffmpeg-static`** | 5.3.0 | **GPL-3.0-or-later** | **yes — and only under GPL** |
| `kuromoji` | 0.1.2 | Apache-2.0 | yes (one-way) |
| `linkedom` | 0.18.13 | ISC | yes |
| `node-llama-cpp` | 3.19.0 | MIT | yes |
| `onnxruntime-node` | 1.27.0 | MIT | yes |
| `pdfjs-dist` | 4.10.38 | Apache-2.0 | yes (one-way) |
| `react` | 19.2.6 | MIT | yes |
| `react-dom` | 19.2.6 | MIT | yes |
| `sql.js` | 1.12.0 | MIT | yes |
| `tesseract.js` | 7.0.0 | Apache-2.0 | yes (one-way) |

**Verdict: the dependency tree is fully GPL-3.0 compatible.** Apache-2.0 is one-way compatible
with GPLv3 (Apache→GPLv3 permitted; not the reverse), which is the direction needed here.

**`ffmpeg-static` is the decisive row.** Bundling GPL-3.0 FFmpeg binaries inside an
MIT-declared application is the awkward direction. ADR-001 fixes an existing inconsistency
rather than introducing one.

*Not yet audited:* devDependencies (do not ship, lower priority) and the transitive tree.
Schedule `npx license-checker --production` before the Phase-2 flip.

## Bundled third-party study content — the real exposure

Code is clear; **data is not**. Ordered by risk:

| Asset | Size | Source | Ships in app? | Risk | Action |
|---|---:|---|---|---|---|
| ~~`src/renderer/data/grammar/n{1,2,3,4}-mazii.ts`~~ → `n{1,2,3,4}-supplement.ts` | 671 KB | **RESOLVED 2026-07-28** — corpus de-branded by user decision | yes, compiled in | **Closed** | Done. See note below. |
| ~~`tools/_mazii_n{1,2,3,4}.json`~~ | — | **DELETED** | no | **Closed** | Done — file no longer exists |
| `src/renderer/data/grammar/hsk-import.ts` | 155 KB | unknown | yes | **Unknown** | Identify provenance |
| `src/renderer/data/mirrorTexts/index.ts` | 100 KB | unknown | yes | **Unknown** | Identify provenance |
| `src/renderer/data/gradedSentences/index.ts` | 58 KB | unknown | yes | **Unknown** | Identify provenance |
| `src/renderer/data/grammar/tatoebaExamples.ts` | 545 KB | Tatoeba | yes | Low | **CC BY 2.0 FR — add attribution notice**, then fine |
| `src/renderer/data/novels.ts`, `catalogFallback.ts`, `worldMapPaths.ts` | 1.36 MB | unknown | yes | **Unknown** | Identify provenance |

> **R5 is CLOSED (user decision, 2026-07-28).** The grammar corpus was de-branded, and this
> table is the corrected record — it named files that no longer exist. Verified in the
> working tree:
>
> | Was | Now |
> |---|---|
> | `src/renderer/data/grammar/n{1..4}-mazii.ts` | `n{1..4}-supplement.ts` |
> | exported `N*_MAZII` | exported `N*_SUPPLEMENT` |
> | provenance `mazii-${level}` | `supplement-${level}` |
> | `tools/_mazii_n{1..4}.json`, `tools/import-mazii-grammar.py` | **deleted** |
>
> Remaining identifiers under `src/` and `tools/` are scrubbed. **Do not re-open the
> redistributability question and do not revert the renames.**

**Never publishable, and correctly not in the repo today** (they live in Electron userData):
JMdict / Yomitan dictionaries (JMdict is CC BY-SA — attribution + share-alike), the
550,408-entry JPDB frequency dictionary, imported N1–N5 Anki decks, downloaded Kitsunekko
subtitles, personal mined sentences, media files. Verified absent from `git ls-files`.
**Extend `.gitignore` defensively before going public.**

## Seanime-specific obligations

- ~~**Sidecar (Phases 0–1):** unmodified pinned binary, documented HTTP API. Conventional
  separate-program posture. Point at upstream `9bdd052…` for source.~~
  **NO LONGER TRUE as of 2026-08-02 (slice 46).** The sidecar this app launches — and the one
  `SeanimeSidecarStagingPlugin` stages, because it stages the *resolved* binary — is a
  **modified** build carrying `0002` (dual-subtitle terminal flush) and `0004` (open
  generation). "Unmodified pinned binary" describes the file preserved beside it as
  `seanime.exe.pre-patches-20260727`, not the one in use.

  The rule immediately below therefore applies now rather than hypothetically: **the fork's
  source must be published on distribution.** In practice that source is
  `patches/seanime/*.patch` (4 files) plus the pinned upstream commit `9bdd052…`, which
  together reproduce the binary exactly — `build-patched-sidecar.mjs` does so from a clean
  clone. `license-audit-gate.mjs` fails if the staged sidecar carries patch markers while
  `patches/seanime/` holds no patch files.

  Nothing is distributed today (`private: true`), so no obligation has attached. **A package
  built from here on ships the modified server**, and that is the trigger.
- **UI source adoption (Phase 2+):** preserve upstream copyright headers and `LICENSE`; record
  every adopted file in a provenance manifest with its upstream path and commit; state
  modifications.
- **If the Go server is ever modified:** your fork's source must be published too.
- **Never ship:** the Seanime name or logo (`docs/images/seanime-logo.png`), screenshots hosted
  on `s3.seanime.app`, bundled fonts, or the `mpv-prism` binaries. Trademarks and artwork do
  not inherit the code license. `mpv-prism`'s own license is **unknown**.

## Repository hygiene before publishing

`git fsck` @ 2026-07-27: 226 dangling trees, 180 dangling blobs, 20 dangling commits, no
corruption. Pack is 460.23 MiB on disk but only **159.9 MiB is reachable** — the three largest
blobs (230.7 MB, 76.3 MB, 9.7 MB) are unreachable aborted-commit leftovers, plus 14
`tmp_obj_*` garbage files. A fresh clone would not carry them.
**Do not prune without a separate decision** — a second worktree shares the object store and
the dangling commits include real parked work.

## Checklist before the Phase-2 flip

- [ ] Resolve or remove every **High**/**Unknown** row above
- [ ] Add the Tatoeba CC BY 2.0 FR attribution notice
- [x] ~~`npx license-checker --production` over the transitive tree~~ — **done 2026-08-02** by
      `docs/migration/tools/license-audit-gate.mjs`, which reads the installed tree and is
      re-runnable. 623 shipped packages, 0 AGPL, 2 strong copyleft (both now acknowledged).
- [x] ~~Replace `LICENSE`, set `package.json` `"license": "GPL-3.0"`~~ — **both done.**
      `package.json` declares `GPL-3.0-or-later` and `LICENSE` is the GPLv3 text. The gate
      checks **both**, because they are two separate claims that have disagreed before: the
      manifest said MIT while the tree already bundled GPL FFmpeg.
- [ ] **Publish the sidecar fork's source alongside any distributed package** — see the
      Seanime section above. `patches/seanime/*.patch` + upstream `9bdd052…` is that source.
- [ ] Start the adopted-file provenance manifest
- [ ] Extend `.gitignore` for dictionaries, decks, subtitles, media
- [ ] Decide publish vs stay-private (GPL obligations attach on distribution)
