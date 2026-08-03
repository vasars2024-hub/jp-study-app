# Pre-costing for A1/A2 — bundled data and asset provenance

**Produced:** 2026-08-03, by reading only. The app was not run and nothing was modified.
**Status:** input to Stage A-evidence. Every licence *name* below is an expectation from the
asset's identity, **not** something read out of this tree — there are no licence files here to
read, which is the finding.

---

## 1. The "four files of unknown provenance" framing was wrong

`docs/migration/LICENSING_PLAN.md`'s Unknown column predates the headers now in those files.
Four of six document their own provenance, and for one the generator *and* its source are in
the tree. The audit plan repeated that column without opening the files — the same
did-not-check-the-denominator defect the audit exists to find, committed by the audit.

| File | Header claim | Verified | Disposition |
|---|---|---|---|
| `renderer/data/grammar/hsk-import.ts` (152 KB) | GENERATED; source is *a chat model's output*, not a published syllabus; regenerate via `tools/hsk-import/build.cjs` | **CONFIRMED** — `build.cjs` (10.7 KB) and `source.tsv` (23.9 KB) both present. `source.tsv`'s header records the ~875 source rows and what was dropped and why. Imports as `imported-unreviewed`, gated behind the curation queue | **Not a licensing risk.** LLM output, honestly labelled, never presented as verified. Quality item — **off the strip list** |
| `renderer/data/catalogFallback.ts` (32 KB) | Mirrors `catalog.json` in the project's own catalog repo | **CONFIRMED** — `catalog-repo/catalog.json` (28.7 KB) present, plus `novels.json` (16.4 KB) | **Own content, not third-party. Off the strip list.** It had been pre-assessed *highest risk*; that assessment was wrong |
| `renderer/data/novels.ts` (101 KB) | Hand-checked metadata about real published works | plausible on inspection | Low risk — facts about published works are not copyrightable as such |
| `renderer/data/worldMapPaths.ts` (1.2 MB) | Derived from `@svg-maps/world` v2.0.0 by Victor Cazanave, **CC-BY-4.0** | **CONFIRMED in header** | **Not unknown — it is CC-BY, and the attribution is not being given. See §2.** |
| `renderer/data/mirrorTexts/index.ts` (98 KB) | *none* — zero licence/provenance keywords in the file | — | **Genuinely unlabelled.** `TASKS.md` claims 7→99 authored in-repo, which would make it ours — a doc claim, so verify |
| `renderer/data/gradedSentences/index.ts` (56 KB) | *none* | — | **Genuinely unlabelled.** |

**A1 collapses from four strip-candidates to two.** The 90-minute-per-file forcing rule stands
but applies to `mirrorTexts` and `gradedSentences` only.

---

## 2. 1.39 GB of bundled third-party assets carry no licence documentation

`public/` ships via `extraResource` in `forge.config.ts`, so **all of it lands in the packaged
artifact**. A name sweep for `LICENSE` / `LICENCE` / `NOTICE` / `COPYING` / `COPYRIGHT` across
`public/` and `vendor/` returns **zero files**.

| Family | Size | Files | Identity | Expected obligation — **establish upstream, do not assume** |
|---|---:|---:|---|---|
| `models` | **1,278 MB** | 30 | see §2b — three OPUS-MT translation models | OPUS-MT is published CC-BY-4.0 → attribution, no share-alike |
| `ort` | 73.7 MB | 8 | ONNX Runtime WASM | MIT — notice required |
| `kuromoji` | 17 MB | 12 | IPADIC `.dat.bin` dictionary data | IPADIC requires copyright-notice retention |
| `tesseract` | 10.4 MB | 5 | Tesseract WASM + `jpn_vert.traineddata.gz` | Apache-2.0 — NOTICE propagation |
| `cedict` | 9.4 MB | 1 | `cedict.u8` — CC-CEDICT | **CC BY-SA — attribution *and* share-alike. Sharpest row: share-alike on data is not discharged by GPL-3.0 on the code** |
| `sounds` | 0 MB | 1 | `README.md` only; audio absent/ignored | — |

### The app contains exactly one attribution string

