# Third-party notices — bundled binary assets (DRAFT)

**Status: draft for review, not yet shipped.** Produced by DISPATCH A1 on 2026-08-04 from
branch `audit/a-evidence`. Covers **only** the binary assets under `public/` and the vendored
map data in `src/renderer/data/worldMapPaths.ts`. It does **not** cover the 623 npm packages —
those are the subject of `docs/migration/LICENSING_PLAN.md` and
`docs/migration/tools/license-audit-gate.mjs`, which do not look at `public/` at all.

Every licence name below is marked **ESTABLISHED** (read from a primary source tied to the
bytes actually shipped) or **NOT ESTABLISHED** (could not be resolved). A NOT ESTABLISHED row
is a strip-or-replace decision for the user; it is not an assumption this document makes on
their behalf.

---

## 0. What the packaged artifact contains today

`forge.config.ts:134` ships `public` via `extraResource`, so all of it lands in
`resources/public` in the packaged app. Measured on the current build:

```
$ du -sm out/jp-study-app-win32-x64/resources/public
1389    out/jp-study-app-win32-x64/resources/public

$ find out/jp-study-app-win32-x64/resources/public -iname "*licen*" -o -iname "*notice*"
(no output)
```

**Zero licence or notice files ship with 1,389 MB of third-party assets.** The only licence
files in the artifact are Electron's own (`out/jp-study-app-win32-x64/LICENSE`, "Copyright (c)
Electron contributors", and `LICENSES.chromium.html`).

---

## 1. Draft notice text, in the form it would ship

> ### Third-party components
>
> This application bundles the following third-party components. Their licences are reproduced
> in full in `THIRD_PARTY_NOTICES.txt`, distributed with this application.

### 1.1 Machine translation models — OPUS-MT (Helsinki-NLP), ONNX conversions by Xenova

Bundled at `public/models/Xenova/opus-mt-{ja-en,zh-en,en-ru}` (1,278 MB, 30 files). Each
`config.json` records its upstream in `_name_or_path`; none carries a `license` key.

> **opus-mt-ja-en** — derived from `Helsinki-NLP/opus-mt-ja-en`, © The Helsinki-NLP / OPUS-MT
> project, licensed under the Apache License, Version 2.0. ONNX conversion by Xenova
> (`Xenova/opus-mt-ja-en`). Unmodified apart from conversion to ONNX and quantization.
>
> **opus-mt-en-ru** — derived from `Helsinki-NLP/opus-mt-en-ru`, © The Helsinki-NLP / OPUS-MT
> project, licensed under the Apache License, Version 2.0. ONNX conversion by Xenova
> (`Xenova/opus-mt-en-ru`). Unmodified apart from conversion to ONNX and quantization.
>
> **opus-mt-zh-en** — derived from `Helsinki-NLP/opus-mt-zh-en` by the Helsinki-NLP / OPUS-MT
> project, licensed under the Creative Commons Attribution 4.0 International licence
> (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). ONNX conversion by Xenova
> (`Xenova/opus-mt-zh-en`). Modified: converted to ONNX and quantized.
> Source: https://huggingface.co/Helsinki-NLP/opus-mt-zh-en
>
> The OPUS-MT project asks that work using its models cite:
>
> ```
> @InProceedings{TiedemannThottingal:EAMT2020,
>   author = {J{\"o}rg Tiedemann and Santhosh Thottingal},
>   title = {{OPUS-MT} — {B}uilding open translation services for the {W}orld},
>   booktitle = {Proceedings of the 22nd Annual Conferenec of the European Association
>                for Machine Translation (EAMT)},
>   year = {2020},
>   address = {Lisbon, Portugal}
> }
> ```

**Upstream licences: ESTABLISHED, and they are not the same across the three models.**

