# DEFECT S5 — the fix, and the live leg that is still owed

2026-09-03, backup, main tree, branch `feat/nyaa-subtitles`. Commit **`6d9f0aef`**.

Written here rather than in `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` or
`PERF_BASELINE_RESTART.md` on purpose: both are among the five files the `wt/files-app`
forward merge currently conflicts in, so S5's tag in the plan is left **open** and untouched.

## Mechanism — found by reading, not by inferring from list size

The handoff's standing diagnosis was "3,031 nodes, no virtualisation". That is a symptom, not
the cause: 3,031 memoized rows do not cost ten seconds. Two files answer it exactly.

`VideoCoreSubtitleManager.getCues()` returns a freshly built array of freshly built objects on
every call, and `VideoCoreStudyOverlay`'s `cuechange` handler called it **once per spoken
line** (`VideoCoreStudyOverlay.tsx`, `handleCueChange`). So `allCues` changed identity several
times a minute while describing an unchanged timeline. Two consumers are keyed on that:

1. `VideoCoreTranscriptPanel`'s `rows` is `useMemo(..., [cues])`, and the chunked IPADIC pass
   depends on `rows`. Every cue boundary therefore ran `setTokenRows({})` and restarted the
   pass at row 0 — a `setTimeout(…, 0)` chain 75 links long on a 3,000-cue track, each link
   tokenizing 40 lines and spreading a growing object. It re-armed before it could finish.
   **That is why a `setTimeout` recorder is what caught this: it starves its own queue.**
2. `TranscriptRow` is `React.memo`'d and compares `cue` by identity. New objects meant the
   shallow compare failed on *every* row, so each boundary re-rendered all ~3,000 rows and
   recomputed `readingLine(tokens)` over each — when two rows had changed.

The fix is upstream of both: `sameVideoCoreCueList` / `stableCueList`
(`src/shared/videoCoreStudy.ts`), and every whole-track read in the overlay routed through it.
All five fields are compared rather than length-and-endpoints, because the same setter also
carries a genuine **track swap** — two languages for one release share cue count and near
timings, and a guard that missed it would strand the transcript on the previous language.

## What is proven, and what is not

PROVEN: `src/media/__tests__/cueListIdentityStability.test.ts`, 15 cases. The negative control
is a leg of the suite — the unguarded loop replaces the array on **700 of 700** boundaries and
holds **0 of 700** row memos, against **0** and **700** guarded. Mutation control MEASURED:
unwrap the `cuechange` call site → **2 failed**, restored byte-identical (sha256
`4203459d96a5b2bf…`). Neighbouring suites 13 files / 194 tests passed; eslint 0.

**NOT PROVEN — S5 STAYS OPEN.** The bullet's own gate is live: the 11,769 ms inter-tick gap
falling to the ~1,014 ms floor with the transcript block open. I could not run it, and the
reason is measured rather than assumed: **no subtitle track reached the study layer in a fresh
session for either candidate file.** Date a Live II OVA — player mounts, `readyState` 4,
playing, `.study-cue-overlay` present, but 0 transcript rows, no cue text, and **no subtitle
track select exists at all** (7 selects enumerated with every `<details>` forced open: Whisper
model, existing-subs, audio, workspace mode, card kind, and two torrent-settings selects).
JoJo Ougon no Kaze 39-END — the file on disk is the **`.mp4` RAW**, not the `.mkv` the resume
list records, and it sat on `Waiting for subtitle` for 48 s of playback. So the subject, not
the instrument, is what is missing.

