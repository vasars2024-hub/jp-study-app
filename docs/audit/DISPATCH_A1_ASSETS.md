# DISPATCH A1 — Data & asset provenance, pdfRasterize, packaging posture

Cold agent, `jp-study-app`. Everything you need is here plus the files it points at.

**This repo is being published: source + binaries on GitHub, GPL-3.0-or-later.** Your findings
decide what can legally ship. That is the whole reason this runs before any product-quality work.

---

## 0. Read first

1. **`.claude/skills/jp-dispatch/SKILL.md`** — the working rules. **Follow it.** It carries git
   discipline, which checks are gates, known-failing suites, and the evidence standard. This
   document does not repeat it.
2. **`docs/audit/PRECOST_A1_A2_PROVENANCE.md`** — read-only pre-costing already done for you.
   It **shrinks your A1 from four files to two** and identifies the models. Do not re-derive it;
   do challenge anything that looks wrong, and say so if you do.

`claim-check` and `honesty-probe` are available as skills if you need them.

---

## 1. Ownership and the one deviation from normal git discipline

You may create/edit **only**:

- `docs/audit/HANDOFF_A1_ASSETS.md` (your handoff)
- `docs/audit/NOTICES_DRAFT_ASSETS.md` (your notices draft, §3)

**Everything else in the repo is read-only to you.** You will read a lot — that is the job.

> **DO NOT COMMIT, DO NOT BRANCH, DO NOT `git add`.** You are on branch `audit/a-evidence` and
> **another agent is working concurrently in this same worktree on different files.** Git has one
> index per worktree; concurrent commits collide. Write your files and stop. The orchestrator
> commits both halves. This overrides `jp-dispatch`'s commit rule **for this run only** — every
> other rule in it still applies, especially never `git stash`, never `git add -A`, and never
> touching another agent's files.
>
> The other agent owns: `docs/audit/HANDOFF_A2_LICENSE.md`, `docs/audit/GITIGNORE_DRAFT.md`,
> `docs/audit/DOCS_DISPOSITION.md`. Stay out of those.

**Do not start, restart or kill any app.** Everything here is answerable from files on disk.

---

## 2. A1 — the two genuinely unlabelled data files

`renderer/data/mirrorTexts/index.ts` (98 KB) and `renderer/data/gradedSentences/index.ts`
(56 KB) carry **no provenance note and no licence keyword at all**. Everything else on the old
"unknown" list is resolved — see the pre-cost doc.

**Forcing rule: 90 minutes of research per file, hard stop. Unidentifiable ⇒ recommend STRIP.**
Do not research past the timebox; record where you got to.

Evidence worth chasing, in order:
- `TASKS.md` claims the mirror texts went 7 → 99 authored **in-repo** by a session, and describes
  the authoring rules and hygiene tests (`mirrorTextsData.test.ts`, `gradedSentencesData.test.ts`).
  If true, these are original work and the answer is "ours" — **but that is a doc claim, and doc
  claims in this repo have a track record of not surviving contact with source.** Test it: do the
  texts read as authored-for-purpose (one idea per sentence, level-graded, matching the documented
  rules), or do they read as lifted from a corpus?
- Look for near-duplicate provenance: do any sentences appear in `tatoebaExamples.ts`? An overlap
  would mean a corpus origin the header doesn't declare.
- Check git history for the commits that introduced and grew them.

**For each file produce a degradation path**: what breaks if it is stripped, which consumers
fail, and whether the app degrades honestly or crashes. `contentSource.ts` reportedly makes the
player's own deck material win over bundled tables — verify whether that makes
`gradedSentences` genuinely optional.

## 3. A2's asset half — 1.39 GB with no licence documentation

**This is the largest publication gap found so far.** `public/` ships via `extraResource`
(`forge.config.ts`), so all of it lands in the packaged artifact, and there is **no
LICENSE/NOTICE/COPYING file anywhere under `public/` or `vendor/`**. The whole app contains
exactly **one** attribution string (`catalogs/en.ts:2407`, Tatoeba).

For each family below establish, from upstream: **what it is, what version, under what licence,
and what that licence requires of a distributed binary.**