| Bundled path | `_name_or_path` | Upstream licence | Evidence |
|---|---|---|---|
| `Xenova/opus-mt-ja-en` | `Helsinki-NLP/opus-mt-ja-en` | **Apache-2.0** | HF API `cardData.license` = `"apache-2.0"`; tag `license:apache-2.0` |
| `Xenova/opus-mt-en-ru` | `Helsinki-NLP/opus-mt-en-ru` | **Apache-2.0** | HF API `cardData.license` = `"apache-2.0"` |
| `Xenova/opus-mt-zh-en` | `Helsinki-NLP/opus-mt-zh-en` | **CC-BY-4.0** | HF API `cardData.license` = `"cc-by-4.0"`; confirmed a second time from the rendered model card and a third from `raw/main/README.md` frontmatter |

> The pre-cost document expected **all three** to be CC-BY-4.0. Two of three are Apache-2.0.
> Only `zh-en` is CC-BY-4.0, and it is the one that carries the strict attribution form
> (title / author / source / licence / indication of modification) required by CC BY 4.0 §3(a).

**Conversion layer licence: NOT ESTABLISHED.** The bytes actually shipped are Xenova's ONNX
conversion, and all three Xenova repositories declare **no licence at all**:

```
$ curl https://huggingface.co/api/models/Xenova/opus-mt-ja-en
cardData: { base_model, library_name, pipeline_tag }   ← no license key
(same for opus-mt-zh-en and opus-mt-en-ru)
```

An undeclared licence on a derived work does not inherit the upstream licence automatically.
The practical readings are (a) the conversion is a mechanical format change carrying no new
copyrightable expression, so only the upstream licence governs, or (b) Xenova holds rights in
the conversion and has granted none. **This is a legal call for the user, not a finding this
audit can close.** The zero-risk alternative is to convert from `Helsinki-NLP/*` directly and
ship that, which puts the whole family under the established upstream terms.

### 1.2 ONNX Runtime Web — `public/ort` (74 MB, 8 files)

> **ONNX Runtime Web** — © Microsoft Corporation, licensed under the MIT License.
> https://github.com/microsoft/onnxruntime

**ESTABLISHED — MIT.** The eight files in `public/ort` are byte-identical to
`node_modules/onnxruntime-web/dist/`:

```
$ sha256sum public/ort/ort-wasm-simd-threaded.wasm node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm
f4f290847a4df02d…  (identical, and likewise for .mjs and .jsep.wasm)

$ node -e "console.log(require('./node_modules/onnxruntime-web/package.json').license)"
MIT
```

Version: **1.26.0-dev.20260416-b7804b056c** (`onnxruntime-common` is 1.27.0).

> **Caveat worth carrying:** the `onnxruntime-web` npm package **ships no LICENSE file** — the
> only licence statement is the SPDX string in `package.json`. MIT requires the copyright
> notice *and* the permission text to travel with the distribution, so that text must be
> sourced from the ONNX Runtime repository rather than copied out of `node_modules`.

### 1.3 Japanese tokenizer dictionary — `public/kuromoji` (18 MB, 12 files)

> **kuromoji.js** — licensed under the Apache License, Version 2.0.
>
> This software includes a binary version of data from **mecab-ipadic-2.7.0-20070801**.
>
> Copyright 2000, 2001, 2002, 2003 Nara Institute of Science and Technology.
> All Rights Reserved.
>
> Use, reproduction, and distribution of this software is permitted. Any copy of this
> software, whether in its original form or modified, must include both the above copyright
> notice and the following paragraphs.
>
> *(the full NAIST warranty-disclaimer and ICOT Free Software paragraphs follow — they must be
> reproduced verbatim; the complete text is in `node_modules/kuromoji/NOTICE.md`)*

**ESTABLISHED — Apache-2.0 (code) over IPADIC (data), with a mandatory NOTICE.** All twelve
`.dat.bin` files decompress to bytes identical to the npm dictionary:

```
$ gzip -dc public/kuromoji/dict/base.dat.bin | sha256sum   → e578a6c02ed9…
$ gzip -dc node_modules/kuromoji/dict/base.dat.gz | sha256sum → e578a6c02ed9…
(12 of 12 files match; identical for @sglkc/kuromoji@1.1.0 and kuromoji@0.1.2)
```

