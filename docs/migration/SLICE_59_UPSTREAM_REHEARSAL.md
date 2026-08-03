# Slice 59 — upstream-sync rehearsal

**Date:** 2026-08-02 · **Phase 9 item:** *upstream-sync rehearsal against a newer Seanime commit
with conflicts documented* · **Status:** in progress, written as measured

> Method note. Everything below is measured from PowerShell against a **scratch clone in the OS
> temp dir**. The pinned checkout `C:\Users\Arseniy\Projects\seanime-upstream` was **never written
> to** — not fetched into, not branched, not checked out. See §1.

---

## 0. Headline — the brief's premise does not hold

The brief says *"Fetch upstream and pick a newer commit."* **There is no newer commit.**
The pin `9bdd052` is the tip of `main` and strictly contains every other branch upstream has.

Measured from the server with `git ls-remote` (authoritative — unaffected by shallow clones),
2026-08-02:

| upstream ref | commit | date | ahead of pin | behind pin |
|---|---|---|---|---|
| `refs/heads/main` | `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9` | 2026-07-23 12:15:22 +0200 | — | — |
| `refs/heads/next` | `09ab9d5ffa175cb211e73fd591a470f334bb9b85` | 2026-07-15 17:49:05 +0200 | **0** | 14 |
| `refs/heads/next-mpv-prism` | `d73d9ec84548d5f418164c568e9908ea3366809f` | 2026-07-04 16:15:46 +0200 | **0** | 58 |

```
git merge-base --is-ancestor origin/next origin/main   -> exit 0   (next is contained in main)
git rev-list --count origin/main..origin/next          -> 0
git rev-list --count origin/main..origin/next-mpv-prism-> 0
```

The pin is **the newest commit in the public repository**, on every branch, as of 2026-08-02.
Upstream `main` has not moved in the 10 days since the pin was taken. The newest tag is `v3.9.1`
(`46d7aec`), which is *also* behind the pin.

**Consequence:** a forward-looking "re-apply against a newer commit" rehearsal is not executable
today — not because of a tooling limit, but because the input does not exist. §2 explains what was
run instead and why it measures the same quantity.

---

## 1. The pinned checkout was never touched

Rather than fetch into `seanime-upstream` and restore it afterwards, the entire rehearsal ran in a
throwaway clone, so "the pin did not move" is structurally true rather than something undone at the
end.

Baseline captured before any command ran (PowerShell):

```
.git/HEAD                 9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9   (raw sha, detached)
git rev-parse HEAD        9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9
git for-each-ref          (empty — the checkout has no refs at all)
.git/shallow              9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9   (depth-1 shallow clone)
git rev-list --count HEAD 1
dirty:  M seanime-web/public/jassub/jassub-worker.js
        M seanime-web/src/routeTree.gen.ts
       ?? seanime.exe
       ?? seanime.exe.pre-patches-20260727
sha256  jassub-worker.js   8B16FA788BE8CA5D36571539DBF6915018FBBC46F095277770126F0BC791AAC9
sha256  routeTree.gen.ts   484378B66FF3BB6C64CC0E2021EB0B5B80C8848644746196909FE005707EC9D3
```

Note for future sessions: the pinned checkout is a **depth-1 shallow clone with zero refs**. It
cannot answer any history question — no `git log`, no blame, no `origin/main`. Any future real
re-sync must fetch history first, or work in a separate clone as this slice did.

Scratch clone used instead:
`%TEMP%\claude\...\scratchpad\sync59` — `git init` + `git remote add origin` +
`git fetch --shallow-since=2026-05-15 origin main next next-mpv-prism` (4.5 s, 106 commits back to
2026-06-07).

---

## 2. What was run instead, and why it measures the same thing

`git apply` succeeds or fails on the **difference between two trees**, not on the direction of
time. A patch authored against tree `T` failing on tree `T-k` and a patch authored against `T-k`
failing on tree `T` are the same measurement of context divergence, taken from opposite ends.

So the rehearsal replays the four patches **backwards** across the real upstream commits that
touched the files they patch. Each rung answers a concrete question:

> *"If Study OS had pinned here instead, what would the upstream work between there and the pin
> have cost us?"*