Sweeping every `credit` / `attribution` / `licen` key in `src/shared/i18n/catalogs/en.ts`
returns a single hit:

```
L2407: 'grammar.examples.tatoebaCredit': 'Example sentences from Tatoeba, licensed CC-BY 2.0 FR'
```

That is the Tatoeba credit which was already caught and fixed once. Nothing else has one.
`worldMapPaths`' CC-BY-4.0 credit exists only in a **source comment**, which does not satisfy
CC-BY for a distributed binary.

### 2b. The 1.28 GB is three translation models, and provenance survived conversion

`config.json` carries `_name_or_path` in every one, so nothing has to be guessed.

| Bundled path | `_name_or_path` | Size | Arch |
|---|---|---:|---|
| `Xenova/opus-mt-ja-en` | `Helsinki-NLP/opus-mt-ja-en` | ~417 MB | MarianMT |
| `Xenova/opus-mt-zh-en` | `Helsinki-NLP/opus-mt-zh-en` | ~435 MB | MarianMT |
| `Xenova/opus-mt-en-ru` | `Helsinki-NLP/opus-mt-en-ru` | ~427 MB | MarianMT |

Two licences stack per model — Helsinki-NLP's OPUS-MT upstream and Xenova's ONNX conversion.
No JSON carries a `license` key, so both resolve from upstream; `_name_or_path` makes that a
lookup rather than an investigation.

**No Whisper model is bundled**, corroborating the standing USER-MUST item that first use
triggers a multi-hundred-megabyte download.

### Why this outranks the npm work

`LICENSING_PLAN.md` and `license-audit-gate.mjs` cover **623 npm packages** and the study
**data** files. Neither covers `public/`. The gate can report exit 0 while a third of the
packaged payload sits outside what it audits.

> **CORRECTION 2026-08-04.** This section originally read "**~94%** of the packaged payload".
> That figure was asserted without measuring the denominator — the exact defect this audit
> exists to find, committed by the audit, for the second time. **Measured: the packaged
> artifact is 3,901 MB and `resources/public` is 1,389 MB — 35.6%.** A1's independent figure
> was 34.9%. The finding is unchanged in kind and smaller in size; it is still the largest
> single un-audited block, and one third is not one twentieth.

---

## 3. A3 preliminary — working tree only

History scope awaits the squash-vs-history ruling.

- **Credential-shaped strings: clean.** One hit,
  `public/tesseract/core/tesseract-core-simd-lstm.wasm.js:116`, a base64 run inside a vendored
  WASM glue blob — not a secret.
- **No `.env` / `.pem` / `.p12` / `.pfx` / `.key` files** outside `node_modules`.
- **One real hit, in shipped source:** `src/shared/automationBuilder.ts:8` hardcodes
  `powershell -ExecutionPolicy Bypass -File "C:\Users\Arseniy\Projects\jp-study-app\automation-builder.ps1"`.
  It compiles into the bundle. **Also a Probe F candidate** — if the path is absolute and
  developer-specific, the feature is likely inert for every other user.

## 4. A6 surface — larger than assumed

| Area | Count |
|---|---:|
| root `*.md` | 37 |
| `docs/**` | 85 |
| `src/*.md` (PHASE_* state docs) | 20 |
| `src/.coordination/**` | 12 |
| **`docs/migration/proof/` directories** | **258** |

The 258 proof directories hold machine-specific paths, timings and profile contents — the
strongest keep-private candidate, and a reason squashing is cheaper than scrubbing.

---

## 5. Consequences for Stage A

- **A2 grows**: `THIRD_PARTY_NOTICES` must cover bundled binary assets, not only npm.
- **A1 shrinks**: two unlabelled files; `catalogFallback` and `hsk-import` come off entirely.
- **New A-decide ruling**: if CC-CEDICT's share-alike is confirmed, it constrains data
  redistribution in a way GPL-3.0 on the code does not automatically satisfy. That is a
  ruling, not a task.
- `vendor/seanime` and `vendor/seanime-web` are already in the tree, relevant to the GPL
  fork-source obligation, which may be partly discharged already.