The `.dat.bin` files are gzip streams under a non-`.gz` name — magic bytes `1f 8b 08 00`,
confirming the comment at `src/renderer/tokenizer.ts:49`.

`kuromoji@0.1.2` and `@sglkc/kuromoji@1.1.0` both declare `Apache-2.0` and both ship a
`NOTICE.md`. **Apache-2.0 §4(d) makes propagating that NOTICE mandatory** — this is the one
family where the obligation is not merely "give credit" but "reproduce this exact file".

### 1.4 Tesseract OCR — `public/tesseract` (11 MB, 5 files)

> **tesseract.js** and **tesseract.js-core** — licensed under the Apache License, Version 2.0.
> https://github.com/naptha/tesseract.js
>
> **Japanese trained data** (`jpn.traineddata`, `jpn_vert.traineddata`) — from the
> Tesseract OCR project, licensed under the Apache License, Version 2.0.
> https://github.com/tesseract-ocr/tessdata

**Engine: ESTABLISHED — Apache-2.0.** `worker.min.js` and
`core/tesseract-core-simd-lstm.wasm.js` are byte-identical to `tesseract.js@7.0.0` and
`tesseract.js-core@7.0.0` in `node_modules`, both declaring `Apache-2.0` and both shipping a
licence file (`LICENSE.md`, `LICENSE`).

**Trained data: NOT ESTABLISHED for these exact bytes.** The tessdata README states "All data
in the repository are licensed under the Apache-2.0 License", so Apache-2.0 is very likely
correct — but the bundled files match **no** upstream revision I could check:

| Candidate | `jpn` size | `jpn_vert` size |
|---|---:|---:|
| **bundled (uncompressed)** | **3,039,374** | **3,040,074** |
| `tessdata` @main | 35,659,159 | 3,039,939 |
| `tessdata` @4.0.0 | 35,659,159 | 3,039,939 |
| `tessdata` @4.00 | 44,380,238 | (absent) |
| `tessdata_fast` @main | 2,471,260 | 3,037,480 |
| `tessdata_best` @main | 14,330,109 | — |
| tesseract.js CDN `4.0.0/` | 16,163,676 (gz) | 3,039,939 |
| tesseract.js CDN `4.0.0_fast/` | 1,535,471 (gz) | 2,033,787 (gz) |

Note also that the app's own runtime-download registry points somewhere different from the
bundled copy: `src/shared/assetRegistry.ts:397` declares
`tessdata_fast/raw/main/jpn.traineddata` at 2,471,260 bytes, which is not what is bundled.

**Recommended resolution — cheap:** re-download both files from a named tessdata revision,
record the revision and SHA-256 in the notice, and the row becomes ESTABLISHED. Do not ship
bytes whose origin cannot be named.

### 1.5 CC-CEDICT — `public/cedict/cedict.u8` (10 MB, 1 file)

