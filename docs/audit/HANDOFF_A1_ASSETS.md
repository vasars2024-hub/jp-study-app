# HANDOFF A1 — Data & asset provenance, pdfRasterize, packaging posture

**Run:** 2026-08-04 · cold agent · dispatch `docs/audit/DISPATCH_A1_ASSETS.md`
**Base commit:** `d75d86e` · **Branch:** `audit/a-evidence` (pre-existing; not cut by this run)

## Scope and ownership

```
Owned:    docs/audit/HANDOFF_A1_ASSETS.md, docs/audit/NOTICES_DRAFT_ASSETS.md
Foreign:  docs/audit/HANDOFF_A2_LICENSE.md, docs/audit/GITIGNORE_DRAFT.md,
          docs/audit/DOCS_DISPOSITION.md  (concurrent agent, same worktree)
          everything else in the repo — read-only to this run
```

**Deviation from `jp-dispatch` §2, as the dispatch directs:** no branch cut, no `git add`, no
commit. Two files written, nothing else touched. The orchestrator commits. Every other rule in
the skill was followed — no `git stash`, no `git add -A`, no foreign files modified. The app was
never started.

---

## 1. A1 — the two unlabelled data files

### Verdict summary

| File | Size | Verdict | Confidence |
|---|---:|---|---|
| `src/renderer/data/mirrorTexts/index.ts` | 100,416 B (1,117 lines) | **OURS — authored in-repo. Do not strip.** | High |
| `src/renderer/data/gradedSentences/index.ts` | 57,553 B (715 lines) | **OURS — authored in-repo. Do not strip.** | High |

Research spend: ~35 min across both files, well inside the 90-min-per-file timebox. The
evidence converged early and consistently; I stopped rather than padding.

### 1.1 The one piece of evidence that does *not* work: git history

**Claim** (dispatch §2): "Check git history for the commits that introduced and grew them."
**Measured:**

```
$ git log --follow --format='%h|%ad|%s' --date=short -- src/renderer/data/mirrorTexts/index.ts
54fd5d9|2026-07-21|chore(repo): establish canonical shared development base
(identical single result for gradedSentences/index.ts)

$ git show --stat 54fd5d9 | tail -1
 1439 files changed, 165496 insertions(+), 15414 deletions(-)
```

**Verdict: UNVERIFIABLE by this route.** Both files enter the repo in one 1,439-file
flattening commit. There is no incremental growth history, so git cannot corroborate or refute
the "7 → 99 authored by a session" claim. Anyone quoting git history as provenance evidence for
these files is quoting an artefact of the flattening. The verdict below rests on the other three
lines of evidence, not this one.

### 1.2 Corpus-origin test — negative, and the negative is meaningful

The strongest strip-triggering hypothesis was "lifted from a corpus and relabelled". Tested
against the only corpus in the tree, `src/renderer/data/grammar/tatoebaExamples.ts` (1,734
unique Japanese sentences).

**Exact match:** 294 unique mirror sentences × 1,734 Tatoeba sentences → **0 overlaps**.
35 graded sentences → **0 overlaps**.

Exact matching alone would miss a paraphrased lift, so I also ran character-bigram Jaccard
similarity of every candidate against every Tatoeba sentence
(`scratchpad/fuzzy.mjs`, punctuation-normalised):

| Set | n | Max similarity | ≥ 0.60 | ≥ 0.80 |
|---|---:|---:|---:|---:|
| mirror sentences | 294 | 0.700 | 1 | 0 |
| graded `jp` | 35 | 0.286 | 0 | 0 |

The single 0.700 hit is `誘ってくれてありがとうございます。` against
`宿題を手伝ってくれてありがとうございます。` — the shared mass is the fixed
`〜てくれてありがとうございます` politeness frame, not shared content. Graded sentences top out
at 0.286, which is noise.

**Honest limit on this result:** the comparison set is the Tatoeba subset shipped in this repo —
706 grammar-pattern keys, 1,885 example records, **1,734 distinct Japanese sentences** — not the
full Tatoeba corpus (millions of sentences), and not any JLPT textbook.
This test can rule out "lifted from the corpus already in the tree". It cannot rule out "lifted
from a corpus not present here". That residual is addressed by §1.3 and §1.4, not by this test.