That is the Phase 9 question — what a re-sync costs — answered with real upstream code rather than
a synthetic edit, and it is available today. It does not predict any specific future commit; it
measures how exposed each patch's context is to the kind of churn upstream actually produces.

### 2.1 Measured churn on the patched files

106 upstream commits, 2026-06-07 → 2026-07-23 (the pin). Commits touching each patched file:

| patch | file | commits in window |
|---|---|---|
| 0001 | `seanime-web/.../video-core/video-core-subtitles.ts` | **6** |
| 0003 | `seanime-web/.../video-core/video-core-events.ts` | 3 |
| 0003 | `seanime-web/.../video-core/video-core.tsx` | **7** |
| 0002 | `internal/directstream/subtitles.go` | **7** |
| 0002 | `internal/directstream/subtitles_test.go` | 5 |
| 0004 | `internal/directstream/localfile.go` | 4 |
| 0004 | `internal/directstream/manager.go` | 2 |
| 0004 | `internal/directstream/stream.go` | **9** |
| 0004 | `internal/handlers/directstream.go` | 2 |

These are not quiet files. `internal/directstream/stream.go` took 9 commits in 7 weeks. The single
most dangerous upstream commit for us is `f380516` *"refactor(directstream): improve subtitle
stream handling around seeks"* (2026-07-11) — it touched **five** of the nine files, spanning all
four patches at once.

Upstream commits landing in the window, by relevance to our patches:

| commit | date | title | patched files touched |
|---|---|---|---|
| `e400036` | 07-21 | fix(mpvcore): eof detection | subtitles.go, localfile.go, stream.go |
| `09ab9d5` | 07-15 | feat(mediacore): skip patterns | video-core.tsx |
| `537d097` | 07-13 | fixes | stream.go |
| `f380516` | 07-11 | **refactor(directstream): improve subtitle stream handling around seeks** | subtitles.ts, events.ts, subtitles.go, subtitles_test.go, stream.go |
| `2eb9a0c` | 07-10 | feat(directstream): optimize VideoCore subtitle seek performance using matroska cues | subtitles.ts, subtitles.go, subtitles_test.go, stream.go |
| `9e33706` | 07-07 | fix(videocore): subtitle renderer race | subtitles.ts |
| `e723ac7` | 07-08 | fix: nakama | subtitles.go, stream.go |
| `b09257d` | 06-24 | feat: faster stream startups, redesigned playback pill | video-core.tsx, stream.go |
| `ae92bc8` | 06-23 | refactor: remove mediacore types | subtitles.go, subtitles_test.go, localfile.go, stream.go |
| `8b5c6bb` | 06-21 | feat: mpv-prism | video-core.tsx, subtitles.go, subtitles_test.go, localfile.go, manager.go, stream.go |

---

## 3. Control run — all four patches at the pin

Scratch clone checked out at `9bdd052`, pristine. Each patch was `--check`ed, then **actually
applied**, then the resulting diff measured — because a patch that reports "applied" and a patch
that changed nothing are indistinguishable from an exit code alone.

| patch | verdict | lines actually changed | files |
|---|---|---|---|
| 0001 | **CLEAN** | `+127 −0` | video-core-subtitles.ts |
| 0002 | **CLEAN** | `+12 −2`, `+13 −0` | subtitles.go, subtitles_test.go |
| 0003 | **CLEAN** | `+23 −0`, `+7 −1` | video-core-events.ts, video-core.tsx |
| 0004 | **CLEAN** | `+9`, `+4`, `+30`, `+4`, +1 new file | localfile.go, manager.go, stream.go, handlers/directstream.go, open_generation_test.go |

All four apply and all four demonstrably change lines. The control holds.

### 3.1 Two documentation defects found in `patches/seanime/README.md`

Counted directly from the patch bodies (`+` lines excluding `+++` headers):

| patch | README claims | **actual** |
|---|---|---|
| 0001 | "**Shape:** 94 insertions, 0 deletions" | **127 insertions, 0 deletions** |
| 0004 | "**Shape:** 121 insertions, 0 deletions" | **116 insertions, 0 deletions** |
| 0003 | "30 insertions, 1 deletion" | 30 insertions, 1 deletion ✔ |
| 0002 | (no claim) | 25 insertions, 2 deletions |