| Family | Size | Known identity |
|---|---:|---|
| `public/models` | 1,278 MB | `Xenova/opus-mt-{ja-en,zh-en,en-ru}` — `config.json` `_name_or_path` gives `Helsinki-NLP/opus-mt-*`. **Two licences stack**: the upstream OPUS-MT model and Xenova's ONNX conversion |
| `public/ort` | 74 MB | ONNX Runtime WASM |
| `public/kuromoji` | 17 MB | IPADIC `.dat.bin` dictionary data |
| `public/tesseract` | 10 MB | Tesseract WASM + `jpn_vert.traineddata.gz` |
| `public/cedict` | 9 MB | `cedict.u8` — CC-CEDICT. **Expect share-alike on the data**; if so it is the sharpest row, because GPL-3.0 on the *code* does not discharge a share-alike obligation on *data* |
| `renderer/data/worldMapPaths.ts` | 1.2 MB | `@svg-maps/world` v2.0.0, Victor Cazanave, **CC-BY-4.0** — declared in the file header, attribution given **only in a source comment**, which does not satisfy CC-BY for a distributed binary |

**Deliverable: `docs/audit/NOTICES_DRAFT_ASSETS.md`** — a draft third-party notices section for
these assets, in the form it would ship. Include the exact attribution text each licence
requires. Flag any family whose licence you **cannot** establish: that is a strip-or-replace
decision for the user, not an assumption for you.

Also determine **where an attribution notice should surface in-app**. There is precedent —
`grammar.examples.tatoebaCredit` — so follow the existing pattern rather than inventing one.

## 4. A4 — `pdfRasterize`, read the call graph only

`src/main/pdfRasterize.ts:79-82` runs an offscreen `BrowserWindow` with
`contextIsolation: false`, `nodeIntegration: true`, `webSecurity: false`. If user-supplied PDF
content reaches it, that is remote code execution.

**Establish what it loads and who calls it.** Trace every call site and what the input can be.

**Do NOT attempt a reachability proof and do not conclude "nothing untrusted reaches it."** A
refusal has no positive observable, and one future call site invalidates any such proof. The
planned fix is to turn the three flags on and see whether rasterization still works — that is a
separate, later step. Your job is the map that makes that change safe to attempt, plus a clear
statement of what would break if the flags flip.

## 5. A5 — packaging posture, from the artifact

- Confirm `debugBridge`'s `app.isPackaged` hard-stop (`debugBridge.ts:380`) holds **in the
  packaged artifact**, not just in source.
- Record the fuse configuration and state plainly that `EnableEmbeddedAsarIntegrityValidation`
  and `OnlyLoadAppFromAsar` are off **because the build ships no asar** (~945 MB of models) —
  a trade-off for the release notes, not a defect to fix.
- `MakerZIP` only; `MakerSquirrel` is declared but unused → **no installer, no code signing.**
  Record the consequence (SmartScreen on every first run) as a decision for the user.
- **Before believing any measurement of `out/`**: a packaged run can make the next
  `npm run package` fail with `EPERM` on `dxcompiler.dll` *after* logging green ticks, leaving
  the **old exe** in place. Check that no `src` file is newer than the exe and say so explicitly.
  **Do not run a package build** — measure what is already there, and if it is stale, report it
  as stale rather than rebuilding.

---

## 6. Handoff — `docs/audit/HANDOFF_A1_ASSETS.md`, written as you go

For every item: `claim · what you measured · verdict · evidence (file:line or command) · what it
costs to fix · who decides`.

State explicitly:
1. **A1 verdict per file** — ours / third-party / unidentifiable, with the degradation path.
2. **A2 asset table** — licence per family, established or NOT established. An unestablished row
   is a finding, not a gap in your work.
3. **Every licence name you could not confirm from a primary source**, listed plainly. The
   pre-cost doc's licence names are *expectations*, not established fact — do not launder them
   into conclusions by repeating them.
4. **What you did not get to** inside the timebox.
5. Any defect noticed in code you do not own — recorded, not fixed.

## 7. Scope

If you finish early, stop. Do not fix anything, do not touch `.gitignore` (the other agent owns
it), do not audit product features. Evidence is the deliverable.