**Cross-file overlap:** 7 sentences appear in *both* mirrorTexts and gradedSentences (e.g.
`今日はとても暑いです。`, `説明書を読んでも、使い方が分かりませんでした。`). Two independently
lifted corpora would not share sentences; one author reusing their own material would. This
points toward common authorship.

### 1.3 The texts read as authored-for-purpose, and the structure is not corpus-derivable

`MIRROR_TEXTS` entries carry an `ideaMap` — an ordered list of prose instructions in **English,
Russian and Chinese** ("Argue that a translation is never merely a replacement of words") paired
1:1 with sentences of a Japanese `reference`. No corpus supplies that; it is a purpose-built
exercise artefact. Level 7 is argumentative essay register on distinctive topics — the limits of
translation, memory and recording, urban community — each matched to exactly its three ideas
(`mirrorTexts/index.ts:998-1017`).

The file also documents its own authoring rules (`index.ts:17-24`) and carries an in-file
provenance breadcrumb the pre-cost sweep missed:

```
index.ts:258-261
  // Second authoring batch. Grouped by level like the block above; the
  // picker ignores array order, so these are appended rather than
  // interleaved to keep the diff reviewable.
```

`GRADED_SENTENCES` entries are stock beginner sentences (`これは猫です。`, `私の名前は田中です。`)
with a hand-tokenised `tokens` array and three translations. Sentences at that level are below
the threshold of originality in any case — there is no copyright to infringe in "This is a cat"
— so the level-1/2 material is not a licensing risk regardless of who first wrote it. The
copyrightable expression in this data set is the level-6/7 essay material, and that is exactly
the material that reads as freshly authored.

### 1.4 `TASKS.md`'s numeric claims re-derived — 7 of 8 exact

The dispatch warns that doc claims here have a track record of not surviving contact with
source. I re-derived all eight.

| `TASKS.md` claim | Measured | Verdict |
|---|---:|---|
| `GRADED_SENTENCES 7→35` (L64) | 35 | **CONFIRMED** |
| `VOCAB_PROMPTS 7→35` | 35 | **CONFIRMED** |
| `CLOZE_PROMPTS 7→31` | 31 | **CONFIRMED** |
| `KANA_PROMPTS 8→59` | 59 | **CONFIRMED** |
| `KANJI_READING_PROMPTS 6→35` | 35 | **CONFIRMED** |
| `PARTICLE_PROMPTS 5→20` | 20 | **CONFIRMED** |
| `COUNTER_PROMPTS 5→19` | 19 | **CONFIRMED** |
| `Mirror texts finished: 7 → 99 (14 per level)` (L68) | **98** (14 × 7 levels) | **CORRECTED** |

Measured by `scratchpad/count.mjs` (array-boundary aware) and
`grep -c "^    id: 'mirror-"` → 98, with `level:` distribution 14/14/14/14/14/14/14.

This is the opposite of the expected pattern: the document's account of this data is accurate.
The one error is an off-by-one in a headline (99 vs 98); "14 per level" in the same sentence is
correct and 14 × 7 = 98. Note also that `TASKS.md:67` still says "there are 21", written before
the second authoring batch — the two lines contradict each other, and the *later* one is the
(near-)correct one.

### 1.5 The hygiene tests exist, run, and pass — and can fail

Both named test files exist and are inside the vitest globs:

```
$ npx vitest run src/shared/__tests__/mirrorTextsData.test.ts \
                src/shared/__tests__/gradedSentencesData.test.ts
Test Files  2 passed (2)
     Tests  33 passed (33)
```

