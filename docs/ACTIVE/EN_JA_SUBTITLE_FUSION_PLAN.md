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
