# Plan — verbatim Japanese subtitles fused from English subs + Whisper

**Status: PLAN ONLY. Nothing here is implemented.**
Author: claude-backup · Drafted 2026-08-14 on direct user request · Verified against the
tree at this date, branch `feat/nyaa-subtitles`.

Every path and symbol below was checked to exist before being written down. Re-verify
before acting: this repo has several concurrent tracks and ~1,000 uncommitted paths.

Relay note: this plan is wired into the relay ladder (stage 2 in
`~\.claude-runs\relay-prompt.ps1`). Work it stage by stage in order; update the
**Progress** section at the bottom of this file as stages land — that section, not any
relay hop's closing summary, is the authority on how far this plan has gotten.

---

## 1. The problem this solves

Japanese subtitles are the scarcest asset in the app's pipeline: Jimaku misses shows,
nyaa extraction (see `NYAA_SUBTITLE_EXTRACTION_PLAN.md`) is not implemented, and raw
Whisper output today is a 30-second-chunk SRT with no real cue timing. English subtitles,
by contrast, are nearly always available and carry two things of real value: **accurate
per-line cue timing** and **reliable meaning**. What they lack is the actual Japanese.

This plan combines three imperfect sources whose failure modes do not overlap:

| Source | Gives | Fails at |
|---|---|---|
| EN subtitle track | precise cue timing, trustworthy meaning | it's not Japanese |
| Whisper on the JA audio | the words actually spoken | homophones, names, hallucination on music/silence, coarse timing as wired today |
| EN→JA machine translation | fluent, semantically right Japanese | won't match the original phrasing actually spoken |

Fused correctly, the output is a Japanese track that is **verbatim to the audio** (from
Whisper), **semantically checked** (against the EN meaning), and **precisely timed**
(from the EN cues). For a study app, verbatim-to-audio is the whole point: the learner
reads along with what is being said, not a paraphrase of it.

## 2. What already exists (verified 2026-08-14)

This is mostly an integration job. The primitives are live:

| Piece | Where | What it already does |
|---|---|---|
| Persistent Whisper queue | `src/main/transcriptionJobs.ts` | chunked (30 s), persisted to disk, survives restart, cancellable, broadcasts `TranscriptionProgress`; Whisper runs in a renderer worker, main calls outward via UUID-correlated RPC (`requestChunk`) |
| Audio extraction | `src/main/media.ts` → `extractAudioPcm(path)` | ffmpeg → 16 kHz mono Float32 PCM |
| Whisper model tiers | `src/shared/whisperModels.ts` + `src/renderer/whisperSettings.ts` | user-chosen tier/device, HF model id for the worker |
| Cue parsing | `src/renderer/subtitles.ts` | `parseSubtitles(raw)` → `Cue[]` (dispatches to `parseAss` / `parseSrtVtt`) |
| Timing-offset estimation | `src/shared/subtitleSync.ts` | cross-correlates cue activity against speech energy; refuses rather than guessing (the 9.05 s Big O case is documented in its header) |
| Subtitle records | `src/shared/subtitleRecord.ts` | `SubtitleRecord` with `source: 'generated'`, `machineGenerated`, `edited`, `confidence` fields already defined |
| Offline translation | `src/main/translate.ts` (+ `src/shared/translateCore.ts`) | Qwen3-1.7B GGUF, batch prompts, persistent translation cache |
| Cloud LLM with schema | `src/main/aiProviderClient.ts` → `callAiProvider` | Gemini/DeepSeek, JSON-schema-enforced output; already consumed by `mining.ts`, `sentenceAnalysis.ts`, `translateAnalysis.ts`, `mediaStudyAssistant.ts` |
| IPC contract | `src/shared/transcriptionIpc.ts` | `TranscriptionJob`/`Phase`/`Progress`, `MAX_TRANSCRIPTION_ATTEMPTS`, ETA |
| Transcription settings UI | `src/renderer/components/settings/pages/TranscriptionPage.tsx` | the surface the new entry point should sit beside |

Note the current Whisper path (`runJob` → `chunksToSrt`) slices audio on a fixed 30 s
grid, so its SRT cues are 30-second blocks. This plan replaces that grid with the EN
track's own cue boundaries — which is simultaneously what makes the fused output
precisely timed *and* what makes per-cue comparison against a translation possible.