The patches grew/shrank after those lines were written. Nothing is broken by this — but the README
is the document a future re-syncer reads to decide how big a job they are facing, so both numbers
should be corrected. **Not corrected by this slice** (see §7).

### 3.2 `0001`'s hunk headers are internally inconsistent

`git apply --verbose` reports, against a **pristine** `9bdd052`:

```
Hunk #2 succeeded at 72 (offset 1 line).
Hunk #3 succeeded at 145 (offset 1 line).
Hunk #4 succeeded at 176 (offset 1 line).
Hunk #5 succeeded at 244 (offset 1 line).
```

This is **not** tree drift — it reproduces against the exact tree the patch was authored against.
Walking the headers, hunk 1 is `@@ -51,6 +51,17 @@` (+11 lines), so hunk 2's new-side start should
be `61 + 11 = 72`, but the header declares `71`. The same one-line deficit carries through hunks
3–5 and is silently corrected by hunk 6. That is the signature of a **hand-edited patch whose hunk
headers were never regenerated**.

`git apply` tolerates it because it matches on old-side context, not on declared line numbers.
Consequence for a future re-sync: this offset noise is a permanent 1-line background hum that
**masks genuine drift** — a real 1-line displacement in hunks 2–5 would be invisible against it.
`0001` should be regenerated with `git diff` rather than hand-maintained.

---

## 4. The ladder — where each patch actually breaks

Each rung checks out the tree **immediately before** a named upstream commit landed, and answers:
*"if Study OS had pinned here, what would the work up to `9bdd052` have cost?"* All four patches
were run at every rung.

| rung (tree just before) | date | 0001 | 0002 | 0003 | 0004 |
|---|---|---|---|---|---|
| `9bdd052` — **the pin (control)** | 07-23 | clean | clean | clean | clean |
| `e400036^` = `4fc27a0` | 07-21 | clean | clean | clean | clean |
| `537d097^` = `20cb641` | 07-13 | clean | clean | clean | clean |
| `f380516^` = `6b07e3a` — *before the big directstream refactor* | 07-11 | clean | clean | clean | clean |
| `2eb9a0c^` = `7a4d200` | 07-10 | clean | clean | clean | clean |
| `e723ac7^` = `1490d0a` | 07-08 | clean | clean | clean | clean |
| `9e33706^` = `dbf3446` | 07-07 | clean | clean | clean | clean |
| `b09257d^` = `14efba1` | 06-23 | clean | clean | clean | clean |
| `ae92bc8^` = `2e45980` | 06-22 | clean | clean | clean | clean |
| `8b5c6bb^` = `315c8c9` | **06-16** | clean | clean | clean | **FAILED** |

**Result: 0001, 0002 and 0003 survive every rung — 37 days and ~100 upstream commits of
divergence, including the refactor upstream explicitly named after the subsystem they patch.**
0004 is the only patch that breaks, and it breaks at exactly one place.

### 4.1 The one real conflict — 0004 vs `8b5c6bb` "feat: mpv-prism"

```
Checking patch internal/directstream/stream.go...
error: while searching for:
	})
}

func (m *Manager) BeginOpen(clientId string, step string, onCancel func()) bool {
	return m.BeginOpenWithTarget(clientId, step, onCancel, m.GetPlaybackTarget())
}

error: patch failed: internal/directstream/stream.go:87
error: internal/directstream/stream.go: patch does not apply
```

- **Patch:** `0004-directstream-open-generation.patch`
- **Hunk:** `stream.go` hunk **#1** of 1 (`@@ -87,6 +87,36 @@`). The other four files in 0004
  (`localfile.go`, `manager.go`, `handlers/directstream.go`, the new `open_generation_test.go`)
  all applied cleanly — `git apply --reject` confirms *"Applying patch internal/directstream/stream.go
  with 1 reject... Rejected hunk #1"* and clean applies for the rest.