Per `jp-dispatch` §9.5 — *is the fixture capable of showing the thing being tested?* Yes.
`mirrorTextsData.test.ts:23-30` asserts the idea map contains no CJK in `en`/`ru` and no kana in
`zh`; `:47-54` asserts each reference's sentence count falls in `[ideaMap.length,
ideaMap.length+2]`; `gradedSentencesData.test.ts` asserts `tokens.join('') === jp`, four
distinct choices containing the answer, kana-only readings, and per-level pool floors. These are
content assertions over the actual data — a corpus dump of unrelated sentences would fail
several of them immediately. The 33 passes carry information.

### 1.6 Degradation path if stripped

**`gradedSentences` is NOT optional — the dispatch's premise here does not hold.**

The dispatch asks whether `contentSource.ts` (player's own deck material winning over bundled
tables) makes `gradedSentences` genuinely optional. **It does not.** `contentSource.ts:1-18`
does describe exactly that design, and `engine.ts:363` implements it ("The player's own material
always wins; the bundled tables below are the fallback"). But the own-material path only covers
**some** games. Traced through `buildGameRound` (`engine.ts:345-612`):

| Game | Own-content path? | Bundled fallback |
|---|---|---|
| `cloze-blitz`, `listening-flash` | yes (`content.cloze`, :365) | `CLOZE_PROMPTS` |
| `kanji-reading` | yes (`content.vocab`, :386) | `KANJI_READING_PROMPTS` |
| `reverse-recall` | yes (:406) | falls through to `sentenceFor()` :597 |
| `word-match` | yes, needs ≥ 4 cards (:421) | `VOCAB_PROMPTS` |
| **`sentence-builder`** | **none** | **`GRADED_SENTENCES` — always** (:440) |
| **`speed-type`** | **none** | **`GRADED_SENTENCES` — always** (:457) |
| **`kana-sprint`** | **none** (`content.kana` selects *scope over* `KANA_PROMPTS`, :340-343) | **`KANA_PROMPTS` — always** |
| **`particle-panic`** | **none** | **`PARTICLE_PROMPTS` — always** |
| **`counter-quiz`** | **none** | **`COUNTER_PROMPTS` — always** |

Five of the ten language games read the bundled table unconditionally, no matter how large the
player's deck is.

**And it would crash, not degrade honestly.** `pickByLevel` (`engine.ts:197-201`) ends with
`pool[Math.abs(seed) % pool.length]`. On an empty array that is `pool[NaN]` → `undefined`,
returned as `T` with no guard. The first consumer dereferences it —
`sentenceFor` at `:205` does `direct.translations[sourceLang]` → `TypeError`. Deleting the file
outright is worse still: it is a static `import` at `engine.ts:15`, so the build fails.

**`mirrorTexts` degradation is the same shape.** `GameArenaContent.tsx:948` is
`MIRROR_TEXTS.find(t => t.level === level) ?? MIRROR_TEXTS[0]` — on an empty array both sides
are `undefined`, so the `??` does not save it and the caller dereferences `undefined`.

**Cost to make either strippable:** a guard in `pickByLevel` plus an empty-pool branch in every
consumer, and a user-visible "no content for this game" state — roughly a day, and it degrades
the product. **Recommendation: do not strip. There is no licensing reason to.**

---

## 2. A2 — asset licences

Full draft with the exact required attribution text: **`docs/audit/NOTICES_DRAFT_ASSETS.md`**.
Summary here; that document carries the evidence per row.

### 2.1 The gap, confirmed and measured

```
$ find public vendor -iname "LICENSE*" -o -iname "NOTICE*" -o -iname "COPYING*" -o -iname "COPYRIGHT*"
(no output — zero files)