## 3. The pipeline

```
EN SubtitleRecord ─ parse ─┐
                           ├─ F1 sync-correct EN timing (subtitleSync)
JA audio (extractAudioPcm) ┘
        │
        ├─ F2 per-cue Whisper: slice audio on EN cue windows → verbatim JA candidate per cue
        ├─ F3 EN→JA reference translation per cue (cached, batched)
        ├─ F4 agreement scoring (pure, offline, unit-tested)
        └─ F5 arbitration/repair of disagreements (cloud LLM, schema-enforced; offline degrades gracefully)
                → F6 emit fused-ja.srt + per-cue confidence sidecar + SubtitleRecord
```

### F1 — preconditions and timing correction

- Pick the best EN track from `MediaItem.subtitles` (existing records; any source).
  If none exists, the job refuses with a clear error — this feature does not fetch subs.
- Run the `subtitleSync` estimator on the EN track against this file's audio **first**.
  If it returns a confident offset, shift the cue times before slicing; if it refuses,
  proceed unshifted. An EN track timed against a different release would otherwise make
  every Whisper window transcribe the wrong line — garbage in, confidently fused garbage out.
- Filter out non-dialogue cues before slicing: cues that are pure music glyphs (♪/♬),
  and ASS sign/karaoke lines. `parseAss` in `src/renderer/subtitles.ts` currently keeps
  only text and timing — verify what it drops and extend it (or filter by text heuristics)
  rather than transcribing signs. Record how many cues were excluded.

### F2 — per-cue Whisper transcription

- Reuse the persistent queue in `transcriptionJobs.ts`; add a new job kind additively
  (e.g. `kind?: 'transcribe' | 'fuse-en-ja'` on `TranscriptionJob`, absent = old
  behavior) so persistence/restore, retry caps, cancellation, ETA and the progress UI
  all come for free. Do not build a second queue.
- Window construction: merge adjacent EN cues with gaps < ~400 ms into one ASR window
  (context helps Whisper), pad each window ±250 ms, cap windows at the existing
  `CHUNK_SECONDS`. Keep the window→cue mapping so merged output can be split back by
  the per-cue reference (F4 handles splitting via the arbitration call when needed).
- Force `language: 'ja'` on the worker call; use the user's configured model tier.
  The per-window RPC is the existing `requestChunk` shape — window slices replace grid
  slices; nothing about the renderer worker protocol needs to change.

### F3 — EN→JA reference translation

- Translate each EN cue's text to Japanese through the existing offline path
  (`translate.ts` batch API, which already caches) — cloud is *not* required for this
  stage; the reference only needs to carry meaning, not elegance.
- Batch with a couple of neighbouring cues as context where the batch prompt supports
  it; do not invent a new prompt shape if `translateCore.ts`'s existing batch prompt
  suffices.

### F4 — agreement scoring (`src/shared/subtitleFusionCore.ts`, new)

Pure module, no Electron/Node imports (the `translateCore.ts` pattern), fully
unit-testable. For each cue: normalize both candidates (NFKC, strip punctuation and
whitespace, fold katakana→hiragana), then score character-bigram Dice overlap between
the Whisper text and the reference translation. Classify:

- **agree** — score above the accept threshold → take Whisper's text verbatim, high
  per-cue confidence. No LLM call.
- **partial / conflict** — send to F5.
- **asr-empty** — Whisper produced nothing usable (silence, music bled through the
  filter) → take the reference translation, low confidence, flagged.

Thresholds are calibrated on the F7 harness, not hardcoded from intuition — ship the
first version with provisional constants and a comment saying exactly that.

### F5 — arbitration and repair

- For partial/conflict cues, one batched `callAiProvider` call per ~16 cues with a JSON
  schema: input is `{en, whisper, reference, neighbours}` per cue; instruction is to
  output **what was actually said** — prefer Whisper's tokens wherever they are
  phonetically plausible, use the EN meaning to fix homophone and name errors, and
  never introduce content present in neither candidate. Output per cue:
  `{text, basis: 'whisper-corrected' | 'reference' | 'whisper-as-is', confidence}`.
- **Offline degradation is a hard requirement** (the app is offline-first): with no
  cloud key, skip F5 entirely — keep Whisper verbatim for partial/conflict cues at
  reduced confidence. Rationale: for a study app, the verbatim-but-possibly-misheard
  line still matches the audio the learner hears; the fluent paraphrase does not.
  Qwen3-1.7B is deliberately not trusted with arbitration.