- **Upstream change that causes it:** `8b5c6bb` *feat: mpv-prism* (2026-06-21) split `BeginOpen`
  into a thin delegator plus a new `BeginOpenWithTarget`:

  ```go
  // before 8b5c6bb (315c8c9)          // at the pin (9bdd052)
  func (m *Manager) BeginOpen(...) {   func (m *Manager) BeginOpen(...) bool {
      // full implementation               return m.BeginOpenWithTarget(..., m.GetPlaybackTarget())
      m.playbackMu.Lock()              }
      ...                              func (m *Manager) BeginOpenWithTarget(..., target PlaybackTarget) bool {
  ```

  0004 inserts `AcceptOpenGeneration` immediately *above* `BeginOpen` and uses the **post-split
  two-line body** as its trailing context. Before the split that body does not exist.
- **Does the patch's intent still hold against the older code? YES.** The hunk is **purely
  additive** — it inserts a new method and modifies nothing. The insertion point (after
  `getStreamHandler`) is present in both trees; only the trailing context differs.
  **Rework cost: re-anchor the hunk. Minutes, no design decision.**

### 4.2 A clean apply that needed checking — 0001 at offset +232

From rung `9e33706^` downward, `git apply` reported:

```
Hunk #5 succeeded at 475 (offset 232 lines).
```

An offset that large is exactly the case where "exit 0" can mean *applied in the wrong place*, so
it was verified rather than accepted:

| tree | file length | `destroy()` at | `"Destroying subtitle manager"` occurrences |
|---|---|---|---|
| `9bdd052` (pin) | 1216 lines | line **218** | **1** |
| `dbf3446` (`9e33706^`) | 1206 lines | line **449** | **1** |

`destroy()` genuinely moved ~231 lines within the file, and hunk 5's anchor string is **unique in
both trees**. git matched the correct function. Not a mis-apply.

> **Reusable rule this establishes:** a large `git apply` offset is safe **iff** the hunk's anchor
> text is unique in the target file. Verify uniqueness, don't trust the exit code. `0001` hunk 5
> anchors on `subtitleLog.info("Destroying subtitle manager")`, which is unique — it is a
> well-anchored hunk, and that is *why* it tolerates 232 lines of motion.

---

## 5. Coverage gap found in 0004 while tracing the conflict

Not a conflict, but found by reading the code the conflict pointed at, and more consequential than
the conflict itself.

`AcceptOpenGeneration` is consulted in exactly one place — `HandleDirectstreamPlayLocalFile`. But
at the pin, **six** call sites reach the destructive `BeginOpen` → `beginSubtitleSeek` path:

```
internal/directstream/localfile.go:296     PlayLocalFile      <- guarded by 0004
internal/directstream/nakama.go:55                            <- UNGUARDED
internal/directstream/urlstream.go:50                         <- UNGUARDED
internal/debrid/client/stream.go:120                          <- UNGUARDED
internal/torrentstream/stream.go:152                          <- UNGUARDED
internal/directstream/stream.go:210        PrepareNewStream   <- UNGUARDED
```

`BeginOpenWithTarget` has exactly one caller at the pin (`BeginOpen` itself), so there is no bypass
*below* the guard today. But the guard sits above only one of six entry points. For Study OS this
is currently fine — it only drives `play/localfile`. It is worth stating plainly in the patch
README before upstream submission, because an upstream reviewer will ask, and because **if upstream
ever adds a direct `BeginOpenWithTarget` caller the guard is silently bypassed**. The durable fix
for submission is to move the check inside `BeginOpenWithTarget`, which is the single choke point.

---

## 6. Can any patch be retired? — every premise re-verified against the pinned code

The brief flags this as the finding that is easiest to miss: *a patch that applies cleanly but
whose reason has been fixed upstream*. Each patch's stated premise was therefore re-checked
against the pinned source itself, not against `patches/seanime/README.md`.

**None of the four can be retired. All four premises are intact at `9bdd052`.**

| patch | premise | verified at the pin | retire? |
|---|---|---|---|
| 0001 | no active-cue signal exists | `cuechange` 0 hits, `getActiveCues` 0 hits, `activeCue` 0 hits in `video-core-subtitles.ts` | **no** |
| 0002 | terminal batch is stopped before it is flushed | `subtitles.go:587 subtitleStream.Stop(true)` → `:589 flushBatch(false)` — stop still precedes flush | **no** |
| 0003a | the "Override active player" effect is a self-assignment | `video-core.tsx:1016-1021` verbatim, `activePlayer === props.id` unchanged | **no** |
| 0003b | a stream present at mount is never announced | `dispatchVideoLoadedEvent()` at `video-core.tsx:1012`, inside the `useUpdateEffect` opened at `:954` and closed at `:1014` — still the sole caller, still mount-skipping | **no** |
| 0004 | nothing can refuse a stale open | see §6.1 — upstream has a *differently scoped* generation, which does **not** cover it | **no** |