$ du -sm out/jp-study-app-win32-x64/resources/public
1389
$ find out/jp-study-app-win32-x64/resources/public -iname "*licen*" -o -iname "*notice*"
(no output)
```

**CONFIRMED.** 1,389 MB of third-party assets ship in the packaged artifact with no licence or
notice file. The only attribution the app surfaces is
`src/shared/i18n/catalogs/en.ts:2407` (Tatoeba), rendered at
`src/renderer/components/grammar/GrammarContent.tsx:151` — **CONFIRMED** as the sole hit.

### 2.2 Licence per family

| Family | Size | Licence | Status | How established |
|---|---:|---|---|---|
| `models` — Helsinki-NLP **ja-en** | 418 MB | Apache-2.0 | **ESTABLISHED** | HF API `cardData.license` |
| `models` — Helsinki-NLP **en-ru** | 427 MB | Apache-2.0 | **ESTABLISHED** | HF API `cardData.license` |
| `models` — Helsinki-NLP **zh-en** | 435 MB | **CC-BY-4.0** | **ESTABLISHED** | HF API + model card + `raw/main/README.md` frontmatter (three routes) |
| `models` — **Xenova conversion layer** | (same bytes) | *none declared* | **NOT ESTABLISHED** | All three Xenova repos have no `license` field anywhere |
| `ort` | 74 MB | MIT | **ESTABLISHED** | Byte-identical to `onnxruntime-web@1.26.0-dev.20260416-b7804b056c` |
| `kuromoji` | 18 MB | Apache-2.0 + IPADIC | **ESTABLISHED** | 12/12 files decompress byte-identical to `kuromoji@0.1.2` dict |
| `tesseract` — engine | 7 MB | Apache-2.0 | **ESTABLISHED** | Byte-identical to `tesseract.js@7.0.0` / `-core@7.0.0` |
| `tesseract` — `*.traineddata.gz` | 4 MB | Apache-2.0 *expected* | **NOT ESTABLISHED** | Matches no upstream revision checked |
| `cedict` | 10 MB | **CC BY-SA 4.0** | **ESTABLISHED** | Read from the shipped file's own header |
| `worldMapPaths.ts` | 1.2 MB | CC-BY-4.0 | **ESTABLISHED** | npm registry metadata for `@svg-maps/world@2.0.0` |
| `sounds` | 0 MB | — | n/a | Contains one README; "No audio is bundled yet" |

### 2.3 Corrections to the pre-cost document

The dispatch instructs that the pre-cost's licence names are *expectations*, not fact. Three did
not survive:

1. **"OPUS-MT is published CC-BY-4.0"** (pre-cost §2 table) — **CORRECTED**. The three models
   carry **two different licences**: `ja-en` and `en-ru` are Apache-2.0, only `zh-en` is
   CC-BY-4.0. This matters: CC BY 4.0 §3(a) imposes a strict attribution form (title, author,
   source URI, licence URI, indication of modification) that Apache-2.0 does not, so the notice
   text is not uniform across the three.
2. **"Two licences stack per model … `_name_or_path` makes that a lookup rather than an
   investigation"** — **PARTLY CORRECTED**. The upstream half was indeed a lookup. The Xenova
   half is not resolvable at all: no licence is declared, so there is nothing to look up. The
   pre-cost's framing implies both halves resolve; only one does.
3. **"The gate can report exit 0 while ~94% of the packaged payload sits outside what it
   audits"** — **CORRECTED**. The direction is right; the number is not. Measured:

   | Component | MB | Covered by `license-audit-gate.mjs`? |
   |---|---:|---|
   | `resources/app/node_modules` | 1,966 | yes (623 packages) |
   | `resources/public` | 1,389 | **no** |
   | `resources/app/.vite` | 194 | app's own code |
   | `resources/seanime` | 81 | **no** (A2's row) |
   | Electron/Chromium binaries (top level) | ~264 | Electron's own LICENSE ships |
   | **total artifact** | **3,978** | |

   `public/` is **34.9%** of the artifact, not ~94%. The gate does run green over the largest
   single component. The finding survives — a third of the shipped bytes is unaudited — but it
   should be quoted at its measured size.

   Gate re-run this session: `node docs/migration/tools/license-audit-gate.mjs` →
   `PASS — nothing in the shipped tree changes the licensing posture`, exit 0. 623 shipped
   packages, 600 permissive, 15 weak copyleft, 2 strong copyleft (`ffmpeg-static`,
   `rvfc-polyfill`), 2 unknown (`fast-shallow-equal`, `react-universal-interface`), 0 AGPL.

### 2.4 Licence names I could **not** confirm from a primary source

Listed plainly, as the dispatch requires:

1. **The Xenova ONNX conversion layer** (all three models, 1,278 MB). No licence declared on
   any of the three repositories. An undeclared licence on a derived work does not automatically
   inherit the upstream's. Either it is a mechanical conversion with no new copyrightable
   expression (so only the upstream terms apply) or rights are held and not granted — that is a
   legal call. **Zero-risk alternative: convert from `Helsinki-NLP/*` directly.**
2. **The bundled `jpn.traineddata.gz` / `jpn_vert.traineddata.gz`.** Apache-2.0 is very likely
   (every `tesseract-ocr/tessdata*` repo is Apache-2.0), but the bundled bytes match no revision
   I checked — `tessdata` @main/@4.0.0/@4.00, `tessdata_fast` @main, `tessdata_best` @main, or
   either tesseract.js CDN folder. Sizes are tabulated in the notices draft §1.4. Note the app's
   own registry (`assetRegistry.ts:397`) points at `tessdata_fast` at 2,471,260 bytes, which is
   *not* what is bundled. **Cheap fix: re-download from a named revision, record the SHA-256.**

Everything else in §2.2 was read from a primary source tied to the bytes actually shipped.

### 2.5 Where the notice should surface in-app

Precedent is `grammar.examples.tatoebaCredit` — an i18n key rendered inline next to the content
it covers. Follow it. **There is no About surface to hang notices on:**
`settingsRegistry.ts` has 30+ sections and no `about` entry (verified by enumerating every
`id:`). One must be added. Full recommendation in the notices draft §3; the short form is a new
`about` settings section carrying the full texts, plus inline credits on `WorldHeatMap.tsx` and
the Chinese `DictionaryResults.tsx`, plus a `THIRD_PARTY_NOTICES.txt` in the artifact root next
to Electron's `LICENSE`.

---

## 3. A4 — `pdfRasterize` call map

**Claim:** `src/main/pdfRasterize.ts:79-82` runs a `BrowserWindow` with `contextIsolation:
false`, `nodeIntegration: true`, `webSecurity: false`. **CONFIRMED**, verbatim at those lines.

Per the dispatch: **this section is a map, not a reachability proof.** No claim is made here
about what does or does not reach the parser. One future call site would invalidate any such
claim, and a refusal has no positive observable.

### 3.1 What it loads

The hidden window loads **`data:text/html,…<body></body>`** (`:108`) — an empty inline
document, no app HTML, no remote content. Behaviour is then injected as a source **string**
built by `rasterScript()` (`:134-179`) and run via `webContents.executeJavaScript`, which
evaluates in the page's **main world** — the world Node privileges live in.

Inside that script: `require('electron')`, `require('node:fs')`, a dynamic `import()` of an
absolute `file://` URL for `pdfjs-dist/build/pdf.mjs`, `fs.readFileSync(pdfPath)`, then per-page
`page.render()` to a canvas and `ipcRenderer.send` of a JPEG data URL back to main.

**Mitigation already present:** `getDocument({ data, isEvalSupported: false })` at `:147`.

### 3.2 Who calls it, and what the input can be

Exactly one call site in the tree:

```
$ rg -n "rasterizePdf|pdfRasterize" src
src/main/pdfRasterize.ts:63   export async function rasterizePdf(
src/main/bookOcrJob.ts:17     import { rasterizePdf } from './pdfRasterize';
src/main/bookOcrJob.ts:88       await rasterizePdf(pdf, path.join(itemDir(itemId), 'pages'), …)
```

Reached only through `runBookOcr` (`bookOcrJob.ts:62`), exposed as
`ipcMain.handle('bookOcr:run', …)` (`:177`) → `preload.ts:245` → the renderer's
"Convert"/"Reconvert" button in `BookOcrPanel.tsx:124`. **Not automatic:** rasterization runs
only on that explicit user action, and only when the item has no page images yet
(`bookOcrJob.ts:83-86`).

**Path input — constrained.** `runBookOcr` requires `getLibraryItem(itemId)` to resolve
(`:67`), the PDF path is the fixed `itemDir(itemId)/original.pdf` (`:86`), and every import
route assigns `id = crypto.randomUUID()` (`library.ts:406`). So the renderer cannot steer the
*path*. (`itemDir` itself does not sanitise its argument — `path.join(libraryRoot(), id)`,
`library.ts:117-119` — but reaching it requires an id already present in the library DB.)

**Content input — user-supplied, by three routes.** The bytes of `original.pdf` are whatever
was imported:

| Route | Handler | Gate |
|---|---|---|
| File dialog | `library:importFiles` (`library.ts:1217`) | human picks in an OS dialog |
| Drag-and-drop | `library:importPaths` (`library.ts:1679`) | renderer supplies arbitrary local paths, **no dialog** |
| **Watch folder** | `syncWatchFolder()` (`library.ts:633`) | **no user action at all** — anything importable that appears in the configured folder is imported |

`rasterScript` interpolates `pdfPath` and `channel` through `JSON.stringify` (`:144-146`,
`:162`), which is correct escaping for a JS string literal on any ES2019+ engine. The exposure
is not string injection; it is that **arbitrary PDF bytes are parsed by pdf.js inside a window
holding full Node privileges**, so a parser-level bug there is RCE rather than a crash.

### 3.3 What breaks if the three flags flip — the map that makes the change safe to attempt

All three failures are in the *injected script*, not in pdf.js:

| Flag | What breaks | Why |
|---|---|---|
| `nodeIntegration: true → false` | `require('electron')` and `require('node:fs')` (`:141-142`) | no Node in the page |
| `contextIsolation: false → true` | same two `require`s | `executeJavaScript` runs in the main world, which under isolation has no Node bindings |
| `webSecurity: false → true` | `await import('file://…/pdf.mjs')` (`:144`) | a `data:` URL page is an **opaque origin**; importing a `file://` module from it is a cross-origin fetch |

Note the comment at `:81` ("Needed so the hidden page can read the PDF off disk") does not match
the code: the PDF is read with `fs.readFileSync`, not `fetch`. What `webSecurity: false`
actually buys is the `data:` → `file://` dynamic import. That matters because it changes the
fix.

**Fix shape that lets all three flags go on** (~half a day, unverified — this run did not
attempt it, per the dispatch):

1. Load the window from a real file (`win.loadFile(...)`) or a registered custom protocol
   instead of a `data:` URL, giving the page a real origin that can import the pdf.js module —
   or bundle pdf.js into that page so no cross-origin import happens.
2. Add a narrow preload exposing one `contextBridge` method (`sendPage(dataUrl, index,
   total)`), replacing `require('electron').ipcRenderer`.
3. Read the PDF in **main** and pass the `Uint8Array` in, replacing `require('node:fs')`.

That removes every Node dependency from the page, at which point flipping the flags is
mechanical and testable by running one rasterization end to end.

---

## 4. A5 — packaging posture

### 4.1 The artifact is current, not stale — checked before anything else was believed

```
$ find src forge.config.ts vite.*.config.ts package.json -type f -newermt "2026-08-03 20:05" | wc -l
0
```

`out/jp-study-app-win32-x64/jp-study-app.exe` and the whole
`resources/app/.vite/` tree are dated **2026-08-03 20:05**, and **no source file is newer**.
The `EPERM`-on-`dxcompiler.dll` staleness trap the dispatch warns about did not fire here. No
package build was run by this session.

> One refinement on the dispatch's instruction: the `.exe` is the Electron host binary and does
> not contain app code, so its mtime is a weak staleness signal. I compared against the built
> bundle in `resources/app/.vite/` as well — same timestamp, same conclusion.

Three older sibling builds are also present (`*.pre-blanc`, `*.pre-sidecar`,
`*.pre-storage-fix`, dated Jul 28 – Aug 1). They are stale by construction; measurements above
are from `out/jp-study-app-win32-x64` only.

### 4.2 `debugBridge` — stronger than the claim

**Claim:** the `app.isPackaged` hard-stop at `debugBridge.ts:380` holds in the packaged artifact.
**Measured: it never gets the chance — the entire module is absent from the packaged bundle.**

```
$ grep -rl "39273\|clear-logs\|debug bridge up on\|startDebugBridge" \
    out/…/resources/app/.vite/build out/…/resources/app/.vite/renderer
(no debugBridge hit in any main-process bundle)
```

Because this is negative evidence, I ran a control on the same instrument first:

```
CONTROL (strings known to be present):
  'bookOcr:run'          → build/main-hhgBjncV.js, build/preload.js
  'library:importPaths'  → build/main-hhgBjncV.js, build/preload.js
  'pdf-raster-'          → build/main-hhgBjncV.js
  'isPackaged'           → build/main-hhgBjncV.js
TARGET:
  '39273'                → renderer/…/index-S_c3yhAR.js ONLY
  'clear-logs'           → ABSENT
  'debug bridge up on'   → ABSENT
  'startDebugBridge'     → ABSENT
```

The lone `39273` hit is a coincidental digit run inside a float literal in a shader
(`…-0.039273985, -0.096617654…`), not the port constant.

Cause: `main.ts:1419` calls `startDebugBridge()` only under `isDevServer()`, which is
`typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && !!…` (`main.ts:472-474`) — statically
false in a production build, so Vite tree-shakes the import away. **Verdict: CONFIRMED and then
some.** The runtime guard at `debugBridge.ts:380` is a second line of defence behind a bundle
that does not contain the bridge at all.

### 4.3 Fuses — as designed, a trade-off not a defect

`forge.config.ts:183-193`:

| Fuse | Value |
|---|---|
| `RunAsNode` | `false` |
| `EnableCookieEncryption` | `true` |
| `EnableNodeOptionsEnvironmentVariable` | `false` |
| `EnableNodeCliInspectArguments` | `false` |
| `EnableEmbeddedAsarIntegrityValidation` | **`false`** |
| `OnlyLoadAppFromAsar` | **`false`** |

The four that harden the process are on. The two that are off are **asar-only protections, and
this build ships no asar** — `asar: false` at `:129`, with the reason recorded at `:125-128`
(packing ~945 MB of models chokes the packager). Confirmed against the artifact: no `.asar`
file, `resources/app/` is a loose directory tree.

**For the release notes, stated plainly:** the app ships unpacked, so its own code is readable
and modifiable on disk by anything already running as the user, and Electron's asar integrity
checks cannot apply. This is the price of bundling ~1.4 GB of models in the artifact. It is a
deliberate trade-off, not a defect to fix.

### 4.4 Makers — no installer, no signing

**Claim:** "`MakerZIP` only; `MakerSquirrel` is declared but unused." **CORRECTED.**
`MakerSquirrel` is **not declared at all** — it is neither imported nor instantiated
(`grep -n "Squirrel" forge.config.ts package.json` returns exactly one hit, the explanatory
comment at `forge.config.ts:148`). The makers block (`:147-153`) is `MakerZIP` for
`['win32','darwin']`, `MakerRpm`, `MakerDeb`. The comment records why: Squirrel "routinely
deadlocks at 0% CPU on ~1 GB bundles".

The consequence is what the dispatch says: **no Windows installer and no code signing.** Every
first run shows a SmartScreen "unrecognized app" warning, and users must unzip a ~4 GB archive
manually. Total artifact: **3,978 MB**. Signing needs a certificate the project does not have,
so this is a decision for the user, not a fix.

---

## 5. Gate results — measured totals this run

| Gate | Command | Result |
|---|---|---|
| Tests | `npx vitest run` | **375 files passed, 4,833 tests passed, 0 failed** |
| Licences | `node docs/migration/tools/license-audit-gate.mjs` | **PASS**, exit 0 |

No baseline delta is claimed — this run changed only two new documentation files, which no gate
reads.

### The skill's "known-failing suites" list is stale

`jp-dispatch` §4 names `architectureBaseline.test.ts` and `flashcardSearch.test.ts` as failing
on a clean tree, and explicitly invites checking that against the first run. **Both pass.**

```
$ npx vitest run src/shared/__tests__/architectureBaseline.test.ts \
                 src/renderer/__tests__/flashcardSearch.test.ts --reporter=verbose
✓ 6 × flashcardSearch  ✓ 6 × architectureBaseline
Test Files  2 passed (2) · Tests  12 passed (12)
```

Named, executed, green. The full run reports zero failures, so this is not the two suites being
skipped. **Recommend deleting §4's known-failing list from the skill** — a stale "expect this to
be red" entry is exactly the kind of thing that gets a real regression waved through.

---

## 6. What I did not get to

- **The exact upstream revision of the two `.traineddata.gz` files.** Checked six candidates by
  size; none matched. A byte-level search across tessdata's full git history would settle it and
  was not worth the download inside the timebox. Recorded as NOT ESTABLISHED rather than guessed.
- **Corpus comparison beyond the in-repo Tatoeba subset.** §1.2's negative result is scoped to
  the 1,734 sentences present in this tree. No offline comparison against full Tatoeba, JLPT
  textbook corpora, or any other source was possible.
- **The 21 runtime-downloaded assets** in `assetRegistry.ts` (Whisper, manga-ocr, PaddleOCR,
  JMdict, kanjium, tatoeba-ja). Not bundled, so not a distribution obligation, and out of the
  dispatch's scope — but the registry carries **no licence field at all**, which the next
  licensing pass should pick up. Listed in the notices draft §4.
- **The `vendor/seanime*` trees** — the concurrent agent's row.
- **Whether the flag flip in §3.3 actually works.** Explicitly out of scope per dispatch §4.

---

## 7. Defects noticed in code I do not own — recorded, not fixed

1. **`engine.ts:197-201` — `pickByLevel` has no empty-pool guard.**
   `pool[Math.abs(seed) % pool.length]` on an empty array is `pool[NaN]` → `undefined`, returned
   as `T`. Callers dereference immediately (`:205`). Not reachable today because every pool is
   non-empty and the hygiene tests enforce per-level floors — but it is the reason a strip
   crashes instead of degrading, and the tests are the only thing holding it. One-line fix; not
   mine to make.

2. **`GameArenaContent.tsx:948` — `?? MIRROR_TEXTS[0]` cannot save an empty array.**
   Both sides evaluate to `undefined`. The `??` reads as a safety net and is not one.

3. **`pdfRasterize.ts:81` — the comment does not describe what the flag does.**
   "Needed so the hidden page can read the PDF off disk" — but the read is `fs.readFileSync`
   (`:146`), which `webSecurity` has no bearing on. The flag is actually load-bearing for the
   `data:` → `file://` dynamic import at `:144`. A future reader trying to remove the flag would
   test the wrong thing.

4. **`TASKS.md:67` and `TASKS.md:68` contradict each other** — "there are 21" vs "7 → 99". The
   later line is the current one and is itself off by one (98). Documentation only.

5. **`mirrorTexts/index.ts` — idea ids collide across texts.** `m7t-1` is used by both
   `mirror-l7-technology` (`:240`) and `mirror-l7-translation` (`:1012`). The hygiene test only
   asserts uniqueness *within* a text (`mirrorTextsData.test.ts:14-17`), so this passes. Ids are
   scoped per text at every consumer I read, so it is cosmetic — noted in case a future feature
   assumes global uniqueness.

6. **`assetRegistry.ts` has no licence field on any of its 21 entries.** Not a bug in the code's
   behaviour; a gap in what the data model can record. Flagged for the licensing work.

---

## 8. Open questions for the user — decisions, not defaults

1. **The Xenova conversion layer has no declared licence (1,278 MB, the largest single asset
   family).** Ship as-is on the reading that a format conversion carries no new copyright, or
   re-convert from `Helsinki-NLP/*` to put the whole family under established terms? Legal call.
2. **CC-CEDICT share-alike.** Verbatim redistribution needs only attribution + notice, which the
   draft covers. If any CC-CEDICT-*derived* index is distributed, that derivative must be offered
   under CC BY-SA 4.0, and GPL-3.0 on the code does not discharge it. Confirm no derived index
   ships, or add the covering notice.
3. **`jpn*.traineddata` provenance.** Re-download from a named tessdata revision and record the
   hash (cheap, closes the row), or ship bytes whose origin cannot be named?
4. **Where notices surface.** A new `about` settings section has to be created — there is none
   today. Confirm that placement before it is built.
5. **No installer, no signing.** SmartScreen on every first run plus a manual ~4 GB unzip.
   Accept for this release, or invest in a certificate and an installer that survives a 1 GB
   bundle?
6. **`jp-dispatch` §4's known-failing-suites list should be deleted** — both named suites pass.
   Confirm before the skill is edited; the skill is not mine to touch.