### F6 — output

- Write `fused-ja.srt` (EN cue timing post-F1) under the existing
  `userData/subtitles/<mediaId>/` layout, plus a `fused-ja.meta.json` sidecar carrying
  per-cue `{basis, score, confidence}` so the transcript UI can badge uncertain lines
  and user edits can set `edited: true` on the record.
- Add a `SubtitleRecord`: `lang: 'ja'`, `source: 'generated'`, `machineGenerated: true`,
  track-level `confidence` = mean per-cue confidence, label along the lines of
  `JA (fused from EN + Whisper)`. Replace any previous *fused* record only; never touch
  human-sourced records (mirror the replace-keep logic already in `runJob`).

### F7 — evaluation harness (the honesty gate)

Pick ≥2 episodes that have **both** a human JA track (e.g. Jimaku) and an EN track. Run
the pipeline with the JA track masked out, then score fused output against the human JA
track: align cues by time overlap, compute character error rate after the same
normalization as F4. Ship gate: **fused CER beats both raw-Whisper CER and MT-only CER
on every test episode.** If it doesn't, the fusion is not adding accuracy and the
feature must not ship as "highly accurate". This harness lives outside vitest (needs
real media + the Whisper runtime) — typecheck its fixtures explicitly; an untyped
harness fixture has faked product bugs in this repo before.

### F8 — UI and i18n

- Entry point beside the existing transcription controls (the surface that offers
  "Transcribe" today, plus `TranscriptionPage.tsx` for defaults). Requires an EN track
  to be present; the disabled state says why.
- Progress reuses `TranscriptionProgress`; extend `TranscriptionPhase` additively if a
  fusion-specific phase label is needed (e.g. `'translating'`, `'fusing'`).
- Every new user-visible string goes through all four i18n catalogs
  (`src/shared/i18n/catalogs/{en,ja,zh,ru}.ts`) and must be **wired** — key-count
  checks alone have passed on unwired modules before. Model-facing prompt text is not
  translated.

## 4. Decisions already made (standing auto-approval applies)

- **Per-cue ASR windows over full-episode alignment.** Aligning a whole-episode Whisper
  transcript to EN cues afterwards is strictly harder (needs word timestamps the current
  worker protocol does not return) and strictly worse (30 s grid). Slicing on EN cue
  boundaries gets alignment for free.
- **Whisper text wins ties; translation is the referee, not the author.** The product
  goal is verbatim-to-audio. The reference translation's job is to *detect and repair*
  ASR errors, and to fill in only where ASR produced nothing.
- **Cloud is optional, and only for F5.** F1–F4 and F6 are fully offline.
- **One queue.** Fusion jobs are a kind of transcription job, not a parallel system.

## 5. Risks and traps

- **Whisper hallucination on padded silence** — the classic "ご視聴ありがとうございました"
  on empty windows. The F4 `asr-empty`/low-overlap classification plus the F1 music/sign
  filter are the mitigations; the F7 harness must include at least one OP/ED span.
- **Merged windows returning one blob for two cues** — keep the window→cue map, and let
  F5's schema return per-cue splits; offline, assign the blob to the longer cue and mark
  the other `asr-empty` rather than duplicating text.
- **EN cue timing that is itself wrong** — F1's sync gate is load-bearing; do not skip
  it because the estimator "usually" says 0.
- **IPC payload size** — per-window Float32 slices are already the existing pattern
  (30 s ≈ 1.9 MB); merged windows are capped at `CHUNK_SECONDS`, so nothing grows.
- **Main-loop discipline** — scoring/normalization is cheap, but translation and ASR
  stay off the main event loop exactly as they are today (renderer worker / llama
  session). No new CPU work in main beyond string handling per cue.
- **This repo's hard rules all apply** — no `git stash`, no userData backups, `tsc` is
  not a gate, path-scoped commits only, verify edits landed by reading them back, live
  QA through the debug bridge only. See the relay prompt / `CLAUDE.md`; they are not
  repeated here.

## 6. What "done" means

1. F1–F6 implemented behind the existing queue, offline path fully working.
2. Fusion core unit tests green (`npx vitest run` on the new test files), plus the four
   stage-1 relay gates (`vitest`, `i18n-check`, `architecture-audit`, scoped `eslint`).