The README's section line references (`§954`, `§1016-1021`, `§1038`) are all still accurate at the
pin. Only its insertion counts are stale (§3.1).

### 6.1 The near miss — upstream *does* have a "generation", and it is not ours

Searching the pinned `internal/directstream` for generation-like ordering turns up a substantial
existing upstream mechanism, introduced **before** the pin by the `f380516` / `2eb9a0c` subtitle-seek
work:

```
stream.go:616            subtitleGeneration  atomic.Int64
subtitles_test.go:112    TestBeginSubtitleSeekCancelsPreviousGeneration
subtitles_test.go:136    TestStartSubtitleStreamPRejectsStaleGeneration
subtitles_test.go:152    TestSendSubtitleEventsRejectsStaleGeneration
```

At a glance this looks exactly like what 0004 adds, and a future re-syncer skimming for "does
upstream do generations now?" would plausibly retire 0004 on the strength of it. **That would be
wrong**, for two independent reasons, both read out of the code:

1. **It is scoped to a single stream.** `subtitleGeneration` is a field on **`BaseStream`**
   (`stream.go:598`). 0004's defect is a *stale open* — a request that replaces the whole stream.
   A counter that lives on the stream being replaced cannot order events across its own
   replacement.
2. **It does not gate the destructive step.** `beginSubtitleSeek` allocates the generation and then
   stops every active subtitle stream **unconditionally**:

   ```go
   func (s *BaseStream) beginSubtitleSeek(seekTime float64) subtitleRequest {
       ...
       request := subtitleRequest{ generation: s.subtitleGeneration.Add(1), ... }
       s.activeSubtitleStreams.Range(func(_ string, value *SubtitleStream) bool {
           value.Stop(false)          // <- no generation check guards this
           return true
       })
       return request
   }
   ```

   The generation orders the subtitle work that happens *after* the stop (start/send reject stale
   generations). The stop itself is never refused. 0004 is precisely a guard placed *before* the
   destructive step, at open scope.

**So the two mechanisms are complementary, not redundant** — upstream orders subtitle requests
within a stream; 0004 orders opens across streams.

**Actionable consequence for upstream submission:** the word "generation" is already taken in this
package, at a different scope. 0004 introduces `openGeneration` / `AcceptOpenGeneration` into the
same package, and a reviewer will conflate the two unless the distinction is stated up front. The
submission text should name upstream's `subtitleGeneration` explicitly and say why it does not
cover the open-ordering case. This is new information that neither the patch header nor
`patches/seanime/README.md` currently contains.

---

## 7. The rework cost of 0004, measured rather than asserted

§4.1 claims the fix is "re-anchor the hunk, minutes, no design decision". That claim was then
actually performed, because an estimate of rework is worth much less than a performed rework.

At `315c8c9` (the tree where 0004 breaks), the 30 added lines were extracted from the real patch
and re-inserted above the anchor line `func (m *Manager) BeginOpen(` — a line that is **byte-identical
in both trees** — and the result diffed back out into a re-anchored patch:

```
--- apply re-anchored hunk to a pristine 315c8c9 ---
Checking patch internal/directstream/stream.go...
git apply --check   exit 0
git apply           exit 0
changed             30      0       internal/directstream/stream.go
AcceptOpenGeneration present: 1
```

| | original hunk | re-anchored hunk |
|---|---|---|
| header | `@@ -87,6 +87,36 @@` | `@@ -84,6 +84,36 @@` |
| added lines | 30 | **30, byte-identical** |
| trailing context | post-split `BeginOpen` delegator body | pre-split `BeginOpen` implementation body |

**The entire rework is a context swap. Not one line of the patch's own content changes.** That is
the measured cost, and it is the cheapest class of conflict there is.