**The next turn opens on this and it is cheap**, because primary2 banked the recipe: mux a
sidecar in with ffmpeg into `C:\Users\Arseniy\Downloads\jp-study\`, `POST
/api/v1/library/scan`, then `POST /api/v1/library/unknown-media {"mediaIds":[N]}` — skip that
seed and the open refuses with "media not found in anime collection". Then arm a 20 s / 1 s
`setTimeout` recorder over two arms on the SAME build: transcript block open vs closed, one
clip playing. A within-build differential is the right gate here; comparing against backup's
2026-09-03 numbers would compare two builds of different ages.

## Traps this turn paid for

- The user's app (pid 47004, 30 h old) **exited during the probe**, at 14:05 EDT, right after
  the HMR reloads my commit caused and one `seanime:media-workspace-open`. I cannot attribute
  it — the `/eval` before it timed out at 30 s, which is itself an S5 symptom. I restarted the
  dev app; the replacement is pid 43436, port 39273. Say this plainly rather than rounding it
  to "the app was restarted".
- `transcriptPanel` is **false** in this profile, and there is no Transcript checkbox in the
  study bar — it lives in the layout customizer's Study category, and it persists.
- PowerShell variables are case-insensitive: `$h` and `$H` are one variable, and a health
  response silently overwrote a headers hashtable mid-script.

## 2026-09-03 (backup) — the live leg, and the cue-identity fix is NOT the whole of S5

Subject: the same OVA, opened dialog-free through `seanime:media-workspace-open`
(`{localFilePath}`) rather than the library card — no ffmpeg mux needed, so the banked recipe
above is unspent. **Renderer reloaded first**, so every renderer module is the working tree;
`/focus` before every arm and `visibilityState`+`hasFocus()` recorded at every tick (`vF` in
all of them), because a hidden window clamps timers to the interval being measured.
Track `FFF (default)`, **2,650 rows**, 123,723 token spans, host subtree **132,021** elements.

| arm | panel | clip | rows | ticks/20 s | longest gap | longtasks |
|---|---|---|---|---|---|---|
| D  | closed | playing | 0     | 20 | **1,038 ms** | 1 / 60 ms |
| E  | open   | playing | 2,650 | 2  | 14,590 ms | 7 / 27,374 ms, max 10,839 |
| E2 | open, follow OFF, tokenizer settled | playing | 2,650 | 6 | **24,952 ms** | 20 / 23,497 ms, max 10,942 |
| F  | open   | **paused** | 2,650 | 19 | 2,193 ms | 14 / 3,619 ms, max 1,366 |
| H  | open, needle `e` | playing | 1,808 | 18 | **2,115 ms** | 34 / 8,255 ms, **max 792** |

**S5 survives the cue-identity fix.** E2 is the worst arm ever recorded on a fresh graph.

**The cause is `data-distance`, not the row count and not virtualisation.** A MutationObserver
over the list caught one cue boundary as a single batch of **2,650 mutations — 2,647 of them
`data-distance`** against exactly 1 `class` / 1 `data-active` / 1 `aria-current`, with
`[data-distance="mid"]` going 2,650 → 3 across that batch. `rowDistance(i, null)` returns
`'mid'` for *every* row, and `activeIndex` is `activeCue?.index ?? null` — so each cue END and
each cue START rewrites the attribute on the whole list and re-renders all 2,650 memoized
rows with their ~47 token spans each. Twice per line.

**Negative control, and it is a product control rather than a patch:** arm H suspends the
banding through the panel's own search box (`distance={needle ? 'mid' : rowDistance(...)}`),
keeping **68 % of the rows and 88 % of the DOM** — 2,115 ms against E2's 24,952 ms, worst
single task 792 ms against 10,942 ms. Not a row-count effect. Arm F is the other control:
same 132,021 elements, same completed tokenizer pass, clip paused — no boundaries, no stall.

**WHY NOTHING IS COMMITTED FOR THIS, and the next worker must not read it as an oversight.**
`rowDistance` / `data-distance` do **not exist at HEAD**: `git show HEAD:…VideoCoreTranscriptPanel.tsx`
has no match, and the whole banding feature is inside that file's **uncommitted +131/−9**
liquid-track redesign. So the defect is in work that is not on the branch, a fix cannot be
staged as HEAD+edit, and a test importing `rowDistance` would not compile on a clean checkout.
The five-line fix is applied **in the working tree only** and re-measured below; whoever
commits that redesign carries it. Do not `git add` that file to land it.

**The fix:** hold the last non-null `activeIndex` as the band anchor. `active` still comes from
the real `activeIndex`, so the highlight clears between lines — only the emphasis bands persist,
which is also what the reader wants: the playhead does not stop existing between two cues.

**Arm E3 — the same measurement with that fix live in the tree.** Identical subject, identical
conditions to E2: 2,650 rows, **131,992** host elements, follow OFF, no filter, clip playing,
`vF` at all 18 ticks.

| | ticks/20 s | longest gap | worst single task | largest MutationObserver batch |
|---|---|---|---|---|
| E2 before | 6  | 24,952 ms | 10,942 ms | **2,650** (2,647 × `data-distance`) |
| E3 after  | 18 | **1,862 ms** | **777 ms** | **73** (4 batches, 97 mutations in 20 s) |

**A 36× smaller largest batch and a 13× shorter worst stall on the same DOM.** E3 also lands
inside arm D's closed-panel floor band (1,038 ms) and arm H's suspended-banding control
(2,115 ms), which is where it should land if the banding was the whole term.

**S5 STAYS OPEN, and this is the reason — not that the number is unproven.** The fix is real
and measured but cannot be committed (see above), so nothing about it is on
`feat/nyaa-subtitles`. Two further things are honestly unsettled and must not be rounded away:

- **A second term cannot be excluded.** The 2026-09-03 FIRST PASS measured 137,254 ms on a
  29.9 h old module graph that predates the 04:06 banding edit entirely. Passes two and three,
  and every arm above, ran on trees that already carried the banding. Whether HEAD's
  bandless panel still stalls needs a detached-worktree app at HEAD; it was not run here.
- The transcript list is still **un-virtualised** — 2,650 `<li>` and 123,723 spans. CLAUDE.md's
  performance rule still points at it. These arms say the row count is not what freezes the
  renderer *today*; they do not say the list is cheap.