3. F7 harness run on ≥2 real episodes with the ship gate met, numbers recorded below.
4. Live acceptance through the debug bridge: trigger fusion on a real media item with an
   EN track, watch phases progress, see the fused track appear, badge uncertain lines,
   confirm the record survives an app restart.
5. One path-scoped checkpoint commit per stage, recorded in **Progress** below.

## 7. Progress

### F1 + F2 — the English track becomes the cue grid — 2026-08-14, primary

**What landed.** `src/shared/subtitleFusionCore.ts` (new, pure) does cue selection and ASR
window planning; `src/main/transcriptionJobs.ts` gained a `kind: 'fuse-en-ja'` job that runs
the sync gate, slices the audio on those windows, and writes `fused-ja.srt` plus a
`SubtitleRecord`. The parser moved from `src/renderer/subtitles.ts` to
`src/shared/subtitleCues.ts` (the old path re-exports it, so no importer changed) because
**main may not import from renderer** — the architecture audit calls that a layer violation,
and the fusion job parses the English track in main. `Cue` gained an optional `style`, which
`parseAss` now fills from field 3; that is the only reliable sign/karaoke signal, since
`cleanLine` strips the `{\pos(…)}` overrides before anything can read them.

**Deviations from the plan, and why.**

1. **No new `TranscriptionPhase`.** F8 proposes `'translating'`/`'fusing'`. Adding a phase
   forces entries in three exhaustive `Record<TranscriptionPhase, …>` maps in
   `shared/mediaStudyOrchestrator.ts` plus four i18n catalogs, and neither label describes
   anything this slice does. The existing phases are accurate for F1/F2; the new ones land
   with F3/F5, where they mean something.
2. **`SubtitleRecord.derivation`** (`'whisper' | 'en-ja-fusion'`, optional) was added. Without
   it a fused track and a grid transcript are both `generated`+`ja` and evict each other —
   two different artifacts with different timing, one silently deleting the other.
3. **Serialization reuses `shared/subtitlesExport.ts`.** A `cuesToSrt` in the fusion core
   tripped the audit's `duplicate-export` check, correctly. `windowCuesToSubtitleCues` never
   emits a blank cue, so the existing writer needed no fusion-specific variant.
4. **A merged window yields one cue, not a copy per cue.** Splitting a merged transcript back
   onto its cues needs the F4 reference translation; guessing a split here would be an
   invention presented as timing.

**The plan's merge rule was wrong on real data, and this is the fix.** F2 says "merge adjacent
EN cues with gaps < ~400 ms". Measured on the English captions of *Introduction and why I start
this podcast … #1* (38 cues over 305 s): **37 of 37 gaps are under 400 ms and 36 are exactly
zero.** Caption tracks are routinely authored contiguously, so that rule merges *everything*
and stops only at the 30 s cap — rebuilding precisely the 30-second blocks this feature exists
to escape. `FUSION_TARGET_WINDOW_SEC = 12` is now a soft cap on a merged window; the 30 s
`FUSION_MAX_WINDOW_SEC` stays as the hard cap for a single over-long cue. On that same track
the planner now produces **35 windows for 38 cues** instead of ~11.

**Gates** (all four, on the tree at the time of the commit): `npx vitest run` — 598 files
passed, 1 skipped; 7,901 tests passed, 6 skipped. `node tools/i18n-check.cjs` — 9,555 English
keys translated in ja/zh/ru. `node tools/architecture-audit.cjs` — 1,829 modules, 18 findings,
nothing new. `npx eslint` on the eight touched paths — clean. `tsc --noEmit` is not a gate
here and was not treated as one; filtered to the touched files it reports zero errors.

Honest note on the vitest number: it is the **shared working tree**, which carries several
other tracks' uncommitted work. Committed HEAD is red with nine known failures that predate
this slice (see `docs/audit/RELAY_BOSS_AUDIT.md`, retry-53). This slice adds no failure.