> The re-anchored patch is kept at
> `%TEMP%\claude\...\scratchpad\0004-stream-go-reanchored.patch` as evidence. It is **not** added to
> `patches/seanime/` — it targets an older tree than the pin and would be actively wrong to apply
> today.

---

## 8. Gate totals — measured this session

Run against the working tree at the end of this slice. **This slice changed no code**, so these are
confirmations, not deltas.

| gate | measured | baseline in brief | verdict |
|---|---|---|---|
| `npx vitest run` | **365 files / 4622 tests passed**, exit 0 | 365 / 4622 | match |
| `node tools/i18n-check.cjs` | **6587 English keys**, all translated, exit **0** | 6587, exit 0 | match |
| `node docs/migration/tools/audit-carried-items.mjs` | exit **0** — *"every carried reason still says what the record says it says"* | exit 0 | **held** |

The audit was run **twice** — before and after the `patches/seanime/README.md` edits in §9 — and
was exit 0 both times. That matters because the audit reads `patches/seanime/`, so a README edit
was capable of moving it.

Architecture (18 findings, "Nothing new") was **not re-run** — this slice added no source files
and no imports, so it has no input to that gate. Stated as not-run rather than assumed unchanged.

### 8.1 One honest caveat on the vitest number

The main session was editing `src/` concurrently while this ran. The 365/4622/exit-0 result is
therefore a measurement of the tree **as it stood at 19:16**, including whatever the main session
had in flight. It matches the brief's baseline exactly, so nothing is obscured — but this slice
cannot claim credit for it, and cannot rule out that a later main-session edit changes it.

---

## 9. Files created or modified

**Created**

| path | what |
|---|---|
| `docs/migration/SLICE_59_UPSTREAM_REHEARSAL.md` | this document |

**Modified**

| path | what |
|---|---|
| `patches/seanime/README.md` | corrected 0001's shape `94 → 127` and 0004's `121 → 116`; added *"Two things slice 59 found that a submitter must say out loud"* (the `subtitleGeneration` conflation trap, the 1-of-6 entry-point coverage gap); added a *"Re-sync durability"* section with the survival table and the two maintenance notes |

**Untouched, deliberately** — `docs/migration/NEXT_SESSION.md`, `docs/migration/progress.json`
(owned by the main session), everything under `src/`, everything under `out/`,
`docs/migration/tools/packaged-a11y-deep-gate.mjs`, and
**`C:\Users\Arseniy\Projects\seanime-upstream`** (§1). No `git add`, no commit, no stash, no
checkout, no revert anywhere in the jp-study-app repo.

**Scratch only** (OS temp, outside the project):
`...\scratchpad\sync59\` (throwaway clone), `...\scratchpad\sync59-run.ps1` (the ladder runner),
`...\scratchpad\0004-stream-go-reanchored.patch` (§7 evidence).

No sidecar was built. Nothing was deployed. `npm run package` was never run.

---

## 10. What a future re-syncer should do differently

1. **Re-run the ladder, don't trust this table.** `sync59-run.ps1` takes a list of commits and
   reports clean/failed plus per-hunk detail for all four patches. Re-point it at the real
   divergence when upstream finally moves.
2. **Do the `subtitleGeneration` check first** (§6.1). It is the one place where a re-syncer is
   likely to retire a still-necessary patch on a plausible-looking match.
3. **Regenerate 0001** before the next sync so its offset noise stops masking drift (§3.2).
4. **Treat `0004` as the fragile one.** It is the only patch that has ever broken, it anchors on a
   function upstream has already split once, and its guard covers 1 of 6 entry points. If it is
   moved inside `BeginOpenWithTarget` it becomes both more correct and more stable.
5. **`0001`/`0002`/`0003` are cheap to carry.** Zero conflicts across ~100 upstream commits and a
   refactor named after their own subsystem. Their anchors are distinctive strings
   (`"Destroying subtitle manager"`, `"Override active player"`), which is *why*.

### The honest bottom line on re-sync cost

Against the only evidence available — real upstream churn — carrying these four patches costs
**one re-anchored hunk per ~100 upstream commits**, and that hunk needs no design decision. The
expensive part of a future re-sync will not be the patches. It will be re-verifying that the
*defects* still exist, which §6 shows takes reading four specific places in upstream source, and
which is exactly what this document records so it does not have to be rediscovered.