> **CC-CEDICT** — Community maintained free Chinese-English dictionary, published by MDBG.
> Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License
> (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/
>
> Referenced works: CEDICT — Copyright (C) 1997, 1998 Paul Andrew Denisowski.
>
> Bundled version: `version=1 subversion=0 format=ts charset=UTF-8 entries=125051
> date=2026-06-26T05:32:48Z`. Downloaded from
> https://www.mdbg.net/chinese/dictionary?page=cc-cedict — distributed here unmodified.

**ESTABLISHED — CC BY-SA 4.0, read out of the shipped file's own header** (`head -40
public/cedict/cedict.u8`). This is the strongest primary source in the whole set: the licence
statement is inside the distributed bytes.

The file is shipped **verbatim** — its declared `entries=125051` matches the actual
non-comment line count (`grep -vc "^#"` → `125051`), and the MDBG header block is intact.

> **The share-alike question, stated precisely and left open.** CC BY-SA 4.0's ShareAlike
> condition (§3(b)) attaches to **Adapted Material**, not to verbatim redistribution. As long
> as `cedict.u8` ships byte-identical, the obligation is attribution + licence notice + link,
> which the draft above satisfies. Share-alike bites if a *derived* index built from CC-CEDICT
> is also distributed: that derivative would have to be offered under CC BY-SA 4.0, and
> **GPL-3.0-or-later on the application code does not discharge that** — the data keeps its own
> licence regardless of what the code is under. This is compatible (the two can ship side by
> side under different terms), but it must be stated, not assumed. **Decision for the user:**
> confirm no CC-CEDICT-derived index is distributed, or add a CC BY-SA 4.0 notice covering it.

### 1.6 World map paths — `src/renderer/data/worldMapPaths.ts` (1.2 MB)

> **World map SVG paths** — derived from `@svg-maps/world` v2.0.0 by Victor Cazanave,
> licensed under the Creative Commons Attribution 4.0 International licence (CC BY 4.0),
> https://creativecommons.org/licenses/by/4.0/
> Source: https://github.com/VictorCazanave/svg-maps
> Modified: converted to a TypeScript module keyed by ISO-3166 alpha-2 code; only path data
> and the viewBox were retained.

**ESTABLISHED — CC-BY-4.0**, from the npm registry metadata for the exact version named in the
file header:

```
$ curl https://registry.npmjs.org/@svg-maps%2Fworld
latest: 2.0.0 · license: CC-BY-4.0 · author: Victor Cazanave <victor.cazanave@gmail.com>
```

The attribution currently exists **only as a source comment** at the top of
`worldMapPaths.ts`. A source comment does not travel with a distributed binary, so CC BY 4.0
§3(a) is **not** satisfied by the current shipping form. The data renders in
`WorldHeatMap.tsx:141-142`, which is where a user-visible credit belongs.

### 1.7 Tatoeba — already credited, listed for completeness

> **Example sentences** — from the Tatoeba Project (https://tatoeba.org), licensed under
> CC BY 2.0 FR (https://creativecommons.org/licenses/by/2.0/fr/).

Shipped in source at `src/renderer/data/grammar/tatoebaExamples.ts` (706 records), which
retains each sentence's upstream `sourceId`. This is the **only** attribution the application
currently surfaces: `src/shared/i18n/catalogs/en.ts:2407` →
`'grammar.examples.tatoebaCredit'`, rendered at
`src/renderer/components/grammar/GrammarContent.tsx:151`.

### 1.8 `public/sounds` — no obligation

`public/sounds` contains a single `README.md` and no audio. Its own text confirms it: "**No
audio is bundled yet.** The engine ships with a `silent` pack". Nothing to attribute.

---

## 2. Summary table

| Family | Size | Licence | Status | Obligation on a distributed binary |
|---|---:|---|---|---|
| `models` — Helsinki-NLP upstream, ja-en | 418 MB | Apache-2.0 | **ESTABLISHED** | Licence copy; retain notices; state changes |
| `models` — Helsinki-NLP upstream, en-ru | 427 MB | Apache-2.0 | **ESTABLISHED** | Licence copy; retain notices; state changes |
| `models` — Helsinki-NLP upstream, zh-en | 435 MB | CC-BY-4.0 | **ESTABLISHED** | Title, author, source URI, licence URI, indication of modification |
| `models` — Xenova ONNX conversion layer | (same bytes) | *none declared* | **NOT ESTABLISHED** | Unknown — user decision |
| `ort` | 74 MB | MIT | **ESTABLISHED** | Copyright + permission text (must be sourced from upstream repo — not in the npm package) |
| `kuromoji` | 18 MB | Apache-2.0 + IPADIC | **ESTABLISHED** | Licence copy **and** verbatim `NOTICE.md` propagation (Apache-2.0 §4(d)) |
| `tesseract` — engine | 7 MB | Apache-2.0 | **ESTABLISHED** | Licence copy; retain notices |
| `tesseract` — `*.traineddata.gz` | 4 MB | Apache-2.0 *expected* | **NOT ESTABLISHED** | Cannot name the upstream revision these bytes came from |
| `cedict` | 10 MB | CC BY-SA 4.0 | **ESTABLISHED** (from the file's own header) | Attribution + licence notice + link; share-alike on any adaptation |
| `worldMapPaths.ts` | 1.2 MB | CC-BY-4.0 | **ESTABLISHED** | Attribution must be user-visible, not a source comment |
| `sounds` | 0 MB | — | n/a | None (no audio bundled) |

**Two rows are NOT ESTABLISHED**: the Xenova conversion layer, and the tessdata revision.

---

## 3. Where the notice should surface in-app

**Precedent.** The one existing attribution follows a consistent pattern: an i18n key resolved
with `t()` and rendered inline next to the content it covers —
`'grammar.examples.tatoebaCredit'` in `catalogs/en.ts:2407`, rendered at
`GrammarContent.tsx:151`. Follow it rather than inventing a new mechanism.

**There is no About surface to hang a notices block on.** `settingsRegistry.ts` has 30+
sections (`home`, `appearance`, `storage`, `memory`, …) and **no `about` entry** — verified by
listing every `id:` in the file. One has to be added.

Recommended shape, in the order the licences require it:

1. **A notices section that ships the full texts.** Add an `about` section to
   `settingsRegistry.ts` (the registry stores an i18n *key* per entry — `labelKey`/`descKey` —
   and resolves it at render time; see `CLAUDE.md` §7, and do not call `useT()` at module-eval
   time). It renders the complete third-party notices. This is what discharges the
   "reproduce the licence" obligations for Apache-2.0 and MIT, and it is the only place the
   IPADIC `NOTICE.md` text can live.
2. **Inline per-surface credits**, matching the Tatoeba precedent, for the two CC-BY families
   whose attribution must accompany the work as used:
   - `WorldHeatMap.tsx` — a caption crediting `@svg-maps/world` / Victor Cazanave / CC BY 4.0.
   - `DictionaryResults.tsx` (Chinese results) — a CC-CEDICT / MDBG / CC BY-SA 4.0 credit,
     directly parallel to the existing Tatoeba line under grammar examples.
   - Wherever the translation output surfaces — an OPUS-MT credit, required for `zh-en` under
     CC BY 4.0 and good practice for the other two.
3. **A `THIRD_PARTY_NOTICES.txt` in the packaged artifact root**, next to the existing
   Electron `LICENSE`, carrying every full licence text. Several obligations here
   ("include a copy of the License") are not satisfiable by a short in-app credit line.

**i18n note.** The *labels* around the notices ("Third-party components", the section title)
are app chrome and go through the catalogs in the normal way. The **licence texts themselves
must ship verbatim in English and must not be translated** — altering them defeats the point of
reproducing them. This is the same boundary `CLAUDE.md` §4 draws between chrome and content.

---

## 4. Scope this draft does not cover

- **The 21 runtime-downloaded assets** in `src/shared/assetRegistry.ts` — Whisper ×4,
  manga-ocr ×3, comic-text-detector, PaddleOCR ×7, tessdata-jpn, cc-cedict, jmdict-yomitan,
  kanjium-accent, tatoeba-ja, mirror-writing-evaluator. **The registry has no licence field at
  all** (`grep -n "licen\|attribution\|credit" src/shared/assetRegistry.ts` → no matches).
  These are not in the binary, so they are not a *distribution* obligation — but the app
  fetches and installs them, and several (JMdict, CC-CEDICT, PaddleOCR) carry attribution terms
  that a user-facing dictionary UI would normally surface.
- **The 623 npm packages** — covered by `license-audit-gate.mjs`.
- `vendor/seanime`, `vendor/seanime-web` — the other agent's half (A2 proper).