**Live acceptance** — full detail in `src/MAIN_V1_EVIDENCE_LEDGER.md`, "Track 6 — the English
subtitle track becomes the Japanese cue grid". In short: a real 305 s podcast with human EN and
JA sidecars, fused end to end through the queue — `queued → preparing → extracting-audio →
transcribing 0…35/35 → done`, a 35-cue `fused-ja.srt` on the English track's own timestamps,
a record carrying `derivation: 'en-ja-fusion'` with both human tracks preserved, zero
error-level log entries. **CER 4.86 %** against the human Japanese track (72 edits over 1,482
characters) — informational, not the F7 gate, which still has to beat raw-Whisper and MT-only
CER on ≥2 episodes.

**Status against §6 "What done means":** (1) F1/F2 done, F3–F6 open — F6 writes the SRT and
record but not the per-cue confidence sidecar, which has nothing to carry until F4 scores.
(2) done. (3) not started. (4) done for this slice's scope. (5) done.

**Next stage: F3** — the per-cue EN→JA reference translation through `main/translate.ts`'s
batch API. Note for whoever takes it: the fixture used here has a **human Japanese track
alongside the English one**, which makes it the first real F7 evaluation candidate.

### F3 + F4 — the reference translation, and the scoring that makes it matter — 2026-08-14, primary

**Why the two stages landed together.** F3 on its own produces a per-cue translation that
nothing reads. That is precisely the failure mode this repo's Wiktextract importer names in its
own header — "writing rows no query consults is how a database grows data that is never wrong
because it is never used" — and the same session had just spent a slice fixing a schema table
that had sat unread for seven versions. F4 is what turns the reference into a decision, so it is
what makes F3 observable.

**What landed.**

- `src/shared/subtitleFusionCore.ts` (pure, extended): `normalizeForFusionCompare`,
  `bigramDice`, `decideFusedWindow`, `decideFusedWindows`, `meanFusionConfidence`,
  `windowSourceText`, the `FusionBasis` union and `FUSION_AGREE_SCORE`.
- `src/main/transcriptionJobs.ts`: `translateWindowReferences` plus the F3/F4 steps in
  `runFusionJob`, and `confidence` on the emitted `SubtitleRecord`.
- `src/shared/__tests__/subtitleFusionScoring.test.ts` — 18 tests.

**The policy, in one sentence, and where it is enforced.** Whisper's text wins; the reference is
a referee, not an author. Offline — which is the only path until F5 — a disagreement still yields
Whisper's words, at `basis: 'whisper-unverified'` and reduced confidence. Mutation-checked:
changing that one `text: whisperText` to `text: referenceText` turns the policy assertion red
with `Received: "完全に無関係な文章です"`. The single case where the reference supplies text is
the one where Whisper supplied none (`basis: 'reference'`), which is also the only user-visible
behaviour change from F2: a window Whisper returned nothing for now carries the translated
English line instead of vanishing from the track.

**Decisions taken, and the reasoning.**

1. **One translation per ASR *window*, not per cue.** A merged window's transcript covers several
   English lines. Scoring it against a per-cue translation would be structurally unfair, and
   translating cues separately then gluing them yields Japanese that reads as a list of
   fragments. `windowSourceText` joins a window's cues into one passage.
2. **The local translator, not a cloud provider.** The reference only has to carry meaning well
   enough to disagree usefully with a misheard transcript. An episode has hundreds of windows;
   a cloud call each is not a cost this stage can justify. Cloud is F5, on disputed cues only.
3. **`FUSION_AGREE_SCORE = 0.34`, and it is provisional — F7 calibrates it.** Set low
   deliberately: the two strings compared are not two attempts at the same sentence but a
   transcript and a machine translation *of a translation*, so even a perfect pair shares only
   content words. A high threshold would mark almost every correct cue as disputed, and a scorer
   that flags correct lines is worse than no scorer.
4. **Bigrams, not characters or words.** Japanese has a small alphabet and a high base rate of
   coincidental single-character overlap (の, に, し appear in unrelated sentences). Words would
   need a tokenizer, which would drag a dictionary into a pure module. A one-character string has
   no bigrams and is compared as itself, so every はい and ええ does not score 0 against
   everything.
5. **Katakana folds to hiragana; the prolonged sound mark ー is kept.** Whisper writes ジュース
   where the translator writes じゅーす often enough that not folding would flag correct cues.
   ー is a mora, not punctuation — dropping it would merge ビル and ビール, which is asserted.
6. **`meanFusionConfidence` excludes dropped windows rather than counting them as zero.** They
   are not lines the track claims badly; they are lines it does not claim at all.
7. **Every translator failure yields empty references, never an exception.** No model installed,
   a cancelled batch, a declined chunk, or a throw all degrade to exactly the F2 output with
   every cue marked `whisper`. Asserted directly (`decideFusedWindows([...], [])`). The plan
   makes offline degradation a hard requirement, so this is the stage's load-bearing property.

**Gates** — run once after the turn's last slice, on the shared working tree.
`npx vitest run --testTimeout=60000 --hookTimeout=60000`: **601 passed / 1 skipped files, 7,937
passed / 6 skipped tests**, exit 0. `node tools/i18n-check.cjs`: exit 0 at **9,557** English keys
translated in ja/zh/ru (this slice adds no user-visible string — the confidence it produces is a
number on an existing record, and the phase labels are unchanged, which is why F8's
`'translating'`/`'fusing'` phases still have not landed). `node tools/architecture-audit.cjs`:
exit 0, **1,834 modules, 18 findings, nothing new**, 2 known pending. `npx eslint` on the 15
touched paths: clean apart from two pre-existing `adjacent-overload-signatures` errors in
`src/renderer/window.d.ts`, which were **reproduced at HEAD** (`git show
HEAD:src/renderer/window.d.ts` lints to the same two identities) and belong to another track.

Honest note on the vitest number, unchanged from the F1/F2 entry: that is the **shared working
tree**, which carries several other tracks' uncommitted work. Committed HEAD is red with nine
long-standing failures that predate this slice and belong to other tracks. This slice adds no
failure identity.

**Live acceptance: not run for this slice, and that is a gap, stated rather than papered over.**
F1/F2's acceptance was a full end-to-end fusion of a real 305 s episode. Repeating it here needs
the whole Whisper pass plus a local translator load, and the turn's budget went to the Track 2
etymology slice's live QA (which did run, in full, on the real install). What *is* verified: the
pure decision layer is exhaustively unit-tested and mutation-checked, and the job wiring is a
straight-line substitution — `texts` → `decisions.map(d => d.text)` into the same
`windowCuesToSubtitleCues` call F2 already proved live.

**What the next session should do first:** a live fusion run on the same podcast fixture, and
compare its `fused-ja.srt` against F1/F2's. The expected difference is narrow and checkable —
windows that were dropped for an empty transcript should now carry Japanese, the record should
carry a non-zero `confidence`, and no window that previously had text should have changed. If a
line that Whisper produced has changed, the referee has become an author and that is a defect.

**Status against §6 "What done means":** (1) F1–F4 done, F5 and F6's confidence sidecar open.
(2) done. (3) not started — F7 is now the gating unknown, since `FUSION_AGREE_SCORE` and the
confidence constants are all provisional until it runs. (4) **not** done for this slice; see
above. (5) done.

**Next stage: F6's per-cue sidecar**, which is now the cheapest remaining piece — `decisions`
already carries `{basis, score, confidence}` per window and nothing persists it. F5 needs a cloud
key and a schema; F7 needs real media and the Whisper runtime.

### F6 + F8 — the sidecar, its reader, and a way to start a fusion — 2026-08-15, backup

**Landed:** `9c21a98` (sidecar + a unit fix), `0d92f69` (the sync gate's missing modules),
`112e1f5` (IPC reader + media-library UI, i18n ×4).

**Decisions.**

1. **Sidecar indexed by cue, not by window.** A merged window yields one cue and a dropped one
   yields none, so window indices do not survive the SRT write. `windowDecisionsToFusedCues` is
   now the single skip rule and `windowCuesToSubtitleCues` is defined in terms of it — two
   independent skip rules would silently shift every badge after the first drop.
2. **Sidecar path derived (`fusionMetaPathFor`), not stored on `SubtitleRecord`.** A path recorded
   twice can disagree with itself, and records written before F6 would carry nothing anyway.
   Tradeoff: renaming the track file orphans the sidecar; the job always writes both.
3. **Reading is total.** Missing / truncated / hand-edited / future-version → `null`; one corrupt
   cue is dropped rather than failing the file. `transcription:fusionMeta` collapses all four
   "no sidecar" causes into `null` because no surface needs to tell them apart.
4. **F8's entry point landed with F6** rather than after F5/F7: the sidecar needed a reader in the
   same turn (dead-data rule), and a reader needs a surface a user can reach.

**A unit bug F4 shipped, now fixed.** `SubtitleRecord.confidence` is documented and rendered as a
**0–100** match score; F4 wrote the 0–1 fusion mean straight into it, so a track at 0.52 displayed
as **"1% match"**. `fusionConfidencePercent` converts and clamps. Live-confirmed as "совпадение 52%".

**A broken committed tree, found while staging and fixed.** `src/shared/subtitleSync.ts` and
`src/main/subtitleSync.ts` were **never committed** — untracked in the shared tree while committed
`transcriptionJobs.ts` imported both since F1. Every gate run in that tree was green and a fresh
checkout could not resolve the fusion job at all. `0d92f69` lands them plus their 24 tests. Proof:
a transitive resolve of every relative import from `HEAD:src/main/transcriptionJobs.ts` against
`git ls-files` now visits **92 modules with nothing missing**.

**Gates**, run once after the last slice, on the shared working tree. `npx vitest run
--testTimeout=60000 --hookTimeout=60000`: **603 passed / 1 skipped files, 7,961 passed / 6 skipped
tests**, exit 0. `node tools/i18n-check.cjs`: exit 0 at **9,564** English keys translated in
ja/zh/ru. `node tools/architecture-audit.cjs`: exit 0, **1,837 modules, 18 findings, nothing new**,
2 known pending. `npx eslint` on the 8 touched paths: clean apart from the two pre-existing
`adjacent-overload-signatures` errors in `src/renderer/window.d.ts`, reproduced at HEAD (lines
1545/1548 there) and belonging to another track. Same honest caveat as the entries above: that
vitest number is the shared dirty tree.

**Live acceptance** (owned dev app, bridge on 39273). `window.api.fusionTrackMeta` invoked against
the **real main handler** — a real media id with a real non-fused track, an unknown track, an
unknown item, empty strings and nulls all returned `null`, none threw, which is what proves the
handler is registered rather than merely bridged. The real Vite-transformed `MediaDetailPanel`
mounted off-screen against live IPC: with no English track the fuse button renders
("Свести EN → JA", the install is in Russian), `disabled=true`, and the reason line is shown; with
an English track present it is enabled and the reason line is gone; the fused row reads
`jaJA (fused from EN + Whisper)Сгенерировано · SRT · совпадение 52% · Сгенерировано машиной`.

**Two things NOT proven, stated rather than papered over.**

1. **The badge itself has no live evidence.** The probe tried to stub `window.api.fusionTrackMeta`
   to feed the panel a synthetic sidecar; `window.api` is a **frozen, non-configurable**
   contextBridge object, so the assignment silently no-opped and the real handler answered `null`
   for a fabricated record id. The resulting `badgeShown:false` is a **false negative — do not
   record it as a defect.** Proving the badge needs a genuine fused record, i.e. a real fusion run.
2. **No end-to-end fusion run this turn.** This install's library has 30 items, 5 with subtitles,
   and **not one English track** — the F1/F2 podcast fixture is not in it. There is also no IPC to
   attach an arbitrary subtitle record; the honest route is dropping an English `.srt` beside a
   video and running discovery. Keep the English track to ~3 cues: `planAsrWindows` derives windows
   from the cues, so a 3-cue track is a 3-window Whisper pass, not a 24-minute one.

**Status against §6 "What done means":** (1) F1–F4 and F6 done, F5 open. (2) done. (3) not started
— F7 is still the gating unknown; `FUSION_AGREE_SCORE` and the confidence constants stay
provisional. (4) partial, see above. (5) done.

**Next stage: F7's evaluation harness**, and the live badge run above is the cheapest way in —
building the fixture (English sidecar + discovery) is the same setup F7 needs anyway. F5 remains
behind a cloud key and a schema.

### F5 + F7 — the arbiter, and the gate that can fail it — 2026-08-15, primary

**Landed:** `d23ed60` (F5 arbitration), `a02ddb5` (F7 scoring + CLI harness), `1abb17c` (a real
fusion run can now emit the two baselines the gate scores against).

**F5 decisions.**

1. **Only `whisper-unverified` windows are sent.** An `asr-empty` window has no transcript to
   arbitrate between, so the arbiter would write the line from the English alone — translation
   wearing a transcript's clothes.
2. **A fidelity floor is the mechanical form of "never introduce content present in neither
   candidate".** A verdict under 0.5 bigram Dice against the transcript is discarded; a
   `reference` verdict must be the supplied reference, normalized-equal. Mutation-checked.
3. **Strings beat labels.** A model claiming `whisper-corrected` while returning the identical
   string is recorded `whisper-as-is`. Ids are echoed, not positional — an unknown or repeated id
   is dropped, so a reordered answer cannot shift verdicts onto the wrong cues.
4. **Spend is bounded**: 160 windows/job, worst disagreement first, 16/request, no retry.
5. **Sidecar declares version 2 only when it holds an arbitrated basis.** An offline-only track
   stays v1-readable; the files a v1 reader would *misread* are exactly the ones it now refuses.
6. `fusionCueCounts` gained `corrected`, rendered as its own line in the media library (i18n ×4)
   rather than folded into the uncertain warning — the line is trusted, but it is text no
   microphone produced.

Offline degradation is reached by doing nothing: no key / no disputes / 502 / prose / cancelled
all end at zero verdicts, and `applyFusionArbitration(d, [])` is the identity on F4's decisions.

**F7 decisions.** `documentCer` (whole track, time-ordered) gates; `alignedCer` (per reference cue
by overlap) is reported but does **not** gate — it punishes the fused track for borrowing the
English grid, which is the design the feature rests on. Fused must beat both baselines
**strictly** (a tie means fusing bought nothing) on **every** episode, and under two episodes is
its own reason string so a thin run cannot read as green. The CLI bundles the real
`subtitleFusionEval.ts`/`subtitleCues.ts` with esbuild (tools/grammar-audit.cjs's pattern), so
there is no second SRT parser to drift.

**CLI verified end to end** on synthetic tracks, not only unit tests: 1 episode → accuracy PASS
but gate FAIL, exit 1; 2 → PASS, exit 0; fused swapped with its own baseline → `ep2: fused CER
0.2500 does not beat whisperOnly 0.0000`, exit 1.

**Gates** (once, after the last slice, shared working tree — same caveat as every entry above:
committed HEAD carries other tracks' long-standing failures). vitest: first run **1 failed / 606
passed / 1 skipped files, 8,011 passed / 6 skipped tests**, and the one failure was *mine* —
`architectureBaseline.test.ts` flagged `subtitleFusionEval.ts` as test-only, because the CLI loads
it through esbuild and the static import graph cannot see that. Classified `accepted` in
`tools/architecture-baseline.json` with the reason and a delete-me-too condition, not silenced;
re-run after the third slice fully green: **607 passed / 1 skipped files, 8,015 passed / 6 skipped
tests, exit 0**. i18n-check exit 0 at **9,568** keys. architecture-audit exit 0, **1,843 modules,
19 findings, nothing new**, 2 known pending. eslint clean on the eleven touched TS paths;
`tools/fusion-eval.cjs` emits the same three `no-var-requires` identities every `.cjs` tool here
does — reproduced on `tools/grammar-audit.cjs` and `tools/i18n-check.cjs` at HEAD, and `npm run
lint` is `--ext .ts,.tsx`, so tools are outside the project gate entirely.

**Not proven, stated plainly.** No live run this turn: F5's real path needs a cloud key and F7
needs real media plus the Whisper runtime, and this install still has **no English subtitle
track** (see the F6/F8 entry). The arbiter's HTTP call is therefore covered by an injected seam,
not by a real provider response.

**Status against §6:** (1) **F1–F6 all done.** (2) done. (3) harness built and self-verified, but
**never run on a real episode** — this is now the only substantive gap. (4) partial, unchanged.
(5) done.

**Next stage: run F7 for real** — now unblocked on the code side by `1abb17c`. Set
`JP_FUSION_EVAL=1` before starting the app and one fusion writes
`fused-ja.srt` plus `fused-ja.whisper-only.srt` and `fused-ja.mt-only.srt` under
`userData/subtitles/<mediaId>/`; point `tools/fusion-eval.cjs --manifest` at those three plus the
human JA track. What is still missing is **input, not code**: one media item carrying both an EN
track and a human JA track, on two episodes. Cheapest route remains the F6/F8 entry's — drop a
short English `.srt` beside a video and run discovery. Keep the EN track small on the first pass;
`planAsrWindows` derives windows from cues, so a 3-cue track is a 3-window Whisper pass.
