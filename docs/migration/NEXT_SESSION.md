# Next session handoff

## READ FIRST — a harness trap that kills the dev server

**Never put an Electron `--user-data-dir` inside the repo.** A Chromium profile there means
Vite's watcher tries to watch `<profile>/Network/Cookies`, which Chromium holds locked; the
watcher throws `EBUSY` and **the dev server process dies**. It killed the developer's own
running server twice before it was diagnosed, and it presents as "the renderer never became
usable" — nothing like its cause. `music-mining-harness.mjs` now puts its profile in the OS
temp dir (`HARNESS_SCRATCH` overrides). ~~**`retirement-step3-harness.mjs` still has this trap
and has not been fixed.**~~ **Wrong — corrected 2026-08-01.** That harness has *never* had this
trap: `workRoot` is `path.join(os.tmpdir(), ...)` (line 83) and its `userDataDir` hangs off it,
so its profile is already in the OS temp dir. The claim was repeated in the harness's own header
comment too, which is where it probably came from; both are fixed. It **did** have the CDP trap
below, and that is now fixed for real.

Two more things that cost time in the same session, both now fixed in that harness:

- A CDP target filter of `type === 'page' && !url.includes('?')` matches the `about:blank`
  Electron exposes *before* the window navigates. Every `localStorage` read then fails with
  "Access is denied for this document", which reads like a permissions problem and is really
  an attached-to-the-wrong-document problem. Require the scheme too.
- Reading `getComputedStyle(el).opacity` right after `el.focus()` returns the value
  **mid-transition**. A 150 ms reveal measures as `0`, i.e. as a CSS bug that isn't there.

## SLICE 42 — THE ANKI BLOCKER LIFTED AND THE TOOL CAUGHT IT, NOT A PERSON. The rollup's live join has now run: a real interval snapshot from the shipped main-process code, through the shipped rollup, against a live 83-deck collection — and cleaned up after itself.

Evidence: `docs/migration/proof/anki-rollup-20260801203428/anki-rollup.json`. Reproduce (needs
Anki running):

```
node docs/migration/tools/anki-rollup-gate.mjs
```

### It was caught by `audit-carried-items.mjs`, which is the point of slice 36

The final gate sweep of this session exited **1** with

```text
DRIFT anki-unreachable   AnkiConnect ANSWERS — the blocker has lifted
```

Slices 32, 33 and 34 each re-probed 8765 by hand and each wrote "still blocked on the user".
This time nobody looked; the tool did, six minutes after Anki came up.

### What had never been exercised, and what the gate does

The rollup arithmetic has been unit-tested since slice 6. What had never run was the **join in
the middle**: a real `IntervalSnapshot`, built from real cards, reaching
`seanimeWatchLoopCards`. The gate runs exactly that with **no Electron, no dev server and no
renderer**:

1. the **shipped** `src/main/anki/intervals.ts` — bundled with only `electron` stubbed —
   builds a snapshot over the real `findNotes`/`notesInfo`/`cardsInfo` actions;
2. one namespaced probe note is created carrying the miner's own tag shape
   (`video-core`, `cue-3-0`, `media-154587`);
3. the **shipped** `seanimeWatchLoopCards` / `seanimeWatchLoopByEntry` produce the rollup;
4. everything it created is deleted **by id**, never by query, and the deletion is verified.

### The measurement, and its discriminator

```text
snapshot   1 entry from 1 note, noteId 1785616469590, ivl 0d, model JP Study App::JA Immersion
rollup     1 card, stage "new"    · without the snapshot the same card is "untracked"
entry      { cards: 1, attention: 0, known: 0 }  keyed by the resume path key
cleanup    1 note deleted, deck removed, 0 residual, 83 decks before and after
```

`new` versus `untracked` is the whole gate: the live snapshot is what puts a stage on the card,
so this proves the join rather than the arithmetic. A rollup that reported `1 card` either way
would have proved nothing.

### What it does NOT close, and why the audit claim was replaced rather than deleted

The mining history here is a **probe fixture**, not the user's own — real history lives in
renderer `localStorage`, so the in-app view still needs the dev server and a real mined card.
The carried claim was therefore rewritten rather than ticked off: `anki-unreachable` is gone
(it flips every time somebody opens or closes Anki, and would report DRIFT about a desktop
rather than about this project) and `rollup-unseen-in-the-app` takes its place, still `holds`.

### Safety

Read-only against the user's collection except for one note in `StudyOS::_MigrationProbe`. The
snapshot query is scoped to that deck — this gate has no business scanning 83 decks — the
deletion is by id, and the record carries the before/after deck count (83 → 83) plus a
residual-notes check. On failure the cleanup runs anyway and says so.

## SLICE 41 — THE HALF A CLIENT CANNOT DO. `patches/seanime/0004` gives the sidecar a generation it can refuse, so a stale open can no longer cancel a live one. Applies clean, compiles, tests pass — and changes nothing until a client opts in.

Evidence: `docs/migration/proof/open-generation-patch-20260801232841/open-generation-patch.json`.
Reproduce (nothing here touches the pinned checkout — it clones it):

```
node docs/migration/tools/verify-open-generation-patch.mjs
```

### What this closes

Slices 32, 37 and 39 all end at the same sentence: a recovery request the client has already
sent **cannot be recalled** — `fetch`'s abort abandons the response, never the work — so it can
land inside a later open and `BeginOpen` → `beginSubtitleSeek` strips that open's subtitles.
Slice 32 named the only two possible fixes: *a generation the sidecar can reject*, or *a client
rule that never issues while a newer open is outstanding*. `shared/directstreamOpenChannel.ts`
is the second and closes everything except the abandoned-fetch case. **This is the first.**

`Manager.AcceptOpenGeneration(clientId, generation)`, consulted **before** `BeginOpen` —
after it the damage is already done:

| generation | verdict |
|---|---|
| `0`, negative, or no client id | **accepted**, records nothing — every existing client is unaffected |
| newer than the last accepted for that client | **accepted**, becomes the bar |
| **equal** | **accepted** — a re-open of the *same* request is the legitimate recovery, not a stale one |
| strictly older | **refused**, before `BeginOpen` runs |

### It is inert, on purpose

Nothing sends `generation` — not Study OS, not upstream — so applying the patch changes no
observable behaviour. That is what makes the server half landable and verifiable on its own,
while the client half (`generation: requestId` on the open body and on every recovery for that
request) stays a separate, live-measured step. For the same reason it is **not** in
`build-patched-sidecar.mjs`'s patch list; adding it there is the wiring session's call.

### Verified, against a fresh clone of the pin

`git apply --check` clean · `go vet` clean · `go build ./internal/directstream
./internal/handlers` clean · the 5 new subtests pass · **the whole `internal/directstream`
package's existing tests still pass** · the pinned checkout's `HEAD` is unmoved. 121
insertions, **0 deletions**.

### Two traps in authoring a patch on this machine

1. **Git Bash's `tar` cannot extract to a Windows path** — `git archive | tar -C C:\…` fails
   with `Cannot connect to C: resolve failed`, because it reads `C:` as a remote host. The
   authoring and verification tools use `git clone` instead, which also gives the diff a
   `.git` to be taken against. (`build-patched-sidecar.mjs` gets away with `tar.exe` because
   it resolves to System32's.)
2. **`git clone` honours the user's global `core.autocrlf`**, so the working tree comes out
   CRLF, every multi-line anchor stops matching, and a patch generated from it would carry
   line-ending churn into an upstream-submittable diff. Both tools clone and check out with
   `-c core.autocrlf=false`. This is slice 39's CRLF lesson arriving from a completely
   different direction on the same day.

## SLICE 40 — TWO TEST FILES THAT HAD NEVER RUN, RAN. Both failed on their first execution, three times between them, and every failure was in the test.

Reproduce:

```
npx vitest run --config docs/migration/tools/vitest.tsx.config.mjs
```

**2 files / 4 tests, all passing.** Before this slice the number was 0 files / 0 tests, because
nothing collected them.

### The gap Phase 5 recorded and nobody could close

`vitest.config.ts` collects `src/renderer/__tests__/**/*.test.ts` — `.ts`, not `.tsx` — and
that directory holds two `.tsx` files: `externalPlayerPanel.test.tsx` and
`mediaTrackingSourcesHistory.test.tsx`. Phase 5's `stillOpen` names them and says the glob
"needs the root vitest include glob widened by its owner", which is right: `CLAUDE.md` keeps
root configs out of scope. But **"out of scope to fix" quietly became "out of sight"**, and
both files had drifted out of agreement with the components they describe.

`docs/migration/tools/vitest.tsx.config.mjs` runs them without touching anything at the root.
The real fix is still one character in `vitest.config.ts` — `*.test.{ts,tsx}` — and still
belongs to that file's owner.

### What they said when finally executed

| failure | where it was |
|---|---|
| `useSettings outside SettingsProvider` | **the test.** `ExternalPlayerPanel` renders `SettingsCard`, which reads settings context; the test rendered it bare. The component gained that dependency after the test was written |
| `expected 'Assign' to be 'Export JSON'` | **the test.** It asserted on `querySelector('button')` — the *first* button on the page — and the panel has since gained an assign control above the audit block |
| `expected null to be '5'` | **the test**, and this one is the transferable finding |

### The value-tracker trap, which had made a test silently do nothing

`input.value = x` writes **past React's value tracker**, so no synthetic `change` fires and
`onChange` never runs. The element shows the new text and the component knows nothing. That is
why the retention assertion read `null`: the store was never written because the handler was
never called. The product is a correct controlled input.

The same pattern sat in `externalPlayerPanel.test.tsx`'s form-filling, where it had been a
**silent no-op for the life of the file** — its assertions happened not to depend on the typed
values, so it would have passed while proving nothing about "creates a player profile through
the renderer form". Both files now type through the native setter, and that test asserts the
one observable that can only be true if the typing reached the component: `Save player` is
disabled with no fields, still disabled with only a name, and enabled once both are filled.

> A test that never runs is not a test — it is a claim with no expiry date, which is the same
> disease `audit-carried-items.mjs` exists for. Two of the three failures here were assertions
> describing a layout that had moved; the third was a test that could never have failed.

### Gates

`npx vitest run src/renderer/__tests__/` — the root suite's own directory — **106 files / 926
tests pass**, unchanged: this slice adds no work to the configured surface, because the
configured surface still cannot see these files. ESLint exit 0 on both. Line endings checked
and normalised to LF after slice 39's CRLF lesson (one of the two files had picked up 101 CRs).
No `src` component was touched — every fix was in a test.

## SLICE 39 — THE CHANNEL WAS WIRED AND REVERTED, FOR WANT OF A LIVE RUN. `src/media/` is back to its slice-35 state; the module gained the two pieces the wiring needed and 10 mutants.

**Read this before wiring it again — it is the third wiring on this line to be reverted, and
the first that was never given a chance to fail.**

### What is in the tree

`shared/directstreamOpenChannel.ts` gained two things the wiring showed it needed:

- **`directstreamOpenSupersede`** — a launch that will not wait. The dangerous inversion is a
  *recovery* landing inside a later open; a launch is the newest intent there is, so it is
  already in the right order. Making the user wait behind a POST that may never answer buys
  ordering that is already correct at the price of a play button that does nothing.
- **`directstreamOpenOverdue` + `DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS`** — because a
  correctness rule that can hang is not a correctness rule. If the outstanding POST never
  answers, the queued launch is released anyway; that is strictly no worse than the
  pre-channel behaviour, which issued every open immediately.

**23 tests, 10 mutants, all caught**, module restored byte-exactly.

### What was wired, and what it would have bought

Two edits in `StudyPlayerSlice.tsx`, both now reverted: the launch POST took the channel with
`directstreamOpenSupersede`, and the **stage-1 recovery asked the channel first**, breaking out
of its `reopen` case on `busy` or `superseded` without counting an attempt. That is the
inversion slice 32 measured, closed at the only place it can be closed on the client.

### Why it came out again

Two live runs failed at **phase I** ("Settings → Shortcuts never rendered the Video rows"),
which three runs an hour earlier had passed. The cause was found rather than guessed: the port
5173 the harness needs was answering, but `npx vite --strictPort` had refused to start with
`Port 5173 is already in use`, and the owner of that port is
`@electron-forge/cli/dist/electron-forge-start.js` — **another session had restarted `npm
start`**. Both runs therefore measured somebody else's in-flight source, and neither says
anything about this change.

With no way to verify it, the wiring goes back out. **The risk it must be measured against is
specific**: Blanc's first open depends on the stage-1 recovery firing, and a gate that refuses
one is a gate that can bring that defect back. `directstreamOpenSupersede` is designed to stop
the channel sticking (a new launch always replaces a stranded `outstanding`), but "designed
to" is not "measured to", and this line has already shipped two rules that were right on paper
and destructive in a run.

### How to land it

Own the dev server for the whole run — `npm start` yourself, or confirm nothing else holds
5173 — then: wire **only the recovery gate** first, run `retirement-step3-harness.mjs` three
times, and check `openAttempts` and phase C/E/J against this session's baseline (runs
`20260801194522` and `20260801195221`, both ten phases PASS at `openAttempts: 2`). Then Blanc:
`blanc-player-harness.mjs`, where the first open fails without the recovery, so a regression
there is the signal that matters. Only after both should `DIRECTSTREAM_MEDIA_REPORT_ONLY` move.

### One process note worth more than the slice

The revert was done with a Python script, and `io.open(path, 'w')` on Windows **silently
rewrote every line ending to CRLF** — 1,072 CRs in `StudyPlayerSlice.tsx`, 5,463 in this file.
Nothing failed loudly; what failed was `measure-resume-write.mjs`'s wiring check, whose anchors
contain `\n`, and it read as slice 35's wiring having come out with slice 39's. All four files
touched that way are back to LF, and the gate passes again. **Check `git diff --stat` after any
scripted edit on this repo**: a diff an order of magnitude larger than the change is the tell.

## SLICE 38 — THE 2026-07-30 OPEN QUESTION IS ANSWERED, LIVE. The store was cleared *immediately before the dispatch* and the reopen still resumed at the live position — so the write that beats it lands AFTER the dispatch, exactly where that entry's ruling-out could not look.

**Evidence, three runs, all kept:**

| run | outcome |
|---|---|
| `proof/retirement-step3-20260801194522` | **ten phases PASS.** Phase J row 1 reported INFO by its own rule — and produced the finding below |
| `proof/retirement-step3-20260801194942` | **FAIL at phase E**, the known intermittent cue signature (`replayFromInsideCue1.seekedTo: null`), on a tree unchanged since the run that passed it minutes earlier |
| `proof/retirement-step3-20260801195221` | **ten phases PASS**, phase J row 1 with the branch actually entered |

Reproduce:

```
node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
node docs/migration/tools/retirement-step3-harness.mjs --datadir=<that dir>
```

### What phase J does

It is the two-row control slice 35 specified, added to `retirement-step3-harness.mjs` after
phase I (the file is playing there; phase F, which quits the app, comes later).

| row | setup | measured |
|---|---|---|
| 1 | a session that **never started**, plant `8.8`, reopen | resumed at **8.800** — the teardown `skip`ped and the plant survived to be read at `watch` |
| 2 | park at `12`, plant `8.8`, reopen | resumed at **12.000** — the teardown `save`d the live position and the plant was overwritten |

Row 2 is not decoration. A reopen landing on the live session's own position is the store
*working*; without it, a passing row 1 could not be told from "resume is broken", which is the
reading the original entry warns against. **All three branches of slice 35's rule are now
verified live** — `clear` (row 1's setup), `skip` (row 1's result), `save` (row 2).

### The answer, and it came from the row that reported INFO

Run 1's row 1 cleared the store entry **immediately before the dispatch** — the same
precaution the 2026-07-30 entry took — and the reopen resumed at **7.292**, with the store
holding `7.292` afterwards. Nothing else can write that key: `disableRestoreFromContinuity`
is set, no `startAtSec` was supplied, and the profile is fresh per run. So between a dispatch
that left the store **empty** and the `watch` handler that is its **only reader**, something
wrote the live element's position — `ResumeTracker`'s teardown persist, firing when
`open-and-await` nulls the playback info.

> That is the whole of the 2026-07-30 mystery. The entry's ruling-out ("the store was
> re-read immediately before dispatch") is sound and looks at the wrong side of the dispatch.
> The original probe saw a restart at `0` because its live element was near `0`: the teardown
> wrote a sub-second position, and `resolveVideoCoreResumePosition` floors anything under 1 s
> to zero. **Resume was never broken.** Slice 35 changed the outcome of exactly that case,
> and row 1 now measures it: `8.800`, not `0`.

### A rewind cannot construct a never-started session — and that is why row 1 exists twice

The first cut parked at `0.4` after phases C-I had played to ~12 s. `sessionMaxSec` spans the
whole `ResumeTracker` effect, so that is the **deliberate-rewind** case, which slice 35's rule
clears *on purpose*; the row would have reported FAIL against correct behaviour. Clearing the
store by hand does not work either — run 1 is the proof, and it is the same write that answers
the question.

So the setup **uses** the mechanism instead of fighting it: rewind below the floor from a
session that has started, and the teardown takes the `clear` branch (recorded:
`clearedByTeardown: true`). The next open therefore starts at zero — measured `0.016` — and
with the pause guard holding it there, *that* session's max stays under the floor. Only then
is the plant laid.

The pause guard is required because `openFileWithRetry` waits for `readyState >= 2` and an
autoplaying element can be seconds in by then. It cannot suppress the restore:
`restoreSeekTime(time, false, undefined)` only calls `play()`/`pause()` for an explicit
boolean, and `canplay` fires either way. And if the guarded open still lands at or above the
floor, row 1 reports **INFO, not FAIL** — an assertion about a branch must first establish
that the branch was entered. That is what run 1 did, and it is why run 1 is kept.

### Two things about the runs that are not this slice's

**Phase E is still intermittent, and it is upstream of everything here.** Run 2 failed it with
the signature slice 32 named — `replayFromInsideCue1.seekedTo: null`,
`nextBackToCue1.seekedTo: 2.027` — on a tree byte-identical to the runs on either side of it.
Tally for this session: **2 PASS, 1 FAIL, nothing wired, `src/` unchanged between them.**

**Every run opened on attempt 2** (`openAttempts: 2`), the known StrictMode first-open defect
that `directstreamOpenRecovery` exists for. Unchanged by anything in slices 35-38.

### The environment, since slice 38's first attempt blamed it

That attempt failed with "the desktop shell never mounted" and zero phases — measured cause:
the built main resolves the renderer to `http://localhost:5173`, `.vite/build/` was rewritten
at **22:39** inside the **22:37-22:39** run window, and by 22:41 nothing was listening on 5173
at all. The record is kept as `proof/retirement-step3-20260801193700/`.

By 22:44 there were **zero** Electron processes and no dev server, so this session started its
own Vite on 5173 (`--strictPort`), ran the three runs, and **stopped it afterwards** — port
free, `curl` 000, zero Electron and zero `seanime.exe` left. The port is only taken while a
run is in flight, and it is taken only when nobody else holds it.

### Gates

`node --check` clean on the harness after every edit — including one that caught a real syntax
error, a nested ternary whose `undefined` branch left a stray `:`. No `src/` file was touched
by this slice, and none was touched by anyone during the runs (checked: nothing under `src/`
has an mtime inside the run windows).

## SLICE 37 — THE BLOCKER SLICE 32 NAMED NOW HAS A DESIGN: an open channel that cannot put an old POST behind a new one. Pure, tested, mutation-checked — and DELIBERATELY UNWIRED.

Reproduce:

```
npx vitest run src/shared/__tests__/directstreamOpenChannel.test.ts
```

**Nothing about stage 2 changed.** `DIRECTSTREAM_MEDIA_REPORT_ONLY` is still `0`, no POST is
issued, and `StudyPlayerSlice.tsx` does not import this module. What changed is that the
reason stage 2 stays unwired now has an answer to point at.

### What was blocked, in slice 32's words

> A recovery that races a re-open needs the POST itself to be abandonable: **a generation the
> sidecar can reject**, or **a rule that never issues while a newer open for the same file is
> outstanding**. Neither exists today.

`shared/directstreamOpenChannel.ts` is the second one. Every open — launch, stage-1 recovery,
stage-2 recovery — presents a ticket; the channel holds two facts (the current intent, and
whether a POST is outstanding) and answers `issue`, `queue` or `drop`:

- **at most one POST outstanding**, so the sidecar is never asked to guess which of two opens
  the user meant last;
- **a launch supersedes and queues**, and goes out the moment the outstanding POST is
  answered — so the last `BeginOpen` the server performs is always the newest intent;
- **a recovery is dropped, never queued.** A recovery is an opinion about a situation; by the
  time the channel frees, the situation has moved, and the stage that formed the opinion will
  re-form it if it still holds. *A POST that outlives the state that justified it is the bug.*

Replayed against the failing run's own timeline (`proof/retirement-step3-20260801094543`:
launch N, stage 2 firing at 10 724 ms, launch N+1 at ~20.9 s), the channel drops the recovery
as `busy` and issues N+1 only after N is answered. Server order stays non-decreasing.

### The hole is named, not hidden — and it is the reason this still is not enough on its own

`settled` must mean **the server answered**, not "our fetch stopped". Aborting a `fetch`
abandons the *response*, never the work: `PlayLocalFile` has already called `BeginOpen` and
runs to completion whatever the client does. A caller that settles the channel in its
`AbortError` branch re-opens the exact race — and since aborts come from effect cleanup, that
caller looks entirely reasonable. Hold the channel across the abort (the state is designed to
be module-scoped, like `seanimeSocketPool`) and let the response settle it.

**What no client-side rule can close:** an open the client abandons, the sidecar processes, and
the client never learns the end of. Only a generation the sidecar can reject closes that — a
patch alongside `patches/seanime/0003-…`. That is now the whole of what is left of this
blocker, and it is a smaller thing than "the transport is missing".

### A property test found a hole in this module before anything else did

Over 500 seeded random sequences, asserting that the server's view is non-decreasing in intent
and that everything issued was the intent at the moment it left: the first run **failed**.
`directstreamOpenReset` nulls the current intent, and the permissive reading of the recovery
gate (`currentRequestId !== null && …`) let a recovery for a dead request go out after a reset.
The gate now demands an exact match with a live intent, because *"cannot tell" must not resolve
to "send it"*. Both the random sweep and two named tests pin it.

**15 tests. Six mutants, all caught** (module restored byte-exactly, sha256 verified): queueing
a recovery instead of dropping it; issuing a launch while one is outstanding; issuing a
superseded queued launch on settle; letting a recovery through with no live intent; forgetting
the outstanding POST on reset; keeping the older queued launch instead of the newest.

### Gates and why they are the only ones that apply

`tsc --noEmit` **289**, none in either new file. ESLint **exit 0**. No `src` file outside
`shared/` was touched, so there is no renderer surface, no CSS, no i18n key and no build to
run. **No live run** — the tree was being written by another session throughout (slice 21's
hazard), and in any case wiring is the step that needs a live run, and wiring is deliberately
not done here.

### What a future session should do with this

Wire it **with a live-capable, quiet tree**, in this order: route the *launch* POST through the
channel first and prove seven consecutive phase-E passes (that alone changes nothing about
stage 2 and de-risks the transport), then raise `DIRECTSTREAM_MEDIA_REPORT_ONLY` to 1 and
measure again. The tally to beat is the one in `progress.json`: **7 of 7 with nothing wired;
two independently designed stage 2 implementations wired, one phase-E failure each.**

## SLICE 36 — FIVE OF THE TEN REASONS THIS TRACK CARRIES HAD EXPIRED. One had been false when a slice acted on it; one was carried for 25 slices after it was fixed. There is now a command that says so.

Evidence: `docs/migration/proof/carried-items-20260801/carried-items.json`. Reproduce:

```
node docs/migration/tools/audit-carried-items.mjs          # --json for the record
```

No sidecar, no Electron, no dev server, no build. It reads the tree, asks `git`, and opens one
TCP connection to AnkiConnect.

### Why this is a slice and not housekeeping

Three slices in a row paid for a stale reason. Slice 34 acted on slice 4's **verified**
deferral — *"no analyse API is exposed in `preload.ts` at all (grepped, not assumed)"* — and
found it had been false for days. Slice 32 carried *"delete the old player"* for sixteen slices
after slice 16 deleted it. Slice 33 spent its whole length discovering that an inherited
measurement counted the wrong thing.

**A verified reason has a shelf life, and nothing enforces one except re-running the check.**
That is the tool. Ten claims, each with the record line it belongs to; divergence exits 1 and
names the line. **A `DRIFT` is a stale record, never a product regression** — and the fix is to
*narrow* the claim, never to delete it so the output goes green.

### What had expired

| claim, as carried | reality |
|---|---|
| "no analyse-shaped API is exposed in `preload.ts` at all" — **twice** in the list | `preload.ts:1275` exposes `studyPrepare`; slice 34 already wired and pressed the action |
| "decide the shell-wide layering question: the palette (z 1201) renders behind the workspace (z 9999)" | `.palette` has carried `z-index: var(--z-shell-overlay, 20001)` since **slice 10**, with the taskbar question measured. Carried 25 slices past its fix |
| "route Blanc's media panel to the adopted player — **NOT STARTED**" | `BlancStudyPlayer.tsx:48` lazy-imports `media/MediaPlayerSurface` (slice 15). The PLAN section already carried its own `~~NOT STARTED~~ DONE`; only the `nextActions` copy stayed stale |
| "next candidate of slice 14's class: `ResultPanels.tsx:235`" | that caller already goes through `reachMediaWorkspace`, with a doc comment naming it as slice 14's gate applied to the caller slice 19 missed |
| "the Library / Readiness / Review switch has only been seen in jsdom" | `phase6-live-pass.json` records `proven.libraryReadinessReviewSwitch = PASS` — all three segments switching under real clicks, 2026-07-31 |

The last one is **narrowed, not deleted**: the switch was seen, the *per-row mining rollup in a
non-zero state* and the *Anki verdict against a live collection* were not, and both are the
same Anki blocker already tracked. Deleting a claim to make an audit green is the failure mode
this tool would otherwise invite; narrowing is the move.

Every correction keeps its original text after a `WAS:` in `progress.json`, so the history is
intact rather than rewritten.

### What still holds — which is the half a future session cannot get any other way

`analyse-handler-untracked` (`src/main/mediaStudyOrchestrator.ts` exists, untracked),
`analyse-action-unwired-in-production` (`MediaWorkspaceHost.tsx:339` mounts
`<SeanimeStudyLibraryPanel />` with no props), `anki-unreachable` (8765 refuses, re-probed this
slice), `mediacontent-uncommitted` (**1267 / 231** against `HEAD` — exactly slice 33's number),
and `media-unreachable-by-vitest`. "Checked and still true" and "never checked" look identical
in prose; here they do not.

**When you defer something for a verified reason, add it to that table.** That is the only
thing that gives the reason an expiry date.

### Gates

`node --check` clean. **Verified to exit 1 on drift**: flipping one `recordedAs` back to its
stale value prints `DRIFT 1` and exits 1, while the real table exits 0; the temporary copy was
deleted. No `src/` file was touched, so no test, type or build gate applies — and the tree was
being written by another session throughout, which is exactly why a docs-and-tools slice was
the right one to run.

## SLICE 35 — A RESUME WRITE COULD DELETE A POSITION THE USER REALLY REACHED, AND THE OPEN "REOPEN DOES NOT RESUME" QUESTION HAS A NAMED GAP IN ITS RULING-OUT. The write is now guarded.

> **Superseded in one respect by slice 38, later the same day.** Everything below that says
> the live confirmation is not done is now out of date: it ran, all three branches of the rule
> are verified live, and the named gap turned out to be the whole answer. Read slice 38 first;
> this section is kept for the reasoning that got there, not for its status.

Evidence: `docs/migration/proof/resume-write-20260801221721/resume-write.json`. Reproduce:

```
node docs/migration/tools/measure-resume-write.mjs
npx vitest run src/shared/__tests__/videoCoreResumeWrite.test.ts
```

No sidecar, no Electron, no dev server. **This slice ran nothing live and does not claim to** —
see "what this does not prove", which is the most important section in it.

### The defect, found by reading the shipped path rather than by probing it

`ResumeTracker` (`media/StudyPlayerSlice.tsx`) persists `video.currentTime` from four places:
a `timeupdate` that moved ≥ 2 s, `pause`, `ended`, and **its own effect teardown**. Three of
those are the user doing something. The fourth is not — and a write of `0` is not neutral:

- `resolveVideoCoreResumePosition` returns `0` for any stored entry below 1 s, so a `0` **is**
  the deletion of a resume point, and
- `seanimeContinueWatching` drops any row under `CONTINUE_WATCHING_MIN_POSITION_SEC` (10 s),
  so the episode **disappears from Continue Watching** at the same moment.

The element reports `currentTime === 0` for two situations that mean opposite things: the user
is at the top of the file, or **there is no media there at all**. The adopted lifecycle effect
(`video-core.tsx` §965-970) does `pause() / removeAttribute("src") / load()` whenever playback
info goes null, which resets the clock to `0` and `currentSrc` to `""` — and our own
`open-and-await` branch sets playback info to null on **every** open. Two reachable sequences
therefore destroyed a stored position without the user watching anything:

| sequence | pre-slice store | shipped store |
|---|---|---|
| open an episode with a stored `8.8`, leave before a frame decodes (or hit the silent-open stall) | **0** | **8.8** |
| play to `528`, element emptied by the lifecycle effect, teardown lands after it | **0** | **528** |

Measured, not argued: `measure-resume-write.mjs` replays both through the **real compiled**
`resumeWriteAction` with the pre-slice rule modelled beside it, and the real
`seanimeContinueWatching` prices the loss (`620 s → 1 row`, `0 s → 0 rows`).

### The rule, and the outcome the old code could not express

`shared/videoCoreResumeWrite.ts` — pure, in `shared/` for the reason
`directstreamOpenRecovery.ts` gives (`src/media/**` is outside every `vitest.config.ts` include
glob, so a rule that lives in the component is a rule with no test). Three outcomes:

- **`skip`** — the new one. The element has no media, or the position is sub-threshold and this
  session never started. The write knows nothing the store does not, so the store is untouched.
- **`clear`** — `ended`, inside the end margin, **or** a sub-threshold position from a session
  that *had* really started. "Back to 0:00 after eight minutes" is a decision; "still at 0:00
  having never played" is the absence of one, and only the first may throw a point away.
- **`save`** — everything else.

`hasMedia` is read off the element as `readyState > 0 || currentSrc !== ''`, which is exactly
the signal the lifecycle effect destroys. VideoCore attaches the stream as a `src` attribute
(§443), so `currentSrc` is non-empty for the whole life of a real stream.

### What this does NOT prove, stated before anything else quotes it

**Nothing here observed a real `<video>`.** The gate is static (is the rule in the shipped
persist path, called from all four triggers?) plus a replay of the decision. The live
confirmation was deliberately not attempted: **another session was writing `src/` throughout
this slice** — `MalDownloadDialog.tsx` at 22:12, `malDownload.ts` at 22:10, against this
slice's first write at 22:08 — and a dev-route harness run under someone else's HMR is slice
21's hazard, fourth recurrence. The tool says `"live": false` in its own record.

### The open question from 2026-07-30 is not answered — but its ruling-out has a hole with a name

The standing entry reads: *reopening the **same already-active** file with no `startAtSec` did
not apply the stored resume; **not** a measurement error, because the store was planted with
`8.8` under the exact key the app writes and **re-read immediately before dispatch to rule out
`ResumeTracker` overwriting it**.*

That ruling-out covers the window **before** dispatch. The write that matters is **after** it:
the file was *already active*, so its live session's teardown persist fires when
`open-and-await` nulls the playback info — between the dispatch and the `watch` payload whose
handler is the only reader of the store. Pre-slice, that write stored whatever the live
element's clock read. **This is a hypothesis with a mechanism, not a finding** (slice 25's
rule: a claim about production that was derived rather than measured is worth exactly one
control run), and the shipped guard changes what the control run should expect:

| live sequence to run | pre-slice | post-slice expectation |
|---|---|---|
| same file active and parked **under** 1 s, plant `8.8`, reopen with no `startAtSec` | teardown wrote ~`0.5`; reopen starts there | teardown **skips**; reopen starts at `8.8` |
| same file active at **12 s**, plant `8.8`, reopen with no `startAtSec` | reopen starts at ~`12` | unchanged — starts at ~`12`, and that is CORRECT, not the defect |

The second row is the control that stops "resume is broken" from being written up again: a
reopen landing at the live session's own position is the store working, not failing.

### Tests

`shared/__tests__/videoCoreResumeWrite.test.ts` — 15 tests, of which 5 model
`ResumeTracker`'s four triggers over the real store functions. **Six mutants, all caught**
(module restored byte-exactly, sha256 verified):

| mutant | caught by |
|---|---|
| drop the emptied-element guard | the emptied-teardown sequence |
| always `clear` a sub-threshold position | "skips 0 from a session that never started" |
| never `clear` a sub-threshold position | "clears when a started session went back to the very top" |
| ignore the `ended` statement | "clears on `ended`" |
| loosen the end margin by one tick | the boundary pair |
| `save` a sub-threshold position instead | the floor test |

**The gate is verified to fail on the before-state, wiring included** — reverting the rule
(two ways) or deleting `if (action === 'skip') return;` from the component makes
`measure-resume-write.mjs` exit 1, once on the sequence and once on
`ruleIsInThePersistPath: false`. Both files restored byte-exactly.

### Gates

`npx tsc --noEmit` **289** — and none of them is this slice's: filtering for
`videoCoreResumeWrite` or `StudyPlayerSlice` returns nothing. (The 289th arrived with another
session's work before this slice started; slice 34 already recorded the same drift from 288.)
Targeted ESLint **exit 0, zero output** on all three changed/new `src` files. `node --check`
clean on the new tool. **Renderer build exit 0** — the signature gate for anything under
`src/media/**`, since TypeScript does not open the vendor tree —
`assets/StudyPlayerSlice-z-qiY_PN.js` emitted, 38.21 s. It was built with
`--outDir <scratch> --emptyOutDir` **on purpose: `dist/` was never touched**, because another
session is live in this tree and `dist/assets` is what `check-media-css-containment.mjs`
reads. Full suite **337 files / 3,927 tests, 1 failing** — the failure is
`renderer/__tests__/malDownloadDialog.test.ts`, another session's file, written **during** the
run. Two consecutive full runs three minutes apart read **3,902** then **3,927** tests, and
the first had three failures the second did not — mid-edit states of that session's files, not
a flake in anything here. The
number that is honestly this slice's: **10 / 10 files and 115 / 115 tests green across the
entire resume-and-continuity surface** (`videoCoreResumeWrite`, `videoCoreStudy`,
`seanimeContinueWatching`, `seanimeWatchTime`, `continueWatchingWidget`,
`continueWatchingPalette`, `resumeLastCommand`, `resumeLastShellHandoff`, `statsShowsResume`,
`readerResumeHandoff`). i18n was not run and needs no run: **no UI string changed**, which was
also the point of picking a slice that stays out of the catalogs another session is editing.

> `src/media/**` is in **no** `vitest.config.ts` include glob, so the component half of this
> change is unreachable by the suite by construction. That is why the wiring is checked by the
> proof tool instead — and why "the tests pass" would have been an empty claim about it.

### What this leaves

The live confirmation above, and it is cheap: `retirement-step3-harness.mjs` already opens a
real file with a prepared datadir, so both rows are one phase — park, plant, reopen, read the
store at `watch` and the element after `canplay`. **Run it with the tree quiet.**

## SLICE 34 — THE ANALYSE ROW ACTION IS WIRED AND HAS BEEN PRESSED. Phase 6's `Next slice` item 1, carried since slice 3, closed — and slice 4's *verified* reason for deferring it had gone stale.

Evidence: `docs/migration/proof/analyse-action-20260801153334/analyse-action.json`. Reproduce:

```
npx vite --config vite.renderer.config.ts --port 5174
node docs/migration/tools/analyse-action-measure.mjs
```

**Three scenarios PASS**, each a real `MouseEvent` in a real Chromium.

### The deferral's stated reason was checked, and it is no longer true

Slice 4 recorded: *"`unanalyzed` → **analyse** is still not wired, now for a **verified** reason
— **no analyse API is exposed in `preload.ts` at all** (grepped, not assumed)."*

Grepped again: **`preload.ts:1275` exposes `studyPrepare`**, and
`renderer/mediaStudyOrchestrator.ts:255` exposes `prepareStudyMediaById(mediaId,
subtitleRecordId)` — which resolves the media item, picks the Japanese track, falls back to
queuing transcription when there is none, parses the cues and returns
`{ status, candidateCount, readinessCategory }`. **The entry already carries both ids that
signature wants** (`studyMediaId`, `subtitleRecordId`), so the adapter is an assignment.

> A verified reason has a shelf life. This one was true when written and false by the time it
> was acted on, and nothing in the record would have said so — the grep had to be re-run.

**What is still true** is the part slice 4 stated second: the `study:prepare` *handler* is
registered by `main/mediaStudyOrchestrator.ts`, which is **untracked**. So the bar this line
holds itself to — *main and preload both committed*, the bar `media:addPaths` cleared — is
**still not met on the main side**, and wiring the panel straight to it would have imported
another track's uncommitted contract in violation of the standing rule at line 4240.

### So the capability is OFFERED, not reached for — the same bargain `orchestrator` already makes

The panel's own header says it takes the orchestrator document as an **optional prop** and
never imports it. `onAnalyse` is injected on identical terms: a structurally-declared
`SeanimeStudyAnalyseAction` shaped to `prepareStudyMediaById`'s return type, so supplying it
is an assignment the caller makes and **this file gains no new import at all**.

The button therefore renders **only where somebody supplies the action**. That is not a
half-measure, it is the whole design: the moment the orchestrator track commits, production
wiring is one prop in `MediaWorkspaceHost.tsx:339` (which today mounts
`<SeanimeStudyLibraryPanel />` with no props, so `ready`/`stale` are already unreachable in
the real app for exactly the same reason).

### What it does, and the one thing it deliberately does NOT do

| row state | offered? | why |
|---|---|---|
| `unanalyzed` | **yes** | its action line already says "analyse the attached Japanese subtitles" |
| `stale` | **yes** | its action line already says "re-analyse"; the button reads **Re-analyse** |
| `missing-subtitles` | no | nothing to analyse; the only outcome would be the transcription queue its action line already names |
| `unlinked` | no | not in Study OS, so there is no media id — import comes first |
| `ready` | no | nothing to do |

**`queued-transcription` is reported as its own outcome, never as "analysed".** It is not a
failure — the work is real, it just moved to the transcription queue — and saying "analysed"
there would be a lie the user only discovers when no readiness score ever appears.

**The row does not transition out of `unanalyzed` on success, and that is stated rather than
hidden.** Import can recompute locally because the panel owns `items`; readiness lives in the
injected `orchestrator` document, which it does not own. The outcome is stated, the library is
reloaded, and the badge changes when whoever supplies the document supplies a fresher one.

### Pressed, not asserted — and the harness caught its own author first

`analyse-action-measure.mjs` drives the dev harness in a plain Electron window (no sidecar, no
datadir, no CDP, **no `--user-data-dir` anywhere near the repo**) and exits non-zero on a bad
measurement. Per scenario it checks the button rendered, had non-zero layout box (proof the
app's stylesheet is applied), was named by title, appeared on **exactly** the rows whose next
step is analysis, went disabled and read `Analysing…` mid-flight, and said the right thing:

```text
populated        rows 6 (1 analysable, 0 wrong)  "Analyse" -> "Analysed Sousou no Frieren — 137 study words found."
analyse-queued   rows 6 (1 analysable, 0 wrong)  "Analyse" -> "Sousou no Frieren has no Japanese subtitles yet, so transcription was queued instead."
analyse-failure  rows 6 (1 analysable, 0 wrong)  "Analyse" -> "The tokenizer is not available."   row released, disabled=false
```

**The first run reported FAIL on two of three, and the product was fine.** The expectations
hardcoded `Frieren 01`, the *media item's* title, while the row renders `Sousou no Frieren` —
`entryTitle()` prefers the Seanime **collection** title. A wrong expectation reads exactly like
a broken action. The expectations now derive from the title the row actually shows, and the
reason is a comment in the tool. (Second own-goal of the same family in two slices: the
measurement was wrong, not the thing measured.)

**A trap the tool records for the next person:** a backtick in a comment *inside* the injected
`MEASURE` template literal terminates the literal. It fails as `SyntaxError: Unexpected
identifier`, pointing at prose.

### Tests, and they were mutation-tested rather than trusted

`seanimeStudyLibraryPanel.test.ts` +7 (23 → 30), including the one that matters most: **the
shipped default renders no analyse button at all**, because a button that cannot do anything
is worse than no button. Four mutants, all caught:

| mutant | caught by |
|---|---|
| always pass the action down | "renders no analyse button when nobody supplies the action" |
| treat `queued-transcription` as prepared | the honesty test |
| offer analyse on every state | both negative tests |
| drop the `finally` that clears busy | "surfaces a failing analysis instead of leaving the row stuck busy" |

### Gates

Measured against this slice's own change, with the tree quiet: vitest **333 files / 3,834
tests** (+7 from the 333/3,827 baseline taken at session start). `tsc` **288** — the standing
baseline, unmoved. ESLint **0 problems** on all three changed `src` files. Architecture audit
exit 0, "Nothing new". i18n exit 0 at **6,358** keys (+6, translated into ja/zh/ru — plural
objects, `one/few/many/other` for Russian). `node --check` clean on the new tool. The harness
Vite server on 5174 was stopped afterwards; the developer's own server on 5173 was never
touched.

> **The final re-run reads 289 / 335 / 3,875, and none of it is this slice's.** Between the
> gate run above and the confirmation run, another session began writing —
> `src/main/scraper/catalogue.ts`, `malUnits.ts`, `index.ts` and `preload.ts` all carry
> mtimes of **15:34–15:36**, against this slice's last `src` write at **15:28**. The extra
> `tsc` diagnostic and the +2 test files / +41 tests are theirs. **Checked rather than
> assumed:** filtering the 289 diagnostics for any file this slice touched returns **nothing**.
>
> Slice 21's hazard, third recurrence, and the first where the live writer is somebody else.
> The transferable part is the check, not the complaint: *a gate number is only yours if you
> can still name every file that moved between your baseline and your re-run.* Quote 333 /
> 3,834 / 288 for this slice.

### What this leaves

Production wiring is **one prop**, blocked only on `main/mediaStudyOrchestrator.ts` being
committed by its owning track. Until then the capability ships offered-but-unsupplied, which
is exactly what `orchestrator` and `fingerprints` have done since slice 2.

## SLICE 33 — THE "49 DEAD `MediaState` MEMBERS" ITEM IS ANSWERED AND DELIBERATELY NOT EXECUTED. The count was wrong three ways and the premise was wrong once: 30 of them are unread because they are **not wired up yet**, not because they were retired.

Evidence: `docs/migration/proof/mediastate-surface-20260801151602/`. Reproduce:

```
node docs/migration/tools/measure-mediastate-surface.mjs
```

No sidecar, no datadir, no dev server, no Electron — it reads the tree and `git show HEAD`.

**`src/` is byte-identical to how this slice found it.** The removal was performed in full and
then restored; see "it was executed and reverted" below.

### The item, as carried, cannot be executed — and deadness is not the reason

Slice 32 measured *"49 of `MediaState`'s 151 members are named nowhere outside
`MediaContent.tsx`"*, called it dead exported surface left over from slice 16's legacy-player
deletion, and deferred it as **"a ten-minute job once the tree is quiet."** The tree **is** quiet
— no `src` file has been touched since 13:02, and the only Electron running is the developer's
own `npm start`, not a harness. So the stated precondition was met and the job was started.

It should not be finished, and the blocker is not the one slice 32 named:

| | members |
|---|---:|
| `MediaState` members total | 151 |
| named in another file | 102 |
| named only here, but read as `state.X` by a component **in this same file** | 9 |
| **never read anywhere — dead exposed surface** | **46** |

Of those 46, the question that decides whether a deletion is correct is **provenance, not
deadness**:

| | members | verdict |
|---|---:|---|
| were members of the **committed** `MediaState` and lost their last reader | **16** | retirement debris — safe to delete |
| **added since `HEAD` by uncommitted work**, never wired to anything | **30** | **do not delete** |

`MediaContent.tsx` carries **1,267 uncommitted insertions** against `HEAD` (1,347 lines there,
2,383 here). Thirty of the "dead" members are inside those insertions: `abStart`/`abEnd`/
`markAbStart`/`markAbEnd`/`clearAbRepeat` (A-B repeat), `subtitleSearchQuery`/`-Matches`/
`-Position`/`jumpSubtitleSearch`, `diagnosticsOpen`/`diagnosticsRunning`/`playerDiagnostics`/
`exportPlayerDiagnostics`, `stepFrame`, `toggleFullscreen`, `togglePictureInPicture`,
`selectAudioTrack`, `refreshAudioTracks`, `revealDictation` and 11 more.

> **A dead-surface measurement cannot tell "retired" from "not yet wired". Both read as
> zero readers.** Deleting the second kind destroys uncommitted work, and because it is
> uncommitted, git cannot get it back. The provenance check is now the last thing the tool
> prints, and it is the only line in its output that authorises a deletion.

**The 16 that are genuinely retirement debris**, and are the whole of what "ten minutes" ever
meant: `showPlayer`, `showLibrary`, `sigBurst`, `fireSigBurst`, `subOffset`, `lineTrans`,
`lineBusy`, `converting`, `convertAndPlay`, `jumpLine`, `replayLine`, `translateLine`, `nudge`,
`exportSubs`, `clearPlayer`, `resumeRef`. Even these were left alone: they live in the same
interface and the same return object as the 30, which is precisely where an edit collides with
whoever owns those 1,267 lines. **This is a ten-minute job for the owner of that file after it
commits, not for a session passing through.**

### It was executed and reverted, and what that proves is worth more than the diff

The full removal ran: 46 interface members and their 46 return-object properties (80 lines), then
19 unreachable `const … = useCallback(…)` declarations that ESLint flagged once nothing returned
them — 2,383 → 2,118 lines. Then `MediaContent.tsx` was restored from a byte-exact copy taken
before the first edit (`diff -q` clean, `git diff --stat` back to its original 1,267/231).

**`npx tsc --noEmit` reported 288 diagnostics before the removal, after the 80-line removal, and
after the 19 declarations came out — the same 288 that is the standing baseline.** The type
system cannot see the difference between retiring dead surface and deleting a half-built feature,
and neither can the suite: 333 files / 3,827 tests pass in both states. **Nothing in the gate
stack would have stopped this.** The only instrument that says "stop" is `git show HEAD`.

### Four measurement traps, all paid for in this slice

1. **"Named nowhere outside the declaring file" is not "dead."** `MediaContent.tsx` also exports
   the components that render this state — `MediaGrid`, `MediaKindFilter`, `MediaFolderNav`,
   `MediaCategoryFilter` — and those *are* used elsewhere. Nine members are read as `state.X`
   only from inside their own file and are fully alive: `categoryFilter`, `setCategoryFilter`,
   `setKindFilter`, `folderRows`, `genMsg`, `genError`, `ytSubLang`, `setYtSubLang`, `clearWatch`.
   That correction alone is 49 → 40.
2. **The i18n catalogs manufacture FALSE ALIVE.** `\btranslateLine\b` matches inside the key
   `'mediaWorkspace.study.translateLine'`, because `\b` matches after a `.`. Six members were
   alive on nothing but a quoted key or a doc comment — `showLibrary`, `converting`,
   `playerDiagnostics`, `replayLine`, `translateLine`, `nudge` — which is 40 → 46. With four UI
   languages every renderer name has four chances to be shadowed by a key that ends in it.
3. **Fixing (2) by blanking string literals created a FALSE DEAD, which is the direction that
   deletes live code.** A template literal's `${…}` is real code, and
   `` className={`sp-seg-btn ${state.kindFilter === k ? 'active' : ''}`} `` is the only read of
   `kindFilter`. Blanking whole backtick templates reported it dead. The scanner now hands
   `${…}` back to the code path and only blanks literal text; the stripped pass is reported as
   **candidates to confirm by eye**, never as a verdict, because a regex literal containing a
   quote is a hole it still has.
4. **A throwaway script produced the headline and the headline was wrong.** A one-off
   `node -e` provenance check reported **"0 of 46 exist at HEAD"** — i.e. *all* of it is
   in-flight, delete nothing. A direct `grep` refuted it immediately (`showPlayer` occurs 5
   times in HEAD's copy). Same shape as slice 31's `reopenAttempts` own-goal: **a number
   generated by code written to answer one question, read as if it had answered it.** The check
   is in the tool now, and it asks the precise question — *was this a member of HEAD's
   `MediaState`?* — because a whole-file name match calls `nudge` and `converting` committed
   surface on the strength of a comment.

### Secondary finding: the player diagnostics feature is half-built, and it is NOT a regression

`MediaCenterView.tsx:1164-1165` renders two buttons — *"Run diagnostics"* calling
`state.runPlayerDiagnostics()` and *"View report"* calling `state.setDiagnosticsOpen(true)`.
**Nothing in 1,289 files under `src/` reads `diagnosticsOpen`, `diagnosticsRunning` or
`playerDiagnostics`.** The report is built (`buildPlayerDiagnosticReport`), stored, and never
rendered; the second button sets a flag nobody observes.

The first reading was that slice 16 deleted the renderer along with `MediaPlayerStage`. **That is
wrong and was checked before it was written down:** `diagnosticsOpen` does not exist at `HEAD` at
all, and `MediaCenterView.tsx` is **untracked**. Buttons and state are both new, so this is one
unfinished in-flight feature, not something the retirement broke. Whoever owns it needs to know
the renderer is the missing half.

### Gates

`src/` unchanged, so the baselines are restatements rather than results: `npx tsc --noEmit`
**288** diagnostics / 108 files; `npx vitest run` **333 files / 3,827 tests pass** (slice 31
recorded 332/3,809 — the extra file and 18 tests predate this slice and were present at its
first baseline run). `node --check` clean on the new tool. One file added,
`docs/migration/tools/measure-mediastate-surface.mjs`, plus its proof directory; nothing else in
the tree moved.

### Still blocked on the user, unchanged from slice 32

The per-row mining rollup needs Anki running. `127.0.0.1:8765` was re-probed this slice and
actively refuses the connection. **Start Anki and re-run; that is still the whole of what is
missing.** The destructive-risk constraint at the top of this file continues to apply — the live
82-deck collection is real, and only the namespaced self-cleaning probe deck may be touched.

## SLICE 31 — THE `video.*` KEYPRESS LINE IS CLOSED. All ten rows now move a real observable from a real key. Music keyboard nav exists and has been pressed. And the `video-terminated` race is answered from the sidecar's source, not by another probe.

Evidence: `docs/migration/proof/retirement-step3-20260801074907/slice-31.json`.
Reproduce:

```
node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
node docs/migration/tools/retirement-step3-harness.mjs --datadir=<that dir>
node docs/migration/tools/music-mining-harness.mjs
```

Both need the Vite dev server on 5173. **Nine phases PASS twice** in the first; **28 phases PASS**
in the second.

### Read this first: slice 21's hazard recurred twice, and both times the live writer was ME

Slice 29 was blocked because another session was editing this tree while its harness ran. This
session did the same thing to itself — twice. **Editing any `src` file while a dev-route harness
runs pushes an HMR update, or a full reload, into the renderer under measurement**, and
`keyboardShortcuts.ts` is imported almost everywhere, so the blast radius is the whole tree.

Tell the two apart by the *shape* of the phase-C failure, because they read alike:

| | signature |
|---|---|
| **self-inflicted** | `sliceState: null`, `sliceText: null` — the slice is not in the DOM **at all**. Or phase C passes with the video advancing at `readyState 4` and then the play-to-20 s wait times out. Runs: `proof/retirement-step3-20260801074224` and `-20260801075110`, both `ABC` FAIL. |
| **the real intermittency** | `stalled at "Sousou no Frieren … Waiting for"` — the slice is mounted and rendering its own waiting state. The harness retry absorbs it; the second confirmation run needed **attempt 3** and then passed all nine phases. |

Slice 30's answer to an unstable tree was a frozen packaged artifact. The answer to a tree *you*
are destabilising is simpler: **stop typing until the run finishes.** Freeze it for the whole run,
not just before it.

### Phase E was not a regression in the code — slice 29's attribution was right

With the tree quiet, phase E passed first time (`replay -> 6.563732`, `previous -> 2.048001`,
`next -> 6.559389`). So **slice 29's phase H — written, never run, and the whole reason slice 30
had to route into the packaged harness — ran and PASSED on the dev route too.** The dev and
packaged routes now agree on `;` and `'`.

### The five rows that ship unbound: phase I, bind-then-press

`subEarlierLarge`, `subLaterLarge`, `toggleAutoPause`, `toggleLoop`, `toggleFurigana` carry
`defaultKeys: ''`. Slice 30 stated that correctly as a fact about what the rows *are* and named
the missing test. It exists now, twice:

```text
bind (Settings → Shortcuts, the real capture button)   ''  ->  Ctrl+Alt+1..5, no conflict marker
Ctrl+Alt+1  subtitle offset   0 -> -0.5        Ctrl+Alt+2  offset -0.5 -> 0
Ctrl+Alt+3  furigana  false -> true            Ctrl+Alt+4  autoPause false -> true
Ctrl+Alt+5  loopLine  false -> true            Ctrl+Alt+9  UNBOUND -> nothing moved
```

**The bind half runs before the workspace opens, and that is not incidental.** `.seanime-host`
is a full-viewport `aria-modal` dialog at z-index 9999 with the settings window under it, so
binding with the player up would only work because `.click()` does not hit-test — the same
shortcut that once let a harness here "verify" a taskbar button as a Blanc surface.

Two enablers went into `src`, both because those surfaces had **no language-independent handle**:
`data-shortcut-id` / `-keys` / `-capture` on the settings row and its capture button, and
`data-study-pref` on the furigana / auto-pause / line-loop checkboxes. Every string on either
surface goes through `useT()` and the app ships four UI languages, so a phase keyed to an English
label or to the word "Unbound" passes on an English machine and fails after a language switch.
The three toggles also need an instrument neither phase G (`seeked`) nor phase H (the offset
`<output>`) can provide — their effect is a *preference*.

### Music keyboard navigation — the decision nine slices deferred, taken

Three rows of their own: `music.prevLine`, `music.replayLine`, `music.nextLine`, category Music,
**all `defaultKeys: ''`**. Registered by `MusicLyricsPane`, not built-ins, because stepping needs
the cue sheet of the track on screen and that lives in the pane, not in `playerBus`.

Pressed live, phase S of the music harness:

```text
bind  '' -> Ctrl+Alt+6 / +7 / +8 through the capture UI, no conflict
S2 prev    Ctrl+Alt+6   cue 2 @ 2.5s -> cue 1 @ 1.5s
S3 next    Ctrl+Alt+8   cue 1 @ 1.5s -> cue 2 @ 2.5s
S4 replay  Ctrl+Alt+7   @ 4.3s -> @ 2.5s   (drifted-off-start=true, so "did nothing" is excluded)
S5 control Ctrl+Alt+9   UNBOUND — unchanged
```

Unbound by default is the same choice `music.playPause` three lines above already makes: every
free single letter belongs to the adopted player's keymap, the Music block spends all four
`Ctrl+Arrow*` chords on track and volume, and `Ctrl+Alt+Arrow*` is virtual-desktop navigation.

**A guard was NARROWED, not deleted.** `musicMining.test.ts` banned the substring
`registerCommandHandler` in the pane outright. That was right at slice 20, when the pane
registered nothing and this decision was open — but it had become a ban on the **answer** rather
than on the defect. It now asserts what was always the real invariant: the two surfaces' id sets
stay disjoint.

### The `video-terminated` race: answered from source, and storage latency is off the list

Slice 28 left this as *"no instance of this branch actually killing an open has ever been
observed"*, with **storage latency** as the only remaining shape to test. It does not need
testing. `internal/directstream/stream.go`'s `listenToPlayerEvents` drops the event on
**identity**, at one of two guards:

- **`stream.go:467`** — while the replacement is still *preparing* (`currentStream` empty), a
  terminate whose `key.PlaybackID == m.replacedPlaybackId` is ignored: *"Ignoring termination
  event of replaced playback session during preparation"*. `replacedPlaybackId` is set in
  `BeginOpenWithTarget` and only when a previous stream existed.
- **`stream.go:492`** — once the new stream is *live*, a terminate whose
  `key.PlaybackID != m.currentPlaybackId` is ignored: *"Ignoring termination event of older
  playback session for active stream"*.

Coverage is continuous: `replacedPlaybackId` is set under `playbackMu` in `BeginOpen` and cleared
under the same lock when the stream goes live (`:437`) or on `AbortOpen` (`:228`), so guard 2
takes over exactly where guard 1 stops.

**The cancel path (`:473-484`) needs `currentStream` empty AND no match on `replacedPlaybackId`.**
With no previous stream that field is `''`, so guard 1 cannot match and any terminate from the
preparing client cancels — that is the **first open of a sidecar session**, exactly where slices
23/24 measured it killing the open, and exactly the case where an A-to-B transition *cannot*
produce a terminate because there is no A. Slice 26 saw the two halves anti-correlated
statistically; **this is the mechanism, and it makes them mutually exclusive.**

Not source-only: **slice 28's own sidecar log carries guard 2 firing** —
`proof/blanc-open-retry-20260801101500/sidecar-seanime-2026-08-01_09-45-12.log` line 139, naming
both playback ids, at 09:45:25 right after that run's second open.

> **Widening a window cannot help an event that is discarded on identity rather than on timing.**
> Storage latency is not untested here — it is structurally excluded.

Boundaries, stated rather than buried: guard 1 needs `key.PlaybackID != ''` (the log shows the
client does send one, so that is the edge of the claim, not a live risk); this is the **pinned**
sidecar, upstream `9bdd052` / server 3.10.2, so an upstream bump must be re-read against both
guards; and slice 24's recovery in `shared/directstreamOpenRecovery.ts` **stays**, because the
first-open case it covers is genuinely reachable.

### Gates

vitest **333 files / 3,809 tests** (baseline at session start 332 / 3,803; +1 file and +6 tests
are this slice's). `tsc` **288** — the baseline, and **zero introduced**: the one diagnostic in a
file this slice touched is `MusicContent.tsx(349,5)`, a pre-existing `RefObject<HTMLDivElement |
null>` issue on `activeLineRef`, already inside the 288. i18n exit 0 at **6,352** keys (+3,
translated). ESLint 0 errors on every changed file (one pre-existing warning survives at
`keyboardShortcuts.ts:713`). Architecture audit exit 0, "Nothing new". `node --check` clean on
both harnesses.

### A claim in this section was wrong, and the correction is the useful part

**First written as:** *"the product's own open recovery did not rescue attempts 1 or 2 in the main
window"*, citing `reopenAttempts: 1` in that run's record.

**`reopenAttempts` is phase F's field.** It counts the *harness's* re-request attempts during the
restart/resume phase, and `1` means phase F opened first try. It has nothing to do with
`directstreamOpenRecovery`. The run says **nothing at all** about whether the recovery fired,
because **this harness has never had an instrument for it.** Own-goal of the same shape this track
keeps recording: a number that was in the record, read as if it answered a question it was never
about.

What the evidence *does* support, and no more:

- The second confirmation run needed **3 attempts** in phase C (`openAttempts: 3`, top level).
- Both stalls rendered a string beginning `"Waiting for"`. The only catalog entry that can be is
  `mediaWorkspace.study.waitingSubtitle` — and `StudyPlayerSlice.tsx:948` renders that overlay on
  **`state.active` alone**, with `playbackInfo` still allowed to be null. **So the text is
  consistent with both "the open is still in flight" and "the open finished and no media ever
  flowed."** It does not discriminate, and the 60-character truncation threw away everything that
  might have.
- One negative *is* sound: the slice did **not** show the recovery's give-up state. If the open had
  died the way slice 24's recovery is built for, `directstreamOpenVerdict` would have run
  8 s silence → re-open → 8 s silence → `failed`, setting `mediaWorkspace.openStalled` — roughly
  18 s, comfortably inside the 45 s each attempt waits. So whatever happened, **it was not a
  silently-cancelled preparation.**

That leaves a real and previously unnamed possibility worth carrying: `directstreamOpenVerdict`
returns `'playing'` **unconditionally first** when `playbackArrived` is true, and `playbackArrived`
is set the moment a `watch` payload is applied. **So "the `watch` arrived and then the MediaSource
never produced a segment" is outside the recovery's scope by construction** — the panel would sit
there with the episode chrome, an overlay, and a `<video>` at `readyState 0`, forever, with no
error. That is the same *user experience* slice 24 fixed, by a different cause. It is **not**
established that this run hit it; it is established that the record cannot rule it out.

**The instrument now exists.** `openFileWithRetry` records a structured diagnostic per stalled
attempt into `record.openStalls` — full untruncated `innerText` (four UI languages, so no English
substring test), `data-study-player`, and `videoPresent` / `readyState` / `networkState` / `srcKind`
/ `bufferedRanges`. Those three states separate cleanly:

| state | `videoPresent` | `readyState` |
|---|---|---|
| open still in flight | false | — |
| slice 24's recovery gave up | false, slice active, error text shown | — |
| **media never flowed** | **true** | **0/1** |

Next time phase C retries, the record will say which. Do not re-derive it from prose again.

### It said which, on the very next run — and the answer is a real defect this module cannot see

`proof/retirement-step3-20260801083650`, `openStalls`, **twice in one run**:

```text
slice active, the study dock fully rendered ("Previous line … 1.50x … More")
<video> PRESENT   src blob:   readyState 0   networkState 0   buffered 0   currentTime 0
```

`readyState 0` with `networkState 0` (`NETWORK_EMPTY`) is an element that has a MediaSource
attached and **has not begun to load anything** — nothing was ever appended to the SourceBuffer.
So the open *completed*: the `watch` arrived, `playbackInfo` was applied, the whole player and
study dock rendered. Then no media flowed.

`directstreamOpenVerdict` returns `'playing'` **unconditionally first** on `playbackArrived`, so
at exactly that moment the recovery disarms. Nothing detects this, nothing reports it, and the
panel sits there. **The `watch` payload is not playback — it is a promise of playback.** What the
user gets is the slice-24 panel again, reached from the other side.

### A fix was built and REVERTED. The reason is more useful than the fix.

The obvious shape is a second stage: `playbackArrived` starts a clock, the element reaching
`readyState >= 1` ends it, a window with neither re-opens once. Built, unit-tested — six guards,
all six of which a restored pre-fix line failed — and driven.

**Phase E then failed with slice 29's exact signature** (`proof/retirement-step3-20260801084459`):
`allCues` holding only cue 0, `replay-cue` disabled at the park, `next-cue` returning cue 0. On a
tree whose only change was that stage.

That signature is what a **mid-playback re-open** produces. A recovery POST calls `BeginOpen`,
which calls `beginSubtitleSeek`, which **stops every active subtitle stream** and bumps the
generation (`internal/directstream/subtitles.go:316-334`). So a stage that fires against a
*healthy* open does not merely waste a request — it restarts subtitle delivery from the new offset
and leaves the client holding one cue.

> **A recovery whose action is destructive has to prove the thing it is recovering from is
> actually broken.** "No `mediaReady` signal yet" is not that proof — it is equally consistent
> with an element handle the code could not read.

One run is not an attribution, so this is on record as a **hazard**, not as a diagnosis: the stage
was reverted rather than kept behind a flag, because an unproven change that plausibly breaks a
working open is worse than a documented gap. `src/media/StudyPlayerSlice.tsx` and
`src/shared/directstreamOpenRecovery.ts` are back to their shipped behaviour; what stays is the
module header describing the failure, and a **characterisation test** (`CHARACTERISES A GAP: a
watch with no media reads as 'playing'`) that states what the code does and why that is a gap.

### The revert is confirmed twice, and the confirmation refutes the competing explanation

`proof/retirement-step3-20260801085237` and `proof/retirement-step3-20260801090448` — two runs,
independently prepared datadirs (`gplay-dd-slice32b`, `-slice32c`), **nine phases PASS each**.
Phase E is recovered in both: `replay -> 6.608451 / 6.632499`, `previous -> 2.112014 / 2.095158`,
`next -> 6.582842 / 6.601896`.

**The useful half is `openStalls`.** Both confirmations reproduced the gap this section is about
— **twice each**, `readyState 0`, `networkState 0`, `buffered 0`, `srcKind blob:`, the study dock
fully rendered — opened on attempt 3, and passed phase E anyway. The gap is real, reproducible on
shipped code, and **survivable**.

| run | stage | stalls | phase E |
|---|---|---|---|
| `-074907` | no | 0 | PASS |
| `-083650` | no | 2 | PASS |
| `-084459` | **yes** | 1 | **FAIL** |
| `-085237` | reverted | 2 | PASS |
| `-090448` | reverted | 2 | PASS |

That kills the one explanation that would have exonerated the stage: **"whatever produces the
stall also thins cue delivery."** Three runs now carry the stall with cues intact, and the single
failure carried *fewer* stalls than any of them — which is what a stage that converts a stall into
a re-open would do. Four passes without the stage, one failure with it.

**Stated precisely, because the field names invite over-reading:** `allCues` is *not* a recorded
field. `cueStartsFromFile` is the fixture's cue list and reads `[2, 6.5, 11, 16, 21, 24]` in all
five runs **including the failure** — it is not the discriminator and must not be quoted as one.
The discriminator is the pair of observables: `replayFromInsideCue1.seekedTo` **null** (disabled
for want of an active cue at the 7.3 park) and `nextBackToCue1.seekedTo` **2.086545** (cue 0
instead of cue 1). "`allCues` held one entry" remains an **inference** from those two, via
`adjacentStudyCue` — a good one, and still not a measurement.

What this does **not** establish: that the stage caused the loss. That needs the stage re-applied
on a quiet tree and failing again on purpose, and nobody should run that before the control below
exists.

**For whoever picks it up:** make "cannot judge" a `waiting`, never a `reopen`; gate the whole
stage on having observed a real element at least once; and prove on a **healthy** open that the
stage never fires *before* proving it rescues a broken one. That control now has a fixture rather
than a wish: a run whose `openStalls` is non-empty and whose phase E passes is exactly the tree
the stage must stay silent on, and three of them are on disk.

### Stage 2, rebuilt to those constraints — landed PURE and deliberately NOT WIRED

`directstreamMediaVerdict` in `src/shared/directstreamOpenRecovery.ts`, 13 tests. It is not
called from anywhere in `src/media/**`, and **a test asserts that** (`is NOT wired into the
product yet`, which greps `StudyPlayerSlice.tsx`). That is not timidity — it is the order the
revert bought: the stage must be proven silent on a healthy open before it is proven useful on a
broken one, and landing the decision separately from the action is what makes that order
possible to hold.

**The one-line diagnosis of the reverted attempt:** it fired on the *absence* of a readiness
signal, and absence is ambiguous — "no `mediaReady` yet" is equally consistent with an element
handle the code could not read. So this one fires on the **presence of the measured signature**:

```
readyState === 0  &&  networkState === 0 (NETWORK_EMPTY)  &&  bufferedRanges === 0
```

That is `HTMLMediaElement` for *"a source is attached and nothing has begun to load."* Anything
that is not an exact match returns `playing` — not "healthy", but *not this defect, so not ours
to act on*. The fixture is measured, not invented: **six stalls, two in each of the three runs
above, byte-identical in every recorded field.**

#### A claim two paragraphs up was WRONG, and measuring it is what this section is for

**First written as:** *"a slow load is `networkState 2` and is therefore excluded by the shape of
the reading, not by a timeout … the signature separates them completely."*

**It does not.** `retirement-step3-harness.mjs` now records a 200 ms time series of the `<video>`
for every open attempt, and the attempt that OPENED reads:

```text
   0 ms   readyState 0  networkState 0  buffered 0   <- the failure signature, exactly
 209 ms   readyState 0  networkState 2  buffered 0
 508 ms   readyState 4  networkState 1  buffered 1   <- playing
```

**A healthy open passes through the failure signature on mount, for about 200 ms.** Shape does
not separate them; **duration** does. In the same run the two stalled attempts reached the
identical reading at 2.3 s and 1.6 s and were still holding it 43 s later. So the 10 s window is
not a formality — it is the entire discriminator, and it now has numbers behind it: ~50x the
longest healthy transient observed, firing 33 s before the harness's own 45 s patience.

The same series killed a second tempting gate. Stalled attempt #1 passed through
`readyState 1, networkState 1, buffered 1` at 795 ms — a healthy-looking reading — before
falling back and holding the signature for 43 s. **Brokenness here is not monotonic**, so a
"it looked fine once, leave it alone" gate would have missed that stall. The rule therefore
reads only the CURRENT observation and lets the clock decide. Both facts are now tests.

#### The live control, on real runs, with no product change at all

`docs/migration/tools/replay-media-verdict.mjs` replays a run's recorded samples through the
**real** function — it compiles `directstreamOpenRecovery.ts` with the esbuild Vite already
ships and imports it, so the control cannot drift from the code it is a control for. No
instrumentation was added to `src` for this; the harness samples, the tool decides.

`proof/retirement-step3-20260801092956` (nine phases PASS, two stalls and a healthy open in one
record):

| series | outcome | verdicts | first fire |
|---|---|---|---|
| phase C #1 | STALLED | `waiting×41 playing×8 reopen×167` | **10 427 ms** |
| phase C #2 | STALLED | `waiting×42 playing×6 reopen×168` | **10 150 ms** |
| phase C #3 | **HEALTHY** | `waiting×1 playing×3` | **never fired** |
| phase F #1 | **HEALTHY** | `waiting×43 playing×4` | **never fired** |

Plus `proof/retirement-step3-20260801092655`, which opened first try: two more healthy series,
**never fired**. So across two runs: **four healthy opens, zero fires; two real stalls, both
would have been rescued at ~10 s** instead of burning the harness's 45 s and a retry.

The control's own weak spot, stated so nobody has to rediscover it: `playbackArrived` and
`watchArrivedAt` are proxied by *"the element exists"*, since the `data-vc-element` video only
renders once `playbackInfo` is set. That makes the estimate LATE and the measured window SHORT,
which biases the rule toward firing sooner than it would in the product — so "never fired" is a
conservative result, not a flattering one.

**Every guard was mutation-tested**, the same discipline the reverted attempt used, and each
mutant fails the suite:

| mutant | caught by |
|---|---|
| **the gate removed — the reverted stage's actual bug** | 2 tests |
| fires on `readyState` alone, ignoring `networkState` | 2 tests |
| window ignored (fires immediately) | 2 tests |
| no attempt cap | 1 test |
| acts before the `watch` | 1 test |

The module was restored byte-identically afterwards (verified by `diff`).

### It was then WIRED on that control, and REVERTED again. This is the second revert.

The handle question was answered first, and answered by measurement rather than reading:
`ResumeTracker` already reads `vc_videoElement` in the same subtree, its effect returns early
without a real element, and **phase F depends on that read and passes on every run** — so the
atom demonstrably resolves. `StudyPlayerSession` was one line away from it.

Wired, then two runs. `proof/retirement-step3-20260801094257` **PASS**.
`proof/retirement-step3-20260801094543` **FAIL — phase E, the destructive signature**
(`replayFromInsideCue1: null`, `nextBackToCue1: 2.080703`). Reverted on the spot, as the
protocol said. `StudyPlayerSlice.tsx` is byte-for-byte back to its pre-session shape.

**Two mistakes, and the second is the one worth carrying.**

**1. The control was optimistic and claimed to be conservative.** `replay-media-verdict.mjs`
proxies the clock's start with *"the first sample in which the element exists"*, which is LATE.
The rule fires on `now - watchArrivedAt >= silenceMs`, so a late start means a SMALLER elapsed
time and the replay fires **later** than the product — "never fired" was weaker evidence than
it read as. The tool's header said the opposite. Corrected there.

**2. The stage fired CORRECTLY and was destructive anyway — the fire condition was never the
problem.** From the failing run's own `mediaSamples`, on the stalled attempt:

```text
 2 257 ms   readyState 0  networkState 0  buffered 0    <- the signature, held
10 724 ms   readyState 0  networkState 2  buffered 0    <- element starts loading: the
                                                           recovery POST landed. The rescue,
                                                           working exactly as designed.
20 906 ms   element ABSENT                              <- harness gives up, opens again
```

Phase E measures **the next attempt**. A recovery POST issued against attempt N can still be in
flight when attempt N+1's stream goes live, and `BeginOpen` → `beginSubtitleSeek` stops every
active subtitle stream. Keying the record by `requestId` stops the *state* leaking across
attempts and does nothing about the *request already sent*.

> **A recovery that races a re-open is not fixed by a better fire condition.** It needs the POST
> to be abandonable — a generation the sidecar can reject, or a rule that never issues while a
> newer open for the same file is outstanding. Neither exists today.

Held to this track's standard: that mechanism is a hypothesis consistent with the samples, not
established — the PASSING wired run has a nearly identical stalled-attempt timeline, so the
difference is timing, which is also why it is intermittent. What IS established is the tally:

| tree | phase E |
|---|---|
| nothing wired | **7 of 7 PASS** (`-074907 -083650 -085237 -090448 -092655 -092956 -095400`) |
| slice 31's stage 2 wired | 1 run, **FAIL** (`-084459`) |
| this stage 2 wired | 2 runs, **1 PASS 1 FAIL** (`-094257`, `-094543`) |

Two independently designed stage-2 implementations, two failures, and zero failures without one.

### So the RE-OPEN stays out — and the half that never needed it SHIPPED

The blocked thing was never "stage 2". It was **re-opening**. Everything destructive traces to
one act: a recovery POST calls `BeginOpen` → `beginSubtitleSeek`. And re-opening was never the
whole value — the user-visible defect is that the panel renders the full study dock over a dead
`<video>` and **says nothing, forever**. Reporting that needs no POST at all.

`DIRECTSTREAM_MEDIA_REPORT_ONLY = 0` makes the verdict skip `reopen` entirely and go to
`failed`, surfacing the same `mediaWorkspace.openStalled` message stage 1 already uses. This is
**non-destructive by construction, not by argument**: with no `BeginOpen` there is no
`beginSubtitleSeek`, so the cue-thinning mechanism cannot occur. Two tests hold the line — one
sweeps all 160 `readyState × networkState × buffered × time` combinations and asserts `reopen`
is unreachable, the other slices the stage-2 effect out of `StudyPlayerSlice.tsx` and asserts
`postDirectstreamOpen` does not appear in its code.

Verified live: `proof/retirement-step3-20260801100501` and `-20260801100731`, **nine phases PASS
each**, phase E clean in both.

#### "The report has not been seen firing" was WRONG — it had fired in both runs

First written here as: *"neither verification run hit a watch-with-no-media stall (both stalled
once with `video ABSENT`, which is stage 1's case)."*

**`video ABSENT` was the CONSEQUENCE of stage 2 firing, not evidence that it hadn't.** The
`failed` branch sets `playbackInfo: null`, which unmounts VideoCore — so by the time the harness
gives up at 45 s and takes its diagnostic, the element it is looking for has been gone for 34 s.
I read the proof of the thing as proof of its absence, from a field that was never going to say.

`docs/migration/tools/stage2-sighting.mjs` decides it properly, from the 200 ms series plus the
recorded stall text, because both stages print the same string and the text alone cannot
discriminate. What can: **stage 1 disarms the moment `playbackArrived` flips true, and the
`data-vc-element` video only renders once `playbackInfo` is set** — so a stall message on an
attempt whose element *mounted* cannot be stage 1's.

```text
STAGE 2 FIRED — element unmounted early AND the message was on screen
  -100501  phase C#1  sig@2178ms  absent@10698ms   -105658  phase C#1  sig@3443ms  absent@11418ms
  -100731  phase C#1  sig@2056ms  absent@10539ms   -110125  phase C#1  sig@2680ms  absent@10899ms
                                                   -110353  phase C#1  sig@2312ms  absent@10657ms
```

The control is in runs that already existed, and it is exact:

| tree | series reaching the signature | message shown | element unmounts |
|---|---|---|---|
| **unwired** (`-092956`, `-095400`) | 6 | **0** | **never** — the forever-spinner |
| **report-only** | 5 | **5** | **~10.7 s** — a stated error |

Same stall, same signature, message absent before and present after, **5 of 5**. The
`-094257`/`-094543` pair sits in neither column: they unmount at ~20.8 s, which is the harness's
own teardown, and their message comes from the re-opening stage's extra window.

One process note, since this is the second threshold mistake in a day: the first version of that
tool required the unmount gap to be `>= 8000 ms` and read `-105658` (gap **7 975**) as a
non-sighting. The gap is `silenceMs - (signature - watch)` and is inherently 6.5-9 s, so the
band was invented rather than derived. It now asks the question that actually separates the
cases — *did it unmount EARLY, or at the harness's teardown* — and the false negative goes away.

#### And the advice the message gives is measured-correct

The string is *"The media server accepted this file and then stopped preparing it. **Try opening
it again.**"* An error that tells the user to retry is worse than useless if the state it leaves
behind is terminal — and this stage deliberately nulls `playbackInfo`, so that was a fair worry
about my own change rather than a hypothetical.

It is answered by the same five runs. In **all five**, the open immediately after the report
succeeded:

```text
-100501 -100731 -105658 -110125 -110353
   openAttempts 2   phase C PASS   readyState 4   played ~0.3 -> ~4.3 s   phase E PASS
```

The harness's retry *is* the user doing what the message says. **5 of 5**: the state is
recoverable, the advice is right, and the failure it reports is the transient one it was written
for rather than a dead file.

#### The sighting tool is now a GATE, so this cannot silently regress

Nothing in the 3,827-test suite can see "a watch with no media got SAID" — it is a live,
intermittent, cross-process behaviour. So `stage2-sighting.mjs` gates one run:

```
node docs/migration/tools/stage2-sighting.mjs [run-dir]   # default: newest. exit 1 on regression
node docs/migration/tools/stage2-sighting.mjs --all       # the history, never a gate
```

**It is conditional on its own precondition, which is what makes it sound despite the defect
being intermittent:** it asserts nothing unless a series actually reached the failure signature,
and if one did, it requires the report. A run where the stall did not happen passes quietly; a
run where it happened and went unreported fails.

Verified to fail where it must, which is the only reason to believe it:

| run | tree | exit |
|---|---|---|
| `-092956` | unwired — 3 series reached the signature, **0 reported** | **1 (FAIL)** |
| `-094543` | re-opening stage — unmounts only at the harness's teardown | **1 (FAIL)** |
| `-105930` | shipped — no stall occurred at all | 0 (pass, quietly) |
| `-110353` | shipped — stall occurred and was reported | 0 (PASS) |

The first row is the before-state of this whole slice, and the gate rejects it. Run it after any
`retirement-step3` run that touches the media path.

#### The 10 s window was calibrated on a 30-second fixture. Checked against a real episode.

This is the obvious way the shipped change could hurt a real user and it was untested: if a big
file takes longer than 10 s to get from `watch` to first media, stage 2 would report a **healthy**
open as stalled. Slice 28 refuted the same worry for the OPEN (POST → `watch` is 36 ms on a
2.33 GB file), but that is the metadata parse — a different interval from the one this window
measures, so it did not transfer.

Measured directly, on the real 2.33 GB `The Big O - 12` at 1440x1080, duration 1425.5 s
(`proof/retirement-step3-20260801111636`):

```text
    0 ms   element ABSENT
 9106 ms   readyState 0  networkState 2  buffered 0   <- appears ALREADY loading
 9965 ms   readyState 1  networkState 1  buffered 1   <-  859 ms later
10245 ms   readyState 4  networkState 2  buffered 1   <- 1139 ms later, playing
```

**The real episode never entered the failure signature at all** — it arrived at `NETWORK_LOADING`
rather than `NETWORK_EMPTY` — and was playing 1.1 s after mounting. Against a 10 s window that is
roughly 9x margin, on a file 200x the fixture. The 9.1 s before the element appears is workspace
navigation, not loading: the fixture runs show the same ~9 s in their phase F series.

Phase E failed in that run for an unrelated and expected reason — a real episode has no
`English (probe)` track, so the selector reads `Off`. Phase C is the phase this was run for and
it passed. Do not read that FAIL as a regression; it is a fixture mismatch.

#### Blanc is the OTHER consumer of this slice, and it was checked too

`StudyPlayerSlice` serves both the main window and Blanc's toolbox, so the main-window runs only
covered half of what the change touches. Three Blanc runs
(`proof/blanc-player-live-20260801112005`, `-112222`, `-112331`):

**Phases A-H PASS in all three** — including G, a file playing inside Blanc's own frame at
`open attempts 1`, and H's geometry (`frame 392x221`, `video 392x189`, non-degenerate, no
sideways scroll). Blanc's own first-open recovery is untouched.

**Phase I is intermittent — 1 PASS / 2 FAIL — and it is PRE-EXISTING.** It reads `NO CUE WAS
ACTIVE AT THE 7.3s PARK`, the `allCues`-holds-one-cue shape again. Four independent reasons it
is not this slice's doing, the first of which is decisive:

1. **It failed at `proof/blanc-player-live-20260801074500`, before this session started and
   before stage 2 existed in any form**, with the identical detail (`R -> null`, `W -> 2.00709`,
   `S -> 2.0175`). The full history is `060000` PASS, `065000` PASS, **`074500` FAIL**, `075500`
   PASS, `112005` FAIL, `112222` PASS, `112331` FAIL.
2. Report-only issues **no POST**, so `BeginOpen` → `beginSubtitleSeek` is unreachable.
3. Stage 2 **did not fire in any of the three runs** — all report `open attempts 1`, so no stall
   and no `failed` branch.
4. The main-window equivalent of that measurement, phase E, passes **6 of 6** with stage 2 wired.

### That intermittency then turned out to be THE HARNESS'S OWN WORKAROUND, and it is fixed

It looked like a property of Blanc — *"subtitle delivery drops cue 1 in ~40% of runs"* — and it
was a property of the code measuring Blanc.

Phase I used to re-seek by ±0.05 s up to 20 times "to re-trigger delivery" when no cue was
active. **That loop was self-defeating**, and the pinned sidecar's source says so exactly:

```text
SeekedEvent -> startSubtitleStreamForTime            (stream.go:553)
            -> beginSubtitleSeek                      (subtitles.go:316)  STOPS every active
                                                                          subtitle stream
            -> restart at subtitleOffsetForTime(...)  (subtitles.go:206)
```

and that offset applies a **10-second preroll** before snapping to an MKV cue position —
`max(currentTime - 10, 0)`. At the 7.3 s park that is **0**, the start of the file, and ±0.05 s
cannot move it. So every nudge **stopped the in-flight parser and restarted it from byte 0**,
where it re-delivers cue 0. Twenty nudges, twenty restarts, cue 1 never reached. The loop
re-created the state it existed to escape.

The differential evidence was sitting in the two harnesses all along:

| harness | how it parks | result |
|---|---|---|
| `retirement-step3` phase E | seeks **once**, waits 1500 ms, never re-seeks | **7 / 7 PASS** |
| `blanc-player` phase I (old) | seeks, then up to **20 re-seeks** at 500 ms | 4 PASS / 3 FAIL |
| **`blanc-player` phase I (fixed)** | seeks once, then polls the overlay **without re-seeking** | **3 / 3 PASS** |

Fixed by deleting the re-seek and keeping the poll. Verified over three fresh runs
(`proof/blanc-player-live-20260801114*`): cue 1 active at the park every time
(`index 1, startMs 6500`), `R -> 6.5197`, `W -> 2.00x`, `S -> 6.5x`.

**The general lesson, which is why this is written up rather than just fixed:** a retry that
re-issues the *triggering* action is not a retry, it is a reset. Here the action being retried
(`seek`) is the very thing that discards the progress being waited for.

That lesson was then acted on rather than left as advice: every other `.mjs` in this directory
was swept for the same shape — a poll loop that re-issues an action instead of waiting on it.
**`blanc-player-harness.mjs` was the only one.** No other harness nudges to re-trigger, so
nothing else needs changing and nobody needs to re-derive that.

One thing this does NOT overturn: the stage-2 attribution. Phase E, the main-window equivalent,
seeks once and passes **7 of 7 unwired** versus 1 of 3 with the re-opening stage — so that
difference is not this race.

### Finally: the whole thing verified in a PACKAGED build, not just on the dev route

Every measurement above is a dev-route measurement, and slices 29 and 30 exist precisely because
the dev route cannot be trusted — slice 30 had to route into a frozen packaged artifact to close
its item. A product change proven only there is proven in the least trustworthy place.

So: `npm run package` with report-only stage 2 in it, then
`docs/migration/tools/packaged-blanc-harness.mjs`.
**All seven phases PASS** — `proof/packaged-blanc-20260801114035`:

| phase | result |
|---|---|
| A | the packaged app boots, `app://bundle/index.html` |
| B | the sidecar is the one **inside the package** (`out/.../resources/seanime/seanime.exe`), not the pinned sibling |
| C | Blanc opens as its own packaged window, `app://bundle/blanc.html?blanc=1` |
| D | **a file plays in packaged Blanc, first try** — 0.575 -> 6.799 s, inside the Blanc frame |
| E | **one POST, one socket, no terminate** — `POSTs 1 (want 1)`, sockets 1/0, `video-terminated` before watch 0, watch at 6400 ms |
| F | frame bounds the surface without collapsing it; **legacy player nodes 0** |
| G | `;` and `'` move the subtitle offset; unbound `x` moves nothing |

**Phase E is the one that matters for this change and it is not my assertion — it is the
harness's.** It independently counts POSTs and requires exactly one. Report-only issues none, so
if the stage had leaked a request into a healthy packaged open, that phase would have caught it
with a number rather than an argument.

**And the package was checked to actually CONTAIN the change**, because seven green phases would
be equally true of a build without it — which is the sort of gap this track keeps finding after
the fact rather than before:

```text
out/…/renderer/main_window/assets/StudyPlayerSlice-BUQkWpXd.js   contains `elementEverObserved`
```

Object property names survive esbuild's minification even though locals do not, so that marker is
greppable in the shipped bundle. The chunk hash also moved from **`CJVhO60x`** — the hash slice 29
recorded for the pre-change packaged build — to **`BUQkWpXd`**, which is independent confirmation
that the artifact under test is not the old one.

| tree | phase E |
|---|---|
| nothing wired | **7 of 7 PASS** |
| re-opening stage 2 wired | 3 runs, **2 FAIL** (slice 31's, and this one's `-094543`) |
| **report-only stage 2 wired** | **6 of 6 PASS** (`-100501 -100731 -105658 -105930 -110125 -110353`) |

**For whoever picks up the re-open:** it is blocked on the abandonable-POST problem, not on the
predicate. The predicate is done, mutation-tested and now shipping in report mode; what is
missing is a way to call a POST back — a generation the sidecar can reject, or a rule that never
issues while a newer open for the same file is outstanding.

Deliberately NOT done: a shadow wiring into `src`. It would need a `window.__`-style debug
global and **no such pattern exists anywhere in `src` today** — introducing one is an
architecture decision, not a measurement step.

## The four items slice 31 left behind — three closed, one stale, one genuinely blocked

They had been carried for several slices, and three of them shared a shape: **"nobody has
LOOKED at this"**, on a surface that already had a dev harness built for a human to open. They
stayed open because nobody opened one. `docs/migration/tools/devharness-measure.mjs` opens them
with a plain Electron window — no sidecar, no datadir, no CDP, nothing of the product touched —
and decides rather than reports (non-zero exit on a bad measurement).

Evidence: `docs/migration/proof/devharness-measure-20260801131700/`. Needs the harness server:
`npx vite --config vite.renderer.config.ts --port 5174`.

### CLOSED — the stacked two-channel chart

The blocker was data, not code: *"no day has both read and watch time, so every column drew one
segment."* `study-ledger-harness.html?state=mixed` seeds days that have both. **14 bars, 6 of
them with BOTH channels, 0 collapsed, 0 overflowing.**

```text
track 97px  stack 97px   watch 25%      = 24.25px   read 12.5%    = 12.13px
track 97px  stack 97px   watch 16.6667% = 16.16px   read 48.6111% = 47.14px
```

That answers the question the harness's own header poses — *do the percentage heights actually
resolve, or does a percentage against an auto-height parent silently become `auto` and collapse
the bars?* **They resolve.** The 2px-overflow fix from the earlier slice also holds on the
two-segment case it was never able to be tested against.

### CLOSED — the Continue-Watching widget at a non-default size

It computes its own row count from the height `WidgetFrame` gives it, so this was only ever
answerable at a real size. All three, none overflowing:

| frame | body | content | rows |
|---|---|---|---|
| default 320 × 250 | 218px | 218px | 3 |
| **minimum 240 × 130** | 98px | 98px | **1** |
| tall 360 × 400 | 368px | 368px | 4 |

The registry **minimum** is the non-default size the item was actually about, and one row fits
it exactly with no overflow.

### STALE — "old-player deletion remains a product decision"

It was already false when slice 31 wrote it. `legacyPlayerDeleted20260731` records
**"DONE 2026-07-31 — slice 16. Old-player retirement is now COMPLETE"**, with the user decision
stated twice and the rollback cost documented. The item should never have been carried.

Its entry names the real remainder, and this slice measured it exactly rather than repeating the
vague version: **49 of `MediaState`'s 151 members are named nowhere outside `MediaContent.tsx`**
— `showPlayer`, `videoWrapRef`, `stepFrame`, `toggleFullscreen`, `togglePictureInPicture`,
`markAbStart`/`markAbEnd`/`clearAbRepeat`, `handlePlayerPlay`/`handlePlayerPause`, `clearPlayer`
and 39 more. Dead exported surface, invisible to ESLint and to the audit because the interface
is exported and the members are only ever read through it.

**Not executed, for a reason with evidence rather than a preference.** `MediaContent.tsx` carries
mtime **09:13:04** — the exact bulk timestamp slice 29 identified as *another session's
in-flight work* ("over a hundred `src` files … share a single bulk mtime of 09:13:04–05"). Only
this session's own three files are newer. Slices 21 and 29 both recorded what happens when you
edit another session's in-progress work; a 49-member refactor of a 2,392-line file is the worst
possible place to repeat it. The list above makes it a ten-minute job **once the tree is quiet**.

### BLOCKED — the per-row mining rollup against a live Anki

AnkiConnect on `127.0.0.1:8765` does not answer: Anki is not running. The rollup cannot be
measured without it, and this one genuinely needs the user, because the destructive-risk
constraint at the top of this file is explicit — Anki is live on the real 82-deck collection,
and only the namespaced self-cleaning probe deck may be touched. **Start Anki and re-run; that
is the whole of what is missing.**

## SLICE 30 — SOMEBODY FINALLY PRESSED `;`. The standing keypress item is closed as far as a keypress can close it — by routing around the unstable tree, not by waiting for it.

Evidence: `docs/migration/proof/packaged-blanc-20260801104500/slice-30.json`.
Reproduce:

```
node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
node docs/migration/tools/packaged-blanc-harness.mjs --datadir=<that dir>
```

**Seven phases PASS, twice.** The new phase G presses `;` and `'` with real key events in a
packaged build:

| key | offset before | after | expected |
|-----|---------------|-------|----------|
| `;` | 0 | **−0.1** | −0.1 |
| `'` | −0.1 | **0** | 0 |
| `x` (control) | 0 | **0** | unchanged |

That is the full keyboard path — window keydown → `chordFromEvent` → `effectiveKeys`
normalization → `chordMatches` → the handler stack → `changeSubtitleDelay` → the rendered
offset. Slice 22 proved that path for the three rows that **seek**; this proves it for the two
that move the **subtitle delay**, a different handler and a different observable. The item was
carried by slices 19, 20, 21, 22 and 29.

### How it got unblocked, which is the transferable part

Slice 29's phase H sits behind phase E in a **dev-route** harness, and phase E regressed under
another session's concurrent edits to the tree. Re-running it would keep measuring a tree nobody
has a stable picture of.

So the phase moved to the **packaged** harness. **A packaged artifact is frozen at build time
and does not move when the working tree does; a dev-route harness re-reads the tree on every
run.** The build used is the same 09:28 artifact slice 27 verified, untouched.

> **When slice 21's hazard recurs — and it will — a frozen artifact is not merely an acceptable
> substitute for a dev run. It is the only route whose result means anything.**

### Instrument traps this phase has already paid for

- **Not `data-timing-delay`.** It looks like the obvious seam; it lives on the drift-tracking
  section and only renders while `driftTracking && timingDrift`. A phase built on it reads
  `null` in an ordinary run and looks like a broken *shortcut* rather than a missing instrument.
- **Text shape, not `aria-label`.** Every label here goes through `useT()` and the app ships
  four UI languages. A selector keyed to English passes on an English machine and fails after a
  language switch.
- **`;` and `'` are not letters.** The `Key${K}` code and letter VK table used for R/W/S do not
  describe them; a wrong `code`/VK pair dispatches happily and matches nothing, which reads
  exactly like "the binding does not fire". Use `Semicolon`/186 and `Quote`/222.
- **No expansion step needed.** The subtitle-offset cluster is in the `study-control-primary`
  row, not behind `toggle-study-controls`. A phase that expands first is testing the expander.

### What remains, and why it is not a deferral

`subEarlierLarge`, `subLaterLarge`, `toggleAutoPause`, `toggleLoop` and `toggleFurigana` ship
with `defaultKeys: ''`. `effectiveKeys` returns `''` and `chordMatches` is false for **every**
chord — they are **unpressable by design** until a user binds them. *"Press them"* is the wrong
test and no harness work will make that keypress exist. The untested claim for those five is
**bind-then-press** through `ShortcutSettings`, which needs a settings-driving phase no harness
has. That is a statement about what the rows *are*.

No `src` changed, so slice 27's totals stand (vitest 332 / 3,803, `tsc` 288). Slice 29's phase H
stays on disk in `retirement-step3-harness.mjs`, still unverified — it is the right phase for
the dev route once the tree is quiet.

## SLICE 29 — BLOCKED, AND THE REASON MATTERS MORE THAN THE SLICE. Another session is editing this tree while harnesses run against it.

Evidence: `docs/migration/proof/retirement-step3-20260801065913/slice-29.json`.

**Phase H is written and has never run.** It closes the two of the seven remaining `video.*`
rows a user can actually press — `subEarlier` (`;`) and `subLater` (`'`) — with real key
events, using the `<output>` in the subtitle-offset cluster as its instrument. It cannot be
reached: **phase E now fails**, and phase E runs first.

### Read this before writing a phase for the other five rows

`subEarlierLarge`, `subLaterLarge`, `toggleAutoPause`, `toggleLoop` and `toggleFurigana` ship
with `defaultKeys: ''`. `effectiveKeys` returns `''` and `chordMatches` is false for **every**
chord, so they are **unpressable by design** until a user binds them. *"Press them"* is the
wrong test and no amount of harness work will make that keypress exist. What is untested for
those five is **bind-then-press**, through `ShortcutSettings` (Settings → Shortcuts does expose
the Video category) — a settings-driving phase no harness currently has.

Two traps phase H already pays for, worth keeping if it is rewritten:

- **Not `data-timing-delay`.** It looks like the obvious seam and it lives on the drift-tracking
  section, so it only exists while `driftTracking && timingDrift`. A phase built on it reads
  `null` in an ordinary run and looks like a broken shortcut.
- **`;` and `'` are not letters.** Phase G's `Key${K}` code and its letter VK table do not
  describe them. A wrong `code`/VK pair dispatches happily and matches nothing — which also
  reads as "the binding does not fire". Use `Semicolon`/186 and `Quote`/222.

### The phase E regression, and what it is not

Signature: `replay-cue` returns **null** (disabled — no active cue at the 7.3 park) and
`next-cue` returns **cue 0 (2.0)** instead of cue 1 (6.5); `previous-cue` is correct. All three
are explained by **`allCues` holding only cue 0**, where passing runs had cues 0 and 1.
Deterministic across three runs and three independently prepared datadirs. Last known pass is
`proof/retirement-step3-20260801044332`, **04:43 today**.

The harness's own comment at the track-selector step already describes this exact signature as
what happens when something makes directstream start a **new subtitle stream**. The harness
deliberately never touches the selector, so something else now is.

**It is not slice 27's identity gate.** That was the only plausible candidate, so it was
bypassed in source, the renderer rebuilt, and the harness re-run: **phase E failed identically
with the gate off.** The gate is restored and the rebuilt `StudyPlayerSlice` chunk hashes
identically to the packaged build's (`CJVhO60x`). The session's other change is `main.ts`'s CSP,
which only *adds* sources to the `app://` origin and whose absence would stop playback outright
rather than thin cue delivery — and playback passes (phase C).

### The finding worth carrying

**This tree is being modified by another session while this one works in it.** Over a hundred
`src` files this session never touched share a single bulk mtime of **09:13:04–05** — including
`renderer/views/MangaReader.tsx`, `shared/anki.ts`, `renderer/keyboardShortcuts.ts` — landing
*between* this session's two package builds (09:08 and 09:27). Nine more changed in the
04:43–09:00 window, among them `shared/directstreamOpenRecovery.ts` at 07:22.

Every `.vite` build made after that necessarily contains that in-progress work, so **any
dev-route harness result from this point is measuring a tree nobody has a stable picture of.**
Slice 21 recorded the lesson — *the tree is not the record of what has been done, and it is not
stable while you work in it* — and this is the first time it has invalidated a **harness phase**
rather than an edit. Unit tests do not catch it: 332 files / 3,803 tests pass throughout.

No attempt was made to find or fix the cue-delivery regression. It sits in another session's
in-flight work, and touching it while that session is live repeats the mistake slice 21 warned
about. **Re-run the harness once the tree is quiet**; if phase E recovers, phase H runs for free.

## SLICE 28 — THE LARGE FIXTURE OPENS JUST AS FAST. Slice 26's last remaining route to a production failure is REFUTED.

Evidence: `docs/migration/proof/blanc-open-retry-20260801101500/slice-28.json`.
Reproduce:

```
GPLAY_SECOND_EPISODE=1 GPLAY_SECOND_SOURCE=<a real episode, WINDOWS path> \
  node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
COLD_SECOND=1 node docs/migration/tools/blanc-player-open-retry-probe.mjs --datadir=<that dir>
```

Slice 26 wrote down the one thing that could still bite a packaged user: *"MKV metadata parsing
scales with the file, and a real episode is ~100x this fixture. A warm-sidecar open of a real
episode may well exceed 45 ms, and 43 ms is all the terminate needed."*

**It does not.** With a real **2.33 GB** episode as the B side (1.7x the ~1.4 GB slice 26 asked
for):

| run | POST | terminate | watch | terminate inside window | recovery |
|-----|------|-----------|-------|--------------------------|----------|
| 1   | 11 ms | 29 ms | **36 ms** | yes | never fired |
| 2   | 14 ms | 32 ms | **39 ms** | yes | never fired |

Against ~45 ms for the 11 MB fixture. A **213x** larger file is, if anything, *marginally
faster*. `directstream` prepares a stream; it does not parse the container end to end, so the
premise the risk rested on is simply wrong for this path.

That the large file really was the one playing is not taken on trust: step 2 reports
`duration 1425.525` at `1440x1080`, and the fixture is `30.386` at `1920x1080`.

### The second finding, which matters more

**In both runs the `video-terminated` landed *inside* the open window — and the open survived.**
Slice 26 saw the same (terminate 93 ms, watch 95 ms). So *"the terminate fires into the open
window"* is demonstrably **not sufficient** to kill an open: it has now been observed landing
there four times across two slices without once causing the failure it is supposed to cause.

**Honest position.** Slice 25 refuted one route, slice 26 showed the two halves are
anti-correlated, and this removes the last named condition under which they were supposed to
combine. Across every non-StrictMode measurement — small file, cold file, large file, packaged
build — **no instance of this branch actually killing an open has ever been observed.** The
recovery stays in place and stays unused.

### What is still untested

- **Storage latency, not file size.** Both runs are a local SSD. A file whose first read blocks
  for seconds — spinning rust, a network share — could still widen the window. That is now the
  *only* untested shape.
- **A genuinely cold OS file cache.** The 2.33 GB file is copied in before the scan, so the
  cache may have been warm for it.

### A guard that paid for itself immediately

The first invocation passed a bash-style `/c/Users/...` path; node resolved it to
`C:\c\Users\...`. The new existence check failed loudly instead of silently falling back to a
second copy of the fixture — which would have produced a confident, wrong *"large files are
fine"* result from a run that never touched a large file. **On this tool, a missing B side must
never degrade to the fixture.**

No `src` file changed, so slice 27's totals stand (vitest 332 / 3,803, `tsc` 288). Changed:
`docs/migration/tools/prepare-gplay-datadir.mjs` (`GPLAY_SECOND_SOURCE`, plus the B side's
path/source/bytes in the manifest).

## SLICE 27 — IT PLAYS IN A PACKAGED BUILD. The player was never the problem; the packaged CSP was, in two places, and a third defect was hiding behind them.

Evidence: `docs/migration/proof/packaged-blanc-20260801100500/slice-27.json`.
Reproduce:

```
npm run package
node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
node docs/migration/tools/packaged-blanc-harness.mjs --datadir=<that dir>
```

All six phases PASS, twice consecutively. **One POST, one socket never closed, zero
`video-terminated` before the `watch`** — so slice 24's recovery is inert in a real packaged
build, not merely in a dev build with StrictMode off (slice 25). That was the open question.
The datadir is single-use for playback; prepare a fresh one per run.

### The two CSP defects, and why dev could never have caught them

The packaged CSP is registered only for the `app://` origin. **Dev serves from the Vite
origin, which that header never touches** — so every one of these is packaged-only and
invisible to `npm start`.

1. **`connect-src` blocked every renderer call to the sidecar.** The player never loaded. No
   POST, no socket, no exception, no failed load — *every channel read empty*, which is why
   the first two harness runs looked like nothing had happened. A CSP block is not an
   exception and not a failed load: the request never reaches the network stack, so
   `Network.*` says nothing, and the gate's `fetch` rejects with a plain `TypeError` the
   caller catches. **The browser's only report is a `Log.entryAdded` entry with source
   `security`** — the harness now enables the `Log` domain for exactly this reason.
2. **`media-src` blocked the `<video>` element, one directive behind it.** With `connect-src`
   fixed the open got a live socket, one clean POST and a `watch` at 1514 ms — *and still no
   picture*.

**The standing rule.** `connect-src` and `media-src` cover different steps of the same open:
`connect-src` the `fetch()` that **prepares** the stream, `media-src` the element that then
**plays** it. The 2026-07-17 audit that wrote this CSP verified the renderer made no direct
`fetch()` calls to **external** hosts — true, and it could not have found either defect: the
sidecar is loopback, so it was outside the question, and a `fetch()` grep cannot see a
`<video>` src at all. Any host added for playback must be checked against both directives.

Ports are wildcarded (`http://127.0.0.1:*`, `ws://127.0.0.1:*`) deliberately: **a CSP binds to
a document at load time**, so the live port cannot be named — Blanc can open before the
sidecar has a port, and the supervisor can restart it onto a new one while that document stays
loaded. Neither is reachable by re-registering the header.

### The defect that was hiding behind them: a double open under two client ids

Only measurable once the video actually loaded. **Phase E's apparent PASS in the intermediate
run was a false pass** — with media blocked, the open never got far enough to issue the second
POST. Once it did: **two POSTs 2 ms apart, same file, different `clientId`s**, same initiator.
Not the recovery, which runs on a 1 s interval and could not fire at 2 ms.

The client id is **not settled when the socket reports open**. `requests.ts` publishes one from
the `/api/v1/status` HTTP response; the server then names its own over the socket ~10 ms later.
Both are non-empty, so both pass a `!clientId` guard — and `clientId` is the launch effect's
first dependency, whose cleanup nulls `launchedRequestRef`, so the id change re-opened the same
request.

**The first POST is the wrong one**, which is why suppressing the second would have been the
wrong fix: the socket is registered server-side under the id the server named, so the first
prepared a stream the sidecar would never route to this socket — orphaned, and left prepared.

Fix: a `clientIdentityConfirmedAtom`, fed by a new `onIdentityConfirmed` listener on the socket
pool, which the launch effect gates on alongside `connected`. A 2 s fallback
(`IDENTITY_CONFIRM_FALLBACK_MS`) keeps a server that never sends `CLIENT_IDENTITY` from
stranding the gate; measured arrival is ~10 ms, so it is never reached in practice.
Confirmation is **sticky across reconnects** — a reconnect re-sends the confirmed id, so
clearing it on close would turn a routine blip into a stalled player.

**Anything that addresses the sidecar BY client id must gate on confirmation, not on
`websocketConnectedAtom`. They are not the same moment.**

Gates: vitest **332 files / 3,803 tests** unchanged, `tsc` **288** unchanged, eslint 0 errors on
the four changed files (`src/main.ts`, `seanimeSocketPool.ts`, `StudyWebsocketProvider.tsx`,
`StudyPlayerSlice.tsx`). **Not done:** no unit test covers the identity gate — it is timer and
listener wiring around a live socket, and phase E is what covers it. One run
(`proof/packaged-blanc-20260801094500`) flaked with `exe null` from the `ExecutablePath` query
and is recorded rather than hidden; the same build passed twice immediately after.

## SLICE 26 — THE COLD A-TO-B OPEN DOES NOT BREAK. "Cold file" and "cold sidecar" are different things, and slice 25 conflated them.

Evidence: `docs/migration/proof/blanc-open-retry-20260801091500/slice-26.json`.
Reproduce:

```
GPLAY_SECOND_EPISODE=1 node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
COLD_SECOND=1 node docs/migration/tools/blanc-player-open-retry-probe.mjs --datadir=<that dir>
```

Slice 25 predicted that a **cold** second file would lose the race its warm run won by 1 ms.
Built that fixture and ran it. **The prediction is wrong**, and why is the finding:

```text
second open, a DIFFERENT never-opened file:  POST 50 -> terminate 93 -> watch 95   = 45 ms
run A, fresh sidecar, first open ever:       POST 1443 -> watch 6738               = 5.27 s
```

A second open takes ~45 ms **whatever file it is**. What took 5.27 s in run A was not the file
being cold — it was **the sidecar being cold** (first open of a freshly started process in a
fresh datadir). Once the process is warm, every open is fast, including one for a file it has
never parsed.

**So the two halves are anti-correlated.** The wide window belongs to the first open of a
sidecar session — exactly the case where there is no previous playback, so `playbackInfo` is
*already* null and the effect's null branch does not re-run. The terminate belongs to the
A-to-B transition — which by definition happens when the sidecar is warm and the open is fast.
The two conditions that would combine into a production failure tend to **exclude each other**,
which is consistent with this defect only ever having been seen where StrictMode manufactures
the terminate at mount.

### What this does not prove

- **Not that production is safe.** The fixture is 11 MB / 30 s; a real 1080p episode is ~1.4 GB
  and MKV metadata parsing scales with the file. A warm-sidecar open of a real episode may well
  exceed 45 ms, and 43 ms is all the terminate needed. That needs a **large fixture**, not
  another probe change.
- **Not an explanation of the Phase-3 "intermittent" open.** Slice 24 attributed it to this
  branch; slice 25 refuted one route and this weakens the other. Honest position: *the branch is
  real and fires, but no non-StrictMode instance of it actually killing an open has been
  observed.*

### The run before it was a fixture blocker wearing a defect's costume

The first attempt copied the second file in **after** the datadir was prepared and seeded it
through the app's `addMediaPaths`. Step 2 failed with *"Playback Error — The playback service
could not open this file. It is usually a codec or container it cannot read"*. That is
`describeLocalOpenFailure`'s 5xx sentence: **the sidecar answers HTTP 500 for a path its own
scan never registered.** Nothing was wrong with the file, the copy, or the player.

`GPLAY_SECOND_EPISODE=1` now copies the second episode **before** the scan and the prepare tool
**asserts the scan registered it**; the probe refuses to run `COLD_SECOND` against a datadir
that lacks it rather than copying the file itself. Third fixture-shaped false defect in this
track's record after the 1×1 GIF and the 0.4 s silent audio: **ask whether the fixture can show
the thing before believing what it shows.**

### Incidental confirmation

Step 1 of both cold runs carried the full dev signature — 2 sockets, 1 close, 2
`video-terminated` — and **passed anyway**. Slice 24's recovery has now saved the first open on
**four** independently prepared datadirs.

### Gates

**No `src` file changed**, so slice 25's measured totals stand (3,803/332, `tsc` 288). Changed:
`prepare-gplay-datadir.mjs` (opt-in flag + its scan assertion) and
`blanc-player-open-retry-probe.mjs` (`COLD_SECOND`, parametrised `clickCard`).

**The machine crashed shortly after this run.** Nothing was lost — every record above was
written from on-disk evidence afterwards, both proof JSONs parse, and the crash left no orphaned
Electron or sidecar processes. It did kill the developer's `npm start` and the harness dev
server on 5173.

## SLICE 25 — STRICTMODE OFF, THREE TIMES. One of slice 24's production claims is refuted; the other is measured at last.

Evidence: `docs/migration/proof/blanc-open-retry-20260801084500/slice-25.json`, with the three
run records at `proof/blanc-open-retry-20260801081500/` (A), `-20260801082500/` (B) and
`-20260801084500/` (D).
Reproduce: remove `<React.StrictMode>` from `src/renderer/blancMain.tsx`, then
`A_ONLY=1 node docs/migration/tools/blanc-player-open-retry-probe.mjs --datadir=<fresh>`;
add `STATUS_DELAY_MS=6000` for run B; drop `A_ONLY` for run D. **Restore `blancMain.tsx` from a
copy and verify by sha256** — it was, `37D23AA3…3E8BFFF8`, and StrictMode is back at lines
135/139.

Slice 24 shipped a fix and made **two claims about production it had not measured**: that the
recovery would never fire in a packaged build, and that the same cancel reaches any build when
`/api/v1/status` resolves after the open. The dev/prod difference that matters here is exactly
one thing — whether effects are double-invoked on mount — so removing StrictMode reproduces the
production effect lifecycle **without a 4 GB build**.

### Run A — production shape, ordinary timing. The signature is gone.

```text
sockets opened 1 (was 2)      sockets closed 0 (was 1)
video-terminated frames 0 (was 2)     discord/presence/cancel 0 (was 2, i.e. doubled)
directstream POSTs 1          the recovery NEVER FIRED       step 1 PASS
```

The doubled `discord/presence/cancel` was the adopted lifecycle effect's null branch running
twice; its absence is what says the branch never ran. **This is what a packaged build should
look like, measured at the effect level.**

**And one number worth keeping:** the *cold* open took **5.27 s** from POST to `watch` — a slow
metadata parse, entirely healthy. A total-elapsed deadline of 5 s would have re-opened it for
nothing; the silence rule kept it alive because `open-and-await` re-armed the clock at 1465 ms.
First direct evidence for choosing silence over elapsed time.

### Run B — REFUTED. The thing that would cancel the open is the thing the open waits for.

Slice 24 said the cancel reaches any build when `/api/v1/status` resolves after the open, since
both `waitForWatchHistory` deps derive from it. Held that response for **6 s** with CDP `Fetch`
interception (narrow pattern, or the video stream pauses too):

```text
status held 6000 ms        first directstream POST at 7968 ms   <- AFTER the release
```

The adopted surface **waits for that query before issuing the open**, so the ordering that route
requires cannot occur. The claim was derived from a dep list and it was wrong; slice 24's record
is corrected rather than quietly dropped.

### Run D — the real production route, and it is the one nobody had asked about

`open-and-await` sets `state.playbackInfo` to null **by design**. So on a second open,
`state.playbackInfo?.id` changes from the playing file's id to `undefined` — the first dep of
that same effect — and its null branch dispatches `video-terminated` at a preparation that is in
flight. **No StrictMode required.** Continue-watching, the palette's resume and Statistics'
By-show rows all issue exactly this kind of open.

```text
32  POST                     41  open-and-await   (BeginOpen ok)
64  ws SEND video-terminated  <- INSIDE the open window, with StrictMode OFF
65  watch                     <- the preparation completed anyway, by 1 ms
```

**It fires. It just did not win this time**, because the file was warm — opened 10 s earlier, so
the whole preparation took 33 ms. Run A measured a cold one at **5.27 s**: the same window,
~160× wider. The exposure is switching to a **cold** file while one is playing, and slice 24's
recovery is what stops that being a dead panel. Finishing it needs a second, *different* file in
the fixture library so step 2's open is cold — `prepare-gplay-datadir.mjs` seeds exactly one.

### A probe correction, and it is the third of this shape in two slices

Step 2 waited for `readyState >= 2`. Slice 24 made step 1 succeed — so the **old** video was
already loaded, the wait returned in ~30 ms, the trace window closed before the second open had
done anything, and it reported `firstWatchAtMs: null` with the video "ready". Step 3 then threw
`Cannot read properties of null`, because the element really is replaced mid-transition. It now
waits for a `watch` frame **for that open**.

**An assertion is vacuous when the thing it waits for was already true** — slice 24's phase I
asserted a key worked with no active cue to act on; this asserted a second open had completed by
looking at the first one's video. *Fixing the defect a probe was built around is exactly when its
assertions go stale.*

### Why there is still no packaged run

The existing package is from 2026-07-30 and **predates the whole Blanc line** — grepped its
renderer assets: `MediaPlayerSurface` 0 files, `blanc-study-player` 0 files, `openStalled` 0
files. Driving it would measure a build with no Blanc player in it. A fresh one was not built
because **the developer's own app was running** (`--user-data-dir=…AppData\Roaming\jp-study-app`,
started 07:11) and a ~4 GB package would fight it for the machine for several minutes. Rename
`out/jp-study-app-win32-x64` aside first — that rename failed once while a shell still held the
directory.

### Gates

**No `src` file changed in this slice**: `blancMain.tsx` was a control and is restored, verified
by sha256. tests **3,803 / 332**; `tsc` **288** — the baseline; `node --check` clean. The only
permanent change is `blanc-player-open-retry-probe.mjs` (the `STATUS_DELAY_MS` hold, the step-2
trace window, step 2b).

### NOT proven live

- **A packaged Blanc, for real** — `app://`, asar paths and the packaged sidecar slot are
  untouched by this slice. Still the top item, and now it needs a `npm run package` on a free
  machine rather than an argument.
- **The A-to-B cancel actually killing an open.** Both halves are measured; the combination is
  not. Needs a second, colder file in the fixture library.
- The other six `video.*` rows still have not been pressed anywhere — slice 22's item.
- Music keyboard navigation still does not exist, and must not be built by reusing `video.*` ids.

## SLICE 24 — BLANC'S FIRST OPEN WORKS. And the cause was not the one every record named.

Evidence: `docs/migration/proof/blanc-player-live-20260801075500/slice-24.json`.
Run record: `proof/blanc-player-live-20260801075500/blanc-player-live.json` — **10 phases, all
PASS, `open attempts 1`**. Before/after diagnostics: `proof/blanc-open-retry-20260801071500/`
and `-20260801072500/` (both FAIL step 1), `-20260801073500/` (PASS).
Reproduce: same two commands as slice 23; the narrow one is
`A_ONLY=1 node docs/migration/tools/blanc-player-open-retry-probe.mjs --datadir=<fresh>`.

### Read this part even if you skip the rest

**Every record in this repo named the wrong cause, and the fix that followed from it would
have changed nothing.** Slice 23's section below, `blanc-player-harness.mjs`'s header, the
probe's own hypothesis and `progress.json` all said: StrictMode leaves two sockets on one
client id, and *"the pinned sidecar cancels the in-flight preparation when the released
socket's disconnect arrives"*.

The pinned sidecar has **no disconnect-cancels-preparation path**.
`internal/handlers/websocket.go` calls `RemoveConn(id)` on a read error and nothing else.
`preparationCanceled` is set only by `cancelPreparationLocked` — reached from `CancelOpen`,
`CloseOpen`, or a **`player.TerminatedEvent`** in `directstream/stream.go`'s
`listenToPlayerEvents`. And that event originates in the **client**, as `video-terminated`.

Measured with CDP `Network.webSocket*` frames, captured from before the click that mounts the
tree (no page patching — hooking `WebSocket.prototype.send` would have to happen before the
mount under measurement):

```text
1920  mount            the DOUBLED discord/presence/cancel is the adopted lifecycle
                       effect's null branch running twice
1920  ws OPEN  socket 1        1920  ws OPEN socket 2 (same client id)
1922  ws CLOSE socket 1
2000  POST /api/v1/directstream/play/localfile
2018  ws RECV native-player {open-and-await "Loading stream..."}   <- BeginOpen succeeded
2112  ws SEND videocore {video-terminated} ×2   <- THE CANCEL. From the client. 190ms later.
9177  POST -> 200, having done nothing
```

**The disconnect is a co-symptom, not the cause.** Order in a log is not causation. A linger
in `seanimeSocketPool.ts` so a release/re-acquire never reaches the server was the obvious
next move under the old cause; it would have fixed nothing.

### What the defect actually is, and why it is not dev-only

`POST /directstream/play/localfile` answers **200 whether or not the preparation survives**,
and a cancelled preparation sends the client **nothing at all** — no error, no `abort-open`.
Two ways in, both real:

- **Deterministic, in dev.** `React.StrictMode` double-invokes effects on mount, so the
  adopted lifecycle effect (`video-core.tsx`, `useUpdateEffect` on
  `[state.playbackInfo?.id, waitForWatchHistory, shouldWaitForWatchHistory]`) runs its
  `if (!state.playbackInfo)` branch once spuriously. Blanc mounts the surface and issues the
  open in the **same commit**, so it loses this race every time.
- **Intermittent, in any build.** ~~`waitForWatchHistory` and `shouldWaitForWatchHistory` are
  both derived from `serverStatus.settings.library.enableWatchContinuity`, so a
  `/api/v1/status` that resolves after the open flips a dep and runs the same branch.~~
  **Refuted by slice 25 — that ordering cannot occur, because the surface waits for the same
  query.** The route that IS measured in production shape is a **second open while a file is
  playing**: `open-and-await` sets `playbackInfo` to null by design, so
  `state.playbackInfo?.id` changes to `undefined` and the same branch runs. See slice 25 above.
  `StudyPlayerSlice.tsx` has called this open "intermittent" in a comment since Phase 3 and
  three harnesses carry retries for it; this branch is still the best explanation, but which
  route produced it historically is not established.

The event comes from adopted code, which ADR-004 keeps unedited — and suppressing it would be
wrong anyway: `video-terminated` is correct when a player really goes away. **What was missing
is on our side: the open had no failure detection at all**, so a preparation that died silently
was indistinguishable from one that was merely slow.

### The fix: measure SILENCE, not elapsed time

`src/shared/directstreamOpenRecovery.ts` (pure, 9 tests) plus a recovery effect in
`StudyPlayerSlice.tsx`. The deadline runs from the **last sign of life** — the POST, then every
native-player message. A live preparation reports its steps (`updateOpenStepLocked` →
`openAndAwait`), so a slow metadata parse keeps re-arming the clock while a cancelled one goes
quiet at once. **8 s of silence → re-open, once. A second silent window → a real error**
(`mediaWorkspace.openStalled`, translated in ja/zh/ru).

A total deadline could not have worked: in the failing run the first POST's own response did
not arrive until **5.8 s** after it was issued, while the preparation had been dead since
2112 ms. It is **its own effect**, not part of the launch effect, because folding it in would
tie the deadline to that effect's cleanup — and StrictMode's double-invoke, the very thing that
makes this deterministic, tears that cleanup down and re-runs it. It is **pure and in
`shared/`** because `src/media/**` is outside every `vitest.config.ts` include glob.

The recovery, in the post-fix trace:

```text
2165  POST #1        2204 open-and-await (last sign of life)      2269 video-terminated ×2
7977  POST #1 -> 200, having done nothing
11120 POST #2        <- the recovery: 8.9s of silence (8s window + one interval tick)
11122–11135  three open-and-await steps   <- a LIVE preparation
11143 watch          11820 HTTP 206 /api/v1/directstream/stream
```

**`openAttempts === 1` is now a GATE in phase G**, not a recorded number. The retry that lived
in `blanc-player-harness.mjs` (10 s settle + a re-request) and in retirement-step3 belonged in
the product; needing the harness's help is now a failure.

### Phase I was asking a question it had not earned

The first post-fix run **failed phase I**: `R -> null`, `W -> 2.007`, `S -> 2.0175`. It reads
exactly like a broken keymap. It was not: **there was no active cue at the 7.3 s park**, so
`video.replayLine` had nothing to replay and doing nothing was correct. Cue delivery is a race
— a seek makes directstream start a new subtitle stream from that position, and each stream
here delivers **one** event before the parser goroutine finishes.

Settled by comparing the sidecar logs of the failing run and slice 23's **passing** one: they
show the same per-stream delivery, so the difference is timing, not behaviour, and not this
slice's change. Phase I now **reads the precondition** — the overlay publishes its active cue
as `data-cue-index`/`-start-ms` on `.study-cue-overlay` — waits for it with small in-cue
nudges, and reports "NO CUE WAS ACTIVE AT THE PARK" as a **distinct failure** from a key that
did not reach the overlay. Re-run: active cue index 1 (6500–9250 ms), `R -> 6.505514`,
`W -> 2.011799`, `S -> 6.511372`, control `x -> null`.

Slice 23 learned that a bounds check cannot tell *bounded* from *collapsed*. This is the same
shape one level up: **an assertion about an ACTION must first establish that the action had
something to act on**, or its failure is unattributable.

### A probe bug worth not repeating

`videoTerminatedFramesSent` read **0** in the first probe run while the rows it was summarising
held **two**. The frame's own `type` is `videocore`; `video-terminated` is the type of the
payload *inside* it. The raw rows were kept in the record, so reading them caught it — a run
that printed only the summary would have concluded the client sent nothing and gone back to
staring at the socket. Same class as slice 18's `bytes > 0` against a silent fixture.

### Gates

tests **3,797 / 332** (+9, +1 file, all this slice's; baseline 3,788/331) — and a confirmation
run 13 minutes later read **3,803 / 332**, because this tree is shared with three other tracks
and +6 arrived from one of them mid-session. State measured totals, never a delta you did not
cause. `tsc` **288** — the baseline, **0 in any changed file**; i18n exit 0 at **6,349** keys (+1, translated); ESLint exit 0, **0 warnings**;
architecture audit exit 0 "Nothing new"; renderer build clean to a scratch `--outDir` in 42.8 s
with the dev server up; CSS containment **6,950/6,950 scoped, 0 unscoped**. Control: replacing
the verdict with the pre-fix behaviour fails **3 of the 9** guards; restored from a copy and
verified by **sha256**, never `git checkout`.

**The main window was regression-checked, and it had to be**: the launch effect this slice
changed is shared with the workspace, so Blanc passing proves only half of it.
`retirement-step3-harness.mjs`, **all 7 phases PASS**
(`proof/retirement-step3-20260801044332/`) — playback, the cue transport, the `R`/`W`/`S` keys
with the `X` control, no orphan after quitting mid-playback, and resume across a real restart
(quit at 11.863, resumed at 14.262).

**And the tree moved under this session again** — five `src` files changed that are not this
slice's (`ResultPanels.tsx`, `scraper/strings.ts`, `theme/tokens.ts` and two renderer tests).
Third time this track has recorded a live writer in the same tree. Every gate above ran with
their work in it.

### NOT proven live

- **A packaged Blanc has still never been driven at all.** The dev route to this defect is
  gone, but the recovery has only run in a dev build — where StrictMode guarantees it fires. In
  a packaged build it should **never** fire, and nothing has confirmed that. This is now the
  top item.
- **The intermittent production route has not been reproduced deliberately.** It is derived
  from the adopted effect's dep list plus the measured dev instance, not observed on its own.
  Forcing it would mean delaying `/api/v1/status`.
- The other six `video.*` rows still have not been pressed anywhere — slice 22's item.
- Music keyboard navigation still does not exist, and must not be built by reusing `video.*`
  ids.

## SLICE 23 — BLANC'S PLAYER HAS BEEN WATCHED PLAYING A FILE. Both of slice 15's open questions are answered, and one of them was "no" until this slice fixed it.

Evidence: `docs/migration/proof/blanc-player-live-20260801065000/slice-23.json`.
Run record: `proof/blanc-player-live-20260801065000/blanc-player-live.json` (10 phases, all PASS).
Reproduce:

```
node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
node docs/migration/tools/blanc-player-harness.mjs --datadir=<that dir>
```

Needs the dev server on 5173, and **a prepared datadir is single-use for playback** — build a
fresh one per run. Same rule as slice 22.

**This section was missing until 2026-08-01 07:xx.** Slice 23 wrote its proof and its
`progress.json` entry (`blancToolboxPlayer`) at 06:11 and never wrote its handoff section, so
for an hour the file that tells the next session what to do still carried *"Blanc's toolbox
player has still never been watched playing a file"* as the top standing item — an item that
was closed. `progress.json` is the machine record; **this file is the one a session reads
first**, and a slice is not landed until it is in both.

### The standing item, and why the old run could not have closed it

Slices 15, 16, 19, 20, 21 and 22 each re-recorded it. The 23:25 attempt
(`proof/blanc-player-live-20260731232500/`) ran with the sidecar **stopped** — but that was the
smaller of two reasons and on its own would only have delayed the answer. **The larger one is
that the run never looked at Blanc.** Blanc's toolbox is a separate `BrowserWindow` loading
`blanc.html?blanc=1`, opened over IPC by `window.api.blancOpen()`. The old harness dispatched
`os:open` with detail `blanc` **inside the main window**, and filtered CDP targets with
`type === 'page' && !url.includes('?')` — which excludes the Blanc window **by construction**,
since its URL is the one carrying the query string. Every phase after A asserted against the
main window's DOM, and phase C's *"a Blanc surface is present in this window"* came from the
loose `[class*=blanc]` arm of its selector matching a **taskbar button**
(`button.os-task-win.app-blanc.active`).

Phase B of the new harness **reproduces both moves and records that match**, so the correction
is evidence rather than assertion. And the harness no longer has a `note()`/INFO helper at all:
**six INFO rows exiting PASS is what let "never watched playing a file" survive two slices
without reading as a failure.**

### Question 1 — geometry. The answer was "no", and a bounds check could not see it.

`#media-workspace.blanc-study-player` did not bound the adopted surface; it **collapsed it to
nothing**. Measured (`proof/blanc-open-retry-20260801061000/`): frame **392x0**, `scrollHeight`
0, `clientHeight` 0; `.study-player-slice` `position: fixed` at 392x0; `<video>` 392x0 — while
that same video was decoding at 1920x1080 with its clock advancing. Nothing was on screen.

Two causes, both in `src/renderer/theme/blanc-media.css`, both fixed:

- **`max-height` alone left the frame's own height `auto`**, and everything below
  `.study-player-slice` in the adopted tree is a chain of Tailwind `h-full` (`height: 100%`)
  divs. A percentage of an auto height is zero, so the whole subtree resolved to zero. The frame
  now carries a **definite** height: `clamp(180px, 60vh, calc(100vh - 200px))`.
- **The slice is `position: fixed; inset: 0`** (`mediaWorkspace.css`), which is right when it
  *is* the screen. Inside the toolbox a fixed child is out of flow, so it contributed no height
  to the frame either. `height: auto` was the previous attempt at correcting this and is exactly
  what the measurement disproved. It is now `position: relative; inset: auto; height: 100%`.

After the fix: frame 392x221 (`max-height` 221px, `overflow-y: auto`, `contain: layout paint`),
video 392x189 at y 191 (the 45vh cap holding), dock 353x165, all inside the frame; no horizontal
page scroll.

**The finding worth keeping:** phase H **PASSED against `frame 392x0`**
(`proof/blanc-player-live-20260801060000`), because a zero-height box satisfies
`right <= viewport.w` and `h <= 45vh` **trivially**. *A bounds check alone cannot tell "bounded"
from "collapsed".* The phase tests **non-degeneracy first** now, and that test is the one that
actually answers slice 15.

### Question 2 — the keymap. No collision, and the overlay's keys work in Blanc.

```text
cue starts in the file   2.0  6.5  11.0  16.0  21.0  24.0     parked at 7.3
R replay -> 6.519406     W prev -> 2.001982     S next -> 6.514921
control x -> no seek at all          toolbox tab unchanged across every press
```

Measured with slice 22's instrument — **capture-phase `seeked` events**, reused rather than
re-invented. Blanc's own three `keydown` bindings are all conditional and none is live on the
Media tab (shortcut-capture only while capturing, lockscreen only when locked, MonoBlocks — which
does swallow `w`/`x`/`z` — only on the blocks tab); the **active tab is recorded across every
press** rather than argued from source.

Two harness corrections that mattered: the first cut **selected a subtitle track** before
pressing keys (retirement-step3 already records that switching a track mid-playback makes
directstream start a new subtitle stream and stops cue delivery after cue 0 — the selector is
now read, never touched), and the first cut **pressed `R` immediately after the open**, when
`allCues` held only cue 0 and there was nothing later to address. The timeline is played past
22 s first.

### A false finding, withdrawn

An intermediate probe reported *"Blanc's nav is not clickable behind the player"*. It was wrong,
and **the tell was in the data**: it read the same `false` in the run where the frame was 392x0
and could not have been covering anything. `document.querySelector('.blanc-nav-btn')` returns
`BlancShell`'s taskbar toggle, which carries that class but sits **outside** `<nav
class="blanc-nav">`, so `closest('.blanc-nav')` was always null. What is asserted now is whether
the measured point hit-tests back to the same button. PASS — `proof/blanc-open-retry-20260801065500`.

### THE DEFECT THIS SLICE FOUND AND DID NOT FIX — the next slice's work

In Blanc's window, with the sidecar ready and the frame mounted, the surface sat at
`data-study-player="idle"` with **no `<video>` element at all**. Reproduced identically on three
independently prepared datadirs before it was understood. **Not** the known directstream
intermittency (`StudyPlayerSlice.tsx` calls the open "intermittent" in a comment): this failed
*every* time, and the sidecar log says why every time.

```text
ws > Client connected      id=c79…      <- socket 1
ws > Client connected      id=c79…      <- socket 2, SAME client id
ws > Client disconnection  id=c79…      <- socket 1 goes away
directstream > Signaling native player that a new stream is starting
ws > Sending "{open-and-await Loading stream...}" to=c79…
directstream > Skipping open step for cancelled preparation clientId=c79…
POST /api/v1/directstream/play/localfile 200      <- 200, having done nothing
```

`React.StrictMode` (`blancMain.tsx`, as in `main.tsx`) double-invokes effects **on mount**.
`seanimeSocketPool.ts` prevents two **concurrent** sockets — that is exactly what it was
extracted for — but it cannot prevent a **release/re-acquire cycle**, and the pinned sidecar
cancels an in-flight directstream preparation for that client id. **Blanc's `playbackRequest` is
non-null at the first mount of `StudyPlayerSession`**, so its launch effect fires inside that
churn. The main window escapes it because there the open arrives as a
`seanime:media-workspace-open` **event at a session that is already mounted and settled**, so
the launch effect re-runs on a prop change — once. StrictMode double-invokes on mount, not on
every dependency change. **That asymmetry is the whole difference, and it is why
retirement-step3 phase C has always passed while this path never has.**

The harness works around it and says so: the retry **must not be a remount** (that reproduces
the double-mount). It lets the socket settle for 10 s and then changes the **request** —
`hashRequestId` derives the id from `(item.id, item.positionSec)`, so writing a resume position
through the app's own `media:setPosition` and re-clicking the card yields a new `requestId` on
the session that is already mounted. Every run since opens on **attempt 2**, and the attempt
count stays in the record.

**The double-invoke itself is development-only, so a packaged build would not reproduce it by
this route — and that is not a reason to call it a non-defect.** The underlying fragility is
real in any build: Blanc issues its directstream open in the same burst as the socket it depends
on, with no settling, and socket churn from any cause lands on it. The product fix belongs in
`src/media/StudyPlayerSlice.tsx` / `src/renderer/components/blanc/BlancStudyPlayer.tsx`, **not
in a harness**. What a user sees today on a first click is a player that says "Opening local
file" and stops.

### Gates

`src/renderer/theme/blanc-media.css` is the only `src/` file this slice changed; the rest are
re-run for confirmation. tests **3,788 / 331** (unchanged from slice 22), `tsc` **288** (the
baseline), i18n exit 0 at **6,348** keys, architecture audit exit 0 "Nothing new", CSS
containment **6,950/6,950 scoped, 0 unscoped**, `node --check` clean on both tools.

### NOT proven live

- **The first open in Blanc still fails and the harness still works around it** — the defect
  above. This is now the top item.
- Blanc's player has been watched in a **dev build only**. The StrictMode first-open loss is
  development-only *by that route*, so a packaged Blanc takes a different path to the same
  request and **has never been driven at all**.
- The other six `video.*` rows the overlay registers (`subEarlier`/`subLater`/the large pair,
  `toggleAutoPause`, `toggleLoop`, `toggleFurigana`) still have not been pressed anywhere —
  slice 22's item, unchanged. Phase I presses the three that **seek**, because a seek is
  measurable by a `seeked` event; the others need a different instrument.
- Music keyboard navigation still does not exist, and must not be built by reusing `video.*`
  ids — `registerCommandHandler` is a last-registrant-wins stack.

## SLICE 22 — SOMEBODY FINALLY PRESSED `R`. And the control found a key that is not ours.

Evidence: `docs/migration/proof/video-shortcuts-live-20260801022019/slice-22.json`.
Run record: `proof/retirement-step3-20260731222019/new-route-plays-and-shell-survives.json`
(phase G). Reproduce:

```
node docs/migration/tools/prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>
node docs/migration/tools/retirement-step3-harness.mjs --datadir=<that dir>
```

Needs the dev server on 5173. **A prepared datadir is single-use for playback** — build a
fresh one per run; the second run of this slice failed to open the file until a new one was
made. The fixture is already at `%TEMP%\cue-probe-dual.mkv` on this machine.

**All seven phases PASS.** The item slices 19, 20 *and* 21 each re-recorded — *"nobody has
pressed `R` in a running window"* — is closed.

```text
G  replay  R -> 6.620808   against the file's true cue1 start 6.5
   prev    W -> 2.059812                         cue0 start 2.0
   next    S -> 6.565682                         cue1 start 6.5
   control X -> no seek at all
```

Measured with phase E's own instrument — **capture-phase `seeked` events**, not polled
`currentTime`. Reused rather than re-invented: the cue controls resume playback, so a polled
reading returns the cue start plus whatever played since, and an earlier session read 2.96
against a real start of 2.15 and concluded the control was broken.

### Why phase E did not already cover this

Phase E clicks `[data-study-action]` buttons. The keyboard path — window `keydown` →
`chordFromEvent` → `effectiveKeys` normalization → `chordMatches` → the handler stack → the
overlay — shares only the final handler with it.

**The keys are sent lowercase on purpose.** A real unshifted press produces `event.key ===
'r'`; the catalog default is written `'R'`. So this passes only while slice 19's
`effectiveKeys` normalization is in place — and if that regressed, phase G would fail while
the button phase kept passing. That asymmetry is exactly what let the original defect live.

### The control found something, and it is not a defect

The first run used **`q`** as the unbound control. R, W and S were already correct there; the
run failed on its own control, because **`q` seeked to 0**.

`q` is absent from this app's catalog, so it looked free. **`KeyQ` is in the adopted player's
own `vc_defaultKeybindings`** (`vendor/seanime-web/…/video-core.atoms.ts`), which the catalog
knows nothing about.

```text
vendor binds   A B D E F H I J K M N P Q Z + brackets + arrows
catalog binds  H R S W ; ' 1
free in both   x  <- the control
```

This is **not** written up as a bug: `q` is not a Study OS binding and nothing here claims
it. The finding is about **harness design** — *"absent from our catalog"* is not *"unbound"*
in a window that also mounts a third-party player with its own keymap. Slice 19 already found
the one case where that mattered for real (`[` and `]` ran a dead subtitle nudge **and** the
adopted player's speed control) and fixed it. Without the control, phase G would have
asserted only that *something* seeks while keys are pressed; an auto-pause tick or a cue
advance would have satisfied all three assertions just as well.

### Gates

The change is confined to `retirement-step3-harness.mjs`; **no `src/` file changed**, so the
src gates are re-run for confirmation rather than because anything could have moved them.
tests **3,788 / 331**, `tsc` **288**, i18n exit 0 at 6,348, architecture audit "Nothing new",
`node --check` clean.

### NOT proven live — the list is now shorter and its top entry is old

- **Blanc's toolbox player has still never been watched playing a file.** The 23:25 attempt in
  `proof/blanc-player-live-20260731232500/` ran with the sidecar **stopped**, so six of its
  eight phases are INFO, not PASS. This is now the oldest untouched item.
- The **other six** `video.*` rows the overlay registers (`subEarlier`/`subLater`/the large
  pair, `toggleAutoPause`, `toggleLoop`, `toggleFurigana`) have still not been pressed. Phase
  G presses the three that **seek**, because a seek is measurable by a `seeked` event; the
  others change a preference or the subtitle delay and need a different instrument.
- Music keyboard navigation still does not exist — see slice 21/20 for why it must not reuse
  `video.*` ids.

## SLICE 21 — THE TRANSPORT HAS NOW BEEN PRESSED. And the tree moved *while* it was written.

Evidence: `docs/migration/proof/music-cue-transport-live-20260801010650/slice-21.json`.
Run record: `docs/migration/proof/music-mining-live-20260801010650/music-mining-live.json`.
Reproduce: `node docs/migration/tools/music-mining-harness.mjs` — needs the Vite dev server on
**5173**, because the built `.vite/build/main.js` loads `http://localhost:5173`. It does *not*
need `npm start`: `npx vite --config vite.renderer.config.ts` is enough, and is lighter.

**21 phases, all PASS.** Slice 20's standing item — *"no one has pressed prev/replay/next in a
running window"* — is closed.

### Read this part even if you skip the rest

Slice 20's `nextActions[0]` said to extend `music-mining-harness.mjs` with a cue-transport
phase. **Another session was writing that exact phase into that exact file at the same time.**
The harness gained ~330 lines (phases K0/K/L/M, and a 4 s → 20 s change to the tone fixture)
between this session reading it at 00:58 and editing it at 01:02 — the edit tool reported the
file had changed underneath, twice — and their own passing run is on disk at
`proof/music-mining-live-20260801010500/`, five minutes before this one.

Slice 20 found the transport itself already implemented and untested in this permanently-dirty
tree. Slice 21 found its harness phase already implemented, **mid-session, by a live writer**.
So the standing warning needs a second half: the tree is not the record of what has been done,
*and it is not stable while you work in it*. **Re-read a file immediately before editing it,
not once at the start.** The first draft of this slice added its own freeze helper, its own
`readTransport`, its own `CUE_STARTS` and its own prev/next/replay phases; all of it was
deleted once theirs was read. A second set of those helpers would have been exactly the defect
slice 20 was written about, in the file that documents it.

Their K0/K/L/M were left **byte-for-byte**. The new phases use *their* helpers.

### What was added, and the one thing deliberately not added

The four questions K–M cannot answer:

```text
N  slot order is the named order      [music-cue-prev, music-cue-replay, music-cue-next]
O  prev clamps at the first line      1.5s/cue1 -> 0.5s/cue0 -> 0.5s/cue0
P  next clamps at the last line       1.5s/cue1 -> 2.5s/cue2 -> 2.5s/cue2
Q  replay disabled with no active line  at 0s: active=-1, disabled=true, click REFUSED
R  no dictionary popup after the sweep
```

**N is the load-bearing one.** `clickNav` addresses the row as `[0]/[1]/[2]`, commented "the
order they are rendered in". That assumption fails *silently*: reorder the row and K/L/M keep
passing while pressing the wrong control, because the reading is just a different cue and the
tolerance is 0.15 s — not a cue apart. The three buttons now carry `music-cue-prev` /
`-replay` / `-next` classes (no styling; `.music-cue-nav button` already styles all three) and
N asserts the rendered order *is* the named order. A unit guard in `musicMining.test.ts` reads
both the pane and the harness `.mjs` and fails if they stop agreeing — the harness is not run
by the suite, so without it a rename would die quietly until someone ran it.

Q's second half is recorded as *observed*, not as desirable: previous-line from before the
first cue seeks **forward**, onto 0.5 s. That is `adjacentStudyCue`'s clamp — the video
overlay's own rule, reused on purpose by slice 20 rather than re-derived.

**Deliberately not added:** a phase for "the seek reached the audio *element*, not just
`state.time`". Their phase M already discriminates it — `driftedIntoCue` resumes playback for
1.1 s and requires the clock back past 2.65 s, which only happens if `audio.currentTime` really
went to 2.5. A second phase would have been a second answer.

### The position is not read from `audio.currentTime`, and cannot be

`playerBus` builds its element with `document.createElement('audio')` and **never appends it**,
so no selector reaches it and no `seeked` listener can be hung on it — the trick
`retirement-step3-harness.mjs` uses for video does not port. Readings come from `.music-seek`
(the range input whose `value` is `ps.time`) and from which `.music-line` carries `.active`.

### Two stale comments, and why the 20 s tone was necessary rather than prudent

The other session lengthened the fixture to 20 s and documented why at `writeToneWav`, but two
"4 s" claims survived elsewhere in the same file and are now fixed: the header, and phase H2's
threshold comment. H2's was wrong in substance too — the ~16.7 KB is set by the **cue's** 1.0 s
length and by the fixture being a tone rather than silence, **not** by the file's length, which
is exactly why lengthening the tone left the number unchanged.

Corroboration that 20 s was needed: this run's pre-transport reading was **7.0 s**; theirs, five
minutes earlier, **4.1 s**. Both are past the end of the old 4 s fixture, and a run-off-the-end
reads exactly like "the transport did not move the playhead".

### Gates

tests **3,788 / 331** (+1, +0 files; baseline 3,787/331 measured this session, matching slice
20 exactly); `tsc` **288** — the baseline, and the single error in a changed file
(`MusicContent.tsx:348` `RefObject<HTMLDivElement | null>`) is **pre-existing** and unmoved,
the same one slice 20 recorded; i18n exit 0 at **6,348** keys, unchanged — this adds class
names, not UI text; architecture audit exit 0 "Nothing new"; ESLint exit 0, **0 warnings** on
both changed src files. Renderer build clean to a scratch `--outDir` in 29.5 s. CSS containment
**6,950/6,950 scoped, 0 unscoped**.

The unit guard was control-run: renaming `music-cue-replay` to `music-cue-again` **fails** it.
Restored from a copy and verified **by sha256**, never `git checkout`.

### NOT proven live (unchanged, and still the obvious next work)

- **Nobody has pressed `R`** in a running window — slice 19's item, untouched here.
- **Blanc's toolbox player has still never been watched playing a file.** The 23:25 attempt in
  `proof/blanc-player-live-20260731232500/` ran with the sidecar stopped, so six of its eight
  phases are INFO, not PASS.
- Music keyboard navigation still does not exist, and must not be built by reusing `video.*`
  ids — see slice 20 below for why that ownership is mount-order-dependent.

## SLICE 20 — THE MUSIC CUE TRANSPORT WAS SITTING IN THE TREE UNGATED. Read this first.

Evidence: `docs/migration/proof/music-cue-transport-20260801003500/`.
Reproduce: `npx vitest run src/shared/__tests__/musicMining.test.ts`.

**The finding is what the tree contained, not what was broken.** Slice 17 left an ordered
backlog and its item 2 was "no cue navigation (prev/next/replay line) in the lyrics pane".
That feature was **already implemented** — buttons, CSS, i18n keys translated in all four
languages — as uncommitted work in this permanently-dirty tree, with **zero tests**, no
`progress.json` entry and no handoff section. Nothing said so. A session reading the backlog
would have built it a second time; a session reading the diff would have shipped it unproven.

So the honest slice was not "add cue navigation". It was **finish landing it**.

### It had its own answer to a question this file already answers

The pane converted lyric cues to `VideoCoreStudyCue` inline, in a `useMemo`, while the Mine
button next to it went through `musicStudyCue` in `shared/musicMining.ts`. Two converters for
one question, and they **disagree**: `musicStudyCue` refuses a blank line and refuses a
`synced` line whose timing is unusable; the inline map accepted both. So the transport could
step onto a line whose Mine button would refuse it.

**Not reachable today, and the write-up says so.** All three parsers in `subtitles.ts`
(`parseLrc`, `parseAss`, `parseSrtVtt`) drop empty-text cues, so no refusable line reaches the
pane through them. This is removing the second answer before a fourth parser or a hand-picked
file makes it live — not a bug report. The conversion, the stepping and the replay target moved
to `shared/musicMining.ts`; they were three inline closures inside a component, which is
exactly why nothing could test them.

### The load-bearing detail: `activeIndex` counts LYRIC lines

`musicCueReplaySec` looks its cue up by `cue.index`, never by array position. Refusing a line
makes the two diverge, and positional indexing then targets the **wrong line silently** — with
a blank line at index 1, `cues[2]` is the line at 22 s while the correct answer is the line at
18 s. A guard asserts both halves: the right answer, and that the naive form would have been
wrong. That is the discriminator, and it is the reason this is worth a function rather than a
closure.

### A justification slice 19 invalidated, still sitting in the source

The comment above the transport read: buttons rather than key bindings because *"the video
overlay already binds W/S/R on `document` without capture, and adding a second uncaptured set
here would fire both."* **Slice 19 deleted that switch.** The overlay registers the catalog's
own `video.replayLine`/`prevLine`/`nextLine` ids now; there is one dispatcher.

Buttons are still right, for a different and better reason, and it is now written down:
`registerCommandHandler` keeps a **stack per id** and `runCommand` takes
`stack[stack.length - 1]` — **the last registrant wins**. A music surface registering those
ids would take them from `VideoCoreStudyOverlay` whenever it mounted later. That is
mount-order-dependent ownership: precisely the invisible second owner slice 19 collapsed.
Music keyboard nav therefore needs its **own** `music.*` catalog rows, rebindable and visible
in Settings → Shortcuts — a decision to take deliberately, not to smuggle in. A guard fails if
`registerCommandHandler` or any `video.*` id appears in the pane.

### Both guard halves were verified load-bearing

```text
control: musicCueReplaySec indexes cues[activeIndex] positionally   -> 3 guards FAIL
control: the pane's inline cue conversion restored                  -> 1 guard FAIL
```

Files were copied aside and restored **by sha256 from PowerShell**, never `git checkout` —
this tree is permanently dirty. Both restores verified `OK` against the recorded hashes.

The source guards strip comments before sweeping. They had to: the block they guard now names
`adjacentStudyCue`, `registerCommandHandler` and all three `video.*` ids **in prose, in order
to explain why they are not used there**. Slices 12 and 19 each lost a round to this exact
trap; the `code()` helper is slice 19's, reused unchanged.

### Gates

tests **3,787 / 331** (+13, +0 files); `tsc` **288** — the baseline exactly, and the single
error in a changed file (`MusicContent.tsx` `RefObject<HTMLDivElement | null>`) is
**pre-existing**, unmoved except in line number; i18n exit 0 at **6,348** keys, unchanged — the
transport's five keys were already written and already translated in ja/zh/ru; architecture
audit exit 0 "Nothing new"; ESLint exit 0, **0 warnings** on all three changed files.

Renderer build to a scratch `--outDir` clean in 30.8 s. CSS containment **6,950/6,950 scoped,
0 unscoped, 0 Tailwind tokens in the shell**.

**The one chunk question this raised, measured rather than assumed:** `musicMining.ts`
previously imported `VideoCoreStudyCue` as a **type only**, which is erased. It now imports
`adjacentStudyCue` as a **value**, so every consumer of `musicMining` gains a runtime edge to
`videoCoreStudy`. Grepping the built chunks: `music-cue-nav` and `music-plain` are both in
`MusicContent-*.js` (27,105 B), and `jp-video-core-resume-v1` is in
`localAgentAutomationStore-*.js` — `videoCoreStudy` was **not** duplicated into the music
chunk. The edge already existed anyway; the pane imported `adjacentStudyCue` directly before
this slice. It cost nothing.

### NOT proven live

**No one has pressed prev/replay/next in a running window.** The transport is proven as pure
functions and the wiring by source guard; `music-mining-harness.mjs` drives the same pane over
CDP and would extend to this in one phase — it already seeds a synced 3-cue sheet and plays it.
That is the obvious next thing, and it joins two standing items of the same kind: **nobody has
pressed `R`** (slice 19), and **Blanc's toolbox player has still never been watched playing a
file** (the 23:25 attempt in `proof/blanc-player-live-20260731232500/` ran with the sidecar
stopped, so six of its eight phases are INFO, not PASS — it did not close that item).

## SLICE 19 — TEN SHORTCUTS POINTED AT A `<video>` THAT NO LONGER EXISTS.

Evidence: `docs/migration/proof/dead-player-dependents-20260731224000/` — the measurement
was taken and recorded **before any fix line was written**, and the two control runs are in
`slice-19.json`.
Reproduce: `npx vitest run src/renderer/__tests__/deletedPlayerDependents.test.ts`.

Slice 16 deleted `MediaPlayerStage` and swept `src/` for references to the **component**.
That sweep was correct and it was the wrong question. What other code depended on was the
`<video ref={videoRef}>` that component *rendered*. `videoRef` is still declared, still
exported and still read in ~23 places — and it has been `null` in every window since.

**Nothing failed.** Three surfaces kept asking it questions and each one reported success.
This is slice 14's lesson pointed at a deletion rather than a flag flip: **a removal's blast
radius is everything that depended on what the removed thing PRODUCED, not everything that
named it.**

```text
videoRef attach sites in src/                       0
video.* handlers useMedia still registered         10   all acting on that null ref
catalog defaults that could never match a keypress 10   of 101 with a default at all
```

### The second finding is not about this migration, and it is the bigger one

`effectiveKeys()` returned `defaultKeys` **raw**. `chordMatches()` compared it to the output
of `chordFromEvent`, which is *always* normalized — single keys upper-cased, modifiers in
Ctrl+Alt+Shift+Meta order — with `===`. So **a default written in any other form matched
nothing**, silently: no error, no warning, and Settings → Shortcuts listing the row as
though it worked.

```text
video.replayLine 'r'  prevLine 'a'  nextLine 'd'          normal form is uppercase
toggleAutoPause  'p'  toggleLoop 'l'  toggleFurigana 'f'
nav.nextDesktop  'Meta+Ctrl+ArrowRight'   nav.prevDesktop 'Meta+Ctrl+ArrowLeft'
```

Both virtual-desktop chords are in that list — spelled the Windows way, normal form puts
Ctrl first. **This was never a media bug**; the media rows are simply where it was noticed.
`Shift+[` and `Shift+]` were dead for a *third* reason: Shift is only recorded for letters,
space and named keys, because for a symbol Shift has already changed the character — so no
keypress can ever produce that string.

`effectiveKeys` normalizes on the way out now, which fixes overrides and custom commands
too, and a guard asserts **every** catalog default equals its own normal form. A default a
future session hand-writes as `'q'` now fails the suite instead of silently doing nothing.

### The two that DID dispatch were the two that collide

`[` and `]` matched — and `BracketLeft`/`BracketRight` are the adopted player's **speed**
control. Blanc's toolbox is the one window that mounts `useMedia('full')` *and* the adopted
player, so there the brackets changed playback speed and then ran a dead subtitle nudge.
That answers the open question slices 15 and 16 both left on the table ("does the overlay's
keymap collide with Blanc's?"): **yes, but the collision came from the legacy catalog, not
from Blanc.**

The ten registrations moved to `VideoCoreStudyOverlay`, which owns every one of those
capabilities against the player that is actually mounted (`replayCue`, `jumpCue`,
`changeSubtitleDelay`, `preferences.autoPause`/`loopLine`/`furigana`). Its hardcoded
`event.code` switch is **gone** — leaving it would have meant `R` firing both the overlay's
handler and the command registered under the same key. One dispatcher, one owner.

Defaults re-pointed onto `R`/`W`/`S`/`;`/`'`, the codes the overlay itself had already
chosen from what `vc_defaultKeybindings` leaves free (read from vendor source, not from the
comment that lists them). A guard cross-checks the two maps and fails on any overlap. Five
rows are deliberately **unbound** rather than given a default that would collide — the same
call slice 11 made for `video.resumeLast`.

**One real trade-off, stated:** the catalog dispatches on `event.key`, the old switch used
`event.code`. On a non-QWERTY layout the physical keys move. That is how every other
shortcut in this app already behaves, and a rebindable row beats an invisible scancode.

### Media Center's Study tab was handing episodes to a player that was deleted

`StudyPanel` passed `isPlayerVisible` as a bare `true` and an `onSeek` that wrote to
`state.videoRef.current`. The `true` suppressed *both* branches that hand an episode to a
player, and the seek was a no-op. Worse, the branch it suppressed parked the position in
`sessionStorage` under `jp-pending-study-media-seek` for the next player to pick up — and a
sweep found **exactly one reader in the whole app**: the same component, in the branch that
only ran when an inline player was mounted. So "study this line" wrote a number nobody would
ever read and opened nothing.

It calls `openMediaWorkspace({ localFilePath, startAtSec })` now — the channel `startAtSec`
was built for and the one Continue-watching already uses. `isPlayerVisible`, `onSeek` and
the whole pending-seek mechanism are deleted. One ordering is load-bearing: **one open per
request, not per render**, guarded by a `requestedAt` key, because `onOpen` sets `current`
and re-runs the effect, and a repeat carries a fresh `requestId` that the host reads as a new
playback request and restarts the episode.

`reachMediaWorkspace()` in `mediaWorkspaceBridge.ts` now owns slice 14's host-then-sidecar
sequence for both its callers. **The host check short-circuits and never asks main** — a
window fact must not be able to become a sidecar fact through an IPC failure — pinned with
`statusCalls === 0`.

### Both guard halves were verified load-bearing

```text
control: effectiveKeys returns raw + replayLine default back to 'r'  -> 2 guards FAIL
control: one overlay registerCommandHandler id renamed               -> 1 guard FAIL
```

Files were copied aside and restored by sha256 from PowerShell, never `git checkout` — this
tree is permanently dirty.

### Two probe corrections, both the same trap

The first guard run failed twice **on its own explanatory comments**: a sweep for
`ref={videoRef}` hit the comment quoting `<video ref={videoRef}>` to explain the deletion,
and a sweep for the sessionStorage key hit the note naming it. Slice 12 lost a round to this
exact thing on a CSS value. The sweep strips comments now. The same trap also broke slice
16's own guard — `blancStudyPlayerRouting.test.ts:254` banned the substring `MediaPlayerStage`
outright, which contradicts the rule its sibling test states three lines further down
("comments that narrate the deletion are allowed"). That assertion strips comments now too;
the real re-introduction guard beneath it is untouched.

### Gates

tests **3,774 / 331** (+15, +1 file); `tsc` **288** — the baseline, **0 in any changed
file**; i18n exit 0 at **6,348** keys (+3 mine, translated in ja/zh/ru — the rest of that
delta is another track in this shared tree); architecture audit exit 0 "Nothing new"; ESLint
exit 0, one warning (the pre-existing non-null assertion in `keyboardShortcuts.ts`).

**Builds DID run this time**, with the dev server up, using slice 15's scratch `--outDir`
trick: renderer build clean, and CSS containment **6,950/6,950 scoped, 0 unscoped, 0
Tailwind tokens in the shell** against that scratch build (the tool takes a dist dir as
`argv[2]`).

**One chunk question measured rather than assumed:** the overlay now imports
`keyboardShortcuts`, which is a new edge from the lazy media chunk into a large renderer
module. Grepping the built chunks for a catalog-only literal (`nav.nextDesktop`) puts it in
`localAgentAutomationStore-*.js` and the three language chunks — **not** in
`StudyPlayerSlice-*.js`, which carries only the ten command-id strings. The edge cost the
lazy chunk nothing.

### NOT proven live

**Nobody has pressed `R` in a running window.** The dispatch is proven end to end in a real
engine — a `KeyboardEvent` through `installKeyboardShortcuts` reaching a registered handler
— but the overlay's half is proven by source guard, not by watching a cue replay. That joins
the standing item below: Blanc's toolbox player has still never been watched playing a file.

## SLICE 18 — A MINED LYRIC NOW CARRIES ITS AUDIO.

Evidence: `docs/migration/proof/music-mining-live-20260731231500/` (12 phases PASS).

`recordCueAudio` lived inside `VideoCoreMiningPanel` typed to `HTMLVideoElement`. Nothing
about it is video-specific — `captureStream`, `play`, `pause`, `currentTime` are all
`HTMLMediaElement` — so it **moved** to `src/media/cueAudioCapture.ts` typed on the base
element rather than being copied. Video calls the shared one now. The cue→range conversion
stayed in the video panel, because the subtitle delay is a video concern.

Three constraints that are easy to get wrong:

- **`playerBus` has a leader/follower model** — only the leader window owns the live
  `<audio>`. `getLeaderAudioElement()` returns `null` elsewhere, and the caller mines
  *without* audio. A capture in a follower would silently produce an empty blob.
- **Synced lyrics only.** A plain line's range is zero-length by design, so recording it
  would ask `MediaRecorder` for zero seconds.
- **A capture failure still mines the card.** Losing the card because the audio failed
  would be worse than the previous behaviour of no audio at all.

### The assertion that looked right and meant nothing

Phase H2 first asserted `bytes > 0` against a **0.4 s silent** fixture and passed with a
275-byte opus container that had recorded nothing — the cue runs 1.5–2.5 s, past the end of
the file, and opus compresses silence to almost nothing. The fixture is now **4 s of a
440 Hz tone** and the threshold is 2 KB. **275 → 16,709 bytes.** If you add a capture
assertion anywhere, make the fixture loud and long enough that an empty result cannot pass.

## SLICE 17 — MUSIC CAN BE MINED. It joins video's study loop, it does not get its own.

**PROVEN LIVE** — `docs/migration/proof/music-mining-live-20260731225500/`, 11 phases PASS in
a real Electron window over CDP. Run it with
`HARNESS_SCRATCH=<temp> node docs/migration/tools/music-mining-harness.mjs` (needs a renderer
dev server on 5173). It seeds a song into `<userData>/media.json` and lyrics into
`jp-lyrics-<id>`, declines the consent dialog, opens Music, plays, and **clicks Mine**. It
asserts the provenance Review reads (`music-lrc`, cue `[1500,2500]`, exact text), that no
dictionary popup fires on the click, and that focus reveals the button. Anki was not running,
so the mine failed and was **recorded as a failure** — which is the designed behaviour; only
Anki's acceptance is still untested live.

Evidence: `docs/migration/proof/music-joins-study-loop-20260731212500/`.
Reproduce: `npx vitest run src/shared/__tests__/musicMining.test.ts`.

**The goal changed.** The user asked for music to be "well integrated", which reverses the
recorded "music was deliberately excluded" decision — but not in the way that phrase
suggests. Routing music to the adopted workspace still makes no sense (there is nothing
music-shaped in it). What was actually missing is that music was the one immersion surface
you could not get a card out of: live lyrics, active-line highlight, LRC loading, word
lookup — and **zero mining**. A line you worked out could not become a card, and music never
appeared in Review.

### It enters the existing loop

`VideoCoreMiningSource` already carries `playbackId`/`playbackType`/`streamType`/
`localFilePath`/`mediaTitle`, and `VideoCoreStudyCue` is just index, track, text and a time
range. None of that is video-specific. So `shared/musicMining.ts` is an **adapter**, and a
mined lyric goes through `createVideoCoreMiningDraft` → `buildVideoCoreMineRequest` →
`ankiMineNote` → `appendVideoCoreMiningHistory` unchanged. **Review needed no changes at
all.** Two histories would have meant two Review panels and two chances to disagree about
what the user has mined.

### The one honest difficulty: plain lyrics have no timing

Provenance exists so a card can be traced back to where it came from, so inventing a
timestamp would be a lie in the one record whose job is to be true. Both kinds are minable
and they are **distinguished**:

| lyrics | `streamType` | time range |
|---|---|---|
| synced (`.lrc`) | `music-lrc` | the cue's own start/end |
| plain | `music-plain` | **zero-length** at the listening position |

`startMs === endMs` is the marker. A line labelled `synced` that arrives without usable
timing returns `null` rather than silently downgrading — that would hide a caller's
mislabelling inside the traceability record.

### Two details worth keeping

- The song is identified by **path**, not `MediaItem.id` — the id is regenerated on library
  re-import, and two lines from one track must group together in Review.
- The Mine button stops mouse-down/up propagation. The lyrics pane turns a mouse-up into a
  dictionary lookup, so without that a click would also open the popup over the card just
  made. Hover-reveal also triggers on `:focus-visible`, or keyboard users could never see it.

### Gates

tests **3,759 / 330** (+12, +1 file); tsc **288** — baseline; i18n exit 0 at 6,339 keys (+6,
translated); audit exit 0 "Nothing new"; ESLint exit 0, 0 warnings; CSS containment 6,950/6,950.

### Not proven live, and what music still lacks

**No song has been mined in a running app.** The test proves the data path — a music cue
through video's own functions, surviving Review's JSON round trip — not that the button
lands where intended or that Anki accepts the note.

Still missing, in the order they are worth doing:
1. **No audio clip on a mined lyric.** Video attaches assets via `withVideoCoreMiningAsset`;
   for a song the audio excerpt is the obviously valuable one. Natural next slice.
2. No cue navigation (prev/next/replay line) in the lyrics pane.
3. Music is absent from the **readiness** view, which enumerates video files. A song has no
   episode/library concept, so that needs a design decision, not wiring.

## SLICE 16 — THE LEGACY PLAYER IS DELETED. Old-player retirement is COMPLETE.

Evidence: `docs/migration/proof/legacy-player-deleted-20260731211000/`.
Reproduce: `npx vitest run src/renderer/__tests__/blancStudyPlayerRouting.test.ts`.

`MediaPlayerStage` — 591 lines — is gone, along with its two render sites and the two
imports the deletion orphaned (ESLint found those, not inspection). `MediaContent.tsx` is
**2,983 → 2,392 lines**. `useMedia` and the library/transcription/YouTube/hub exports stay:
Media Center's Home, Study Mode and Settings tabs are all backed by that hook.

### Measured in the bundle, not in line counts

Two production builds to scratch `--outDir`, before and after:

```text
MediaCenterView-*.js   426,640 -> 427,420   +780   <- it GREW
MediaContent-*.js       82,887 ->  50,707  -32,180
total renderer JS   18,067,797 -> 18,038,489 -29,308
```

The chunk that *renders* the component grew, because `MediaContent.tsx` is emitted as its
own shared chunk; the +780 is the new empty-state JSX and its i18n keys. **A byte count
alone cannot tell deletion from relocation**, so the real check is that
`media-shadowing-error` — a class only `MediaPlayerStage` used — is in a chunk in the before
build and in **no chunk** in the after build.

### The rollback cost, paid deliberately

`SEANIME_SIDECAR=0` now has **no video player**. It keeps the library, folder nav,
transcription, YouTube import, hub and study surfaces. Both fallback sites *say so* —
`mediaCenter.video.needsServerTitle/Detail` and `mediaWorkspace.playerNeedsServer`, three new
keys translated in ja/zh/ru. An empty stage would read as a broken build; the difference
between a documented trade-off and a regression is whether the app states which it is.

### Guards

New block in `blancStudyPlayerRouting.test.ts`: `MediaContent.tsx` no longer defines it, and
a sweep of every `.ts`/`.tsx` under `src/` finds no real reference (import, JSX use, or
definition — prose in comments is allowed). Restoring the pre-deletion file fails exactly
those 2. The panel-wiring test allowed **one** use in slice 15 (the fallback prop) and now
allows **zero**, so it fails on both pre-fix shapes. One assertion was **deleted** rather
than kept: "and NOT the legacy stage" checked for a marker nothing can render any more.

### Gates

tests **3,747 / 329**; tsc **288** — baseline (it read 291 mid-slice because the test still
passed the deleted prop; diffing error sets with and without the deletion showed the
deletion itself contributed **zero**); i18n exit 0 at 6,333 keys (+3, translated); audit exit
0 "Nothing new"; ESLint exit 0, **0 warnings**; CSS containment exit 0, 6,950/6,950.

### A process error worth not repeating

`git checkout -- <file>` was used to get a typecheck baseline **on this permanently dirty
tree**. It was harmless only because that file is untracked, and it was restored from a copy
and verified. Copy files aside for baselines here; never `git checkout`.

### STILL NOT PROVEN LIVE — and now it matters more

Nobody has watched Blanc's toolbox player play a file, or seen the `SEANIME_SIDECAR=0`
message on screen. The `.blanc-study-player` geometry at 560×460 and the `W`/`S`/`R`/`;`/`'`
collision with Blanc's toolbox shortcuts are unverified. **Do this first.**

## SLICE 15 — BLANC IS ROUTED. The plan below it is now DONE, with two premises corrected.

Evidence: `docs/migration/proof/blanc-player-routing-20260731205000/`.
Reproduce: `npx vitest run src/renderer/__tests__/blancStudyPlayerRouting.test.ts
src/renderer/__tests__/mediaSurfaceImportGraph.test.ts
src/shared/__tests__/seanimeSocketOwnership.test.ts`.

Blanc's Player fieldset now renders `BlancStudyPlayer` → `MediaPlayerSurface`, gated on the
shared `useMediaWorkspaceAvailability()`, with the legacy stage kept as the
`SEANIME_SIDECAR=0` fallback and passed in as a **prop** so the new component holds no
import edge into `MediaContent.tsx`. When the legacy player is deleted, that prop goes and
nothing else in the file changes.

### The two premises the plan below got wrong

**1. "`StudyPlayerSlice` reaches only `video-core/*`, so a player-without-library surface is
lighter."** That was a read of four files' DIRECT imports. Walked transitively:

```text
MediaWorkspace       472 modules   5,888,364 source bytes
MediaPlayerSurface   465 modules   5,841,516 source bytes
difference             8 modules      49,130 bytes    1.7% / 0.8%
```

`video-core.tsx` imports three jotai atoms from `torrent-search-container`/`-drawer` for a
`ScopeProvider` (lines 120–124) and reaches playlists and debrid via `video-core-playlist`.
**Cutting all four of those edges removes zero further modules** — every one is reachable by
another path. At import-graph level the adopted tree is one unit.

**2. "Two websocket clients in one window — check the shared-id eviction rule."** It is worse
than eviction, and it is not a rule you can check and then rely on. From the pinned sidecar
(`internal/events/websocket.go`): `AddConn` **appends** rather than replaces; `SendEventTo`
iterates every conn with the id and **does not break**, so targeted events are delivered
twice; `RemoveConn` removes the **first** id match, so whichever socket closes first can
de-register the other one. Fixed by owning the socket at module scope —
`shared/seanimeSocketOwnership.ts` (pure, 9 tests) + `media/seanimeSocketPool.ts`.

### What "light for the machine" actually turned out to mean

A production build finally ran — the Forge dev server was up the whole time, and building to
a scratch `--outDir` side-steps the EBUSY that has blocked this on every previous attempt.
**Use that trick; `dist/` is never touched and the running app never notices.**

```text
MediaPlayerSurface-*.js        756 bytes
MediaWorkspace-*.js         51,483 bytes   (the library screen)
StudyPlayerSlice-*.js    2,688,628 bytes   SHARED by both surfaces
StudyPlayerSlice-*.css     527,166 bytes   SHARED
```

Rollup hoisted the adopted core into one shared chunk. So the win is not a smaller download,
it is a chunk that is **never duplicated**: with the overlay's chunk already loaded, mounting
Blanc's player costs **756 bytes** and no second parse. One chunk, one sheet, one websocket,
one client id per window. The 2.69 MB core is unchanged and cannot shrink without editing
`vendor/`, which ADR-004 forbids — that is a separate decision, not claimed here.

### Two tools this slice had to correct

- `check-media-css-containment.mjs` found the stylesheet by the hardcoded chunk name
  `MediaWorkspace-*.css`. Moving the CSS import into the shared shell renamed that chunk, and
  the gate would have thrown "missing built CSS chunks" instead of checking anything. It now
  finds the sheet by content and **prints** any other chunk carrying scoped rules.
- `retirement-step3-harness.mjs` used `querySelector('#media-workspace')`, which returns the
  first match. Two surfaces can now carry that id — fine for CSS, wrong for `querySelector`.
  All four lookups are scoped to `[data-media-surface=workspace]`.

### Gates

tests **3,745 / 329** (+26, +3 files, all mine); tsc **288** — baseline, 0 in any changed
file; i18n exit 0 at 6,330 keys (**no new keys** — the surface reuses `mediaWorkspace.*`);
architecture audit exit 0 "Nothing new" (it caught a duplicate `acquireSeanimeSocket` export,
now `joinSeanimeSocket` in the pool); ESLint exit 0, **0 warnings**; CSS containment exit 0,
**6,950/6,950 scoped, 0 unscoped, 0 Tailwind tokens in the shell**.

### NOT proven live — do this first

Blanc's toolbox player has **not been watched playing a file**. Unverified against a running
window: the `.blanc-study-player` geometry at 560×460, and whether the overlay's uncaptured
`W`/`S`/`R`/`;`/`'` bindings collide with Blanc's own toolbox shortcuts. Both were named as
open questions in the plan below and neither is closed.

## PLAN — ROUTE BLANC, THEN DELETE THE LEGACY PLAYER — decided 2026-07-31, ~~NOT STARTED~~ DONE 2026-07-31 (slice 15, above; read its two corrections before trusting this section)

**User decision, 2026-07-31:** route Blanc first, *then* delete. And the condition attached
to it — **routing the player into Blanc means stripping it of its UI and making it a pure
capability, as well as making it light for the machine.** Do not treat this as a lift of the
full-screen workspace into a small window.

### Three corrections to the record this decision came out of

Measured against the code, not inherited from the previous handoff:

1. **"`MediaCenterView` can't be deleted because `music` still renders it" is wrong.**
   Music lives in `renderer/components/music/MusicContent.tsx` — `MusicPanel`, `useMusic`,
   `PersistentPlayer`, `MusicSongList` — and touches **nothing** in `MediaContent.tsx`. The
   real constraint is that `useMedia` (~1,420 lines) backs the **Home, Study Mode and
   Settings** tabs Media Center keeps.
2. **"The legacy player is UNREACHABLE in normal use" is an overstatement.**
   `BlancMediaPanels.tsx:106` renders `MediaPlayerStage` whenever a source is loaded, with
   **no sidecar gate at all** — no `seanimeStatus`, no availability check. Retirement swept
   the desktop sections and Media Center's nav; nobody swept Blanc. Open the toolbox, load a
   file, and the old player is there. Same class of miss as slice 14: a shell nobody
   enumerated.
3. **The deletion target is much smaller than "2,982 lines".** `MediaPlayerStage` is
   **~590 lines** (1937–2528) of a 24-export file, reachable from exactly two places — the
   hidden `video` tab and Blanc.

```text
MediaContent.tsx  2,982 lines
  MediaPlayerStage      ~590   THE DELETION TARGET
  useMedia            ~1,420   Home / Study Mode / Settings — stays
  grid, folder nav, YouTube bar, transcription, hub  ~900   — stays
```

### The seam already exists, and it is clean

`MediaWorkspace.tsx` composes exactly two things under one provider stack:

```text
QueryClientProvider → StudyWebsocketProvider
  ├ LibraryView          <- the adopted UI. HEAVY.
  └ StudyPlayerSlice     <- the capability
```

Verified by import: `StudyPlayerSlice`, `VideoCoreStudyOverlay`, `VideoCoreMiningPanel` and
`StudyWebsocketProvider` reach only `video-core/*`, `websocket-provider`, `use-server-status`
and `onlinestream-proxy`. **None of them import anything from the anime-library screens.**
That matches `adoptionBlastRadius.singleDecisiveEdge` in `progress.json` exactly —
`media-entry-card → media-preview-modal` is what transitively drags in mpv-core,
onlinestream, torrent-search, debrid and playlists, and it hangs off `LibraryView` alone.

So "pure capability" is a real extraction with a seam already in place, not a rewrite.

### The shape

1. **`src/media/MediaPlayerSurface.tsx`** — the provider stack plus `StudyPlayerSlice`, with
   **no `LibraryView`**. Takes the same `{ conn, playbackRequest }` the host already passes.
2. **`MediaWorkspace.tsx` becomes `MediaPlayerSurface` + `LibraryView`.** One composition,
   not two — a second copy of the provider stack is two chances to disagree about the
   QueryClient, the websocket and the auth token, and this track has paid for that shape
   before (`mediaWorkspaceAvailability.ts` exists for the same reason).
3. **`BlancMediaPanel` mounts `MediaPlayerSurface`** instead of `MediaPlayerStage`, gated on
   availability like every other routed surface.
4. **Then** delete `MediaPlayerStage` and the hidden `video` tab's use of it.

### "Light for the machine" — what has to be true, and what is still unmeasured

- **The lazy chunk must actually split.** Today `MediaWorkspaceHost`'s `React.lazy` pulls the
  whole adopted bundle because `MediaWorkspace` imports `LibraryView`. A Blanc surface that
  still drags the library subtree in has bought nothing. **Measure the two chunks before and
  after** — asserting the split without a number is exactly the mistake this track keeps
  writing up.
- **CSS containment is a hard gate.** `mediaWorkspace.css` is 6,950 selectors all scoped to
  `#media-workspace` (slice 5's rule). A Blanc-mounted surface must carry that id or the
  scoping breaks, and `docs/migration/tools/check-media-css-containment.mjs` reads the
  **renderer build output** — so it needs a build, which needs the dev server down.
- **Two websocket clients in one window.** Blanc already mounts `MediaWorkspaceHost`
  (`App.tsx:598`). A Blanc player mounting its own `StudyWebsocketProvider` makes that window
  hold two sidecar clients. Check the adopted client-id generation first: the keepalive work
  recorded a **shared-id eviction** rule, and two clients sharing an id evict each other.
- **The Blanc window is 560×460 by default** (`keyboardShortcuts.ts:1201`). The study control
  dock and the cue-loop overlay were designed full-screen, and the dock's advanced section is
  already collapsed-by-default. Geometry needs the standalone harness at real sizes — the
  Browser pane's 0×0-while-hidden trap applies.
- **Blanc has its own keymap.** The overlay binds `W`/`S`/`R`/`;`/`'` on `document` with no
  capture, so a collision fires both handlers. Check against Blanc's toolbox shortcuts before
  mounting, not after.

### What deletion still costs, after all that

One thing, and it stays a real decision: with `SEANIME_SIDECAR=0`,
`MediaWorkspaceSectionView` falls back to `MediaCenterView` and un-hides Video and Library.
Delete `MediaPlayerStage` and that fallback is an empty stage — the documented rollback stops
being a rollback. Routing Blanc does not change this; it only removes the last *unintended*
reach into the legacy player, so the deletion becomes a clean choice instead of a trade made
under a false "unreachable" claim.

## SLICE 14 — "THE MEDIA SERVER IS OFF" WAS A GUESS — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/shell-handoff-20260731183500/resume-reaches-every-shell.json`.
Reproduce: `npx vitest run src/renderer/__tests__/resumeLastShellHandoff.test.ts
src/renderer/__tests__/readerResumeHandoff.test.ts
src/renderer/__tests__/mediaCenterIntegration.test.ts`.

Slice 11 made `video.resumeLast` a **built-in** so it would work from anywhere. It is
therefore offered in every shell that mounts `CommandPalette` — and only some of those
mount `MediaWorkspaceHost`:

```text
reader (NovelReader / MangaReader)     palette YES   host NO
pop-out music / settings / games / …   palette YES   host NO
pop-out player                         palette YES   host NO   <- and it ROUTES there
pop-out video                          palette YES   host YES
desktop                                palette YES   host YES
```

Measured before the fix line was written, with the sidecar at **`ready`**:

```text
{ sidecar: 'ready', hostMounted: false,
  toasts: ['The media server is off, so there is nothing to resume into.'] }
```

The sidecar is running and the app says it is off. **A missing host is a fact about the
window; a disabled sidecar is a fact about the machine.** The app had one test for both —
`mediaWorkspaceHostIsMounted()`, a DOM query for `.seanime-host-launcher` — and it
answered with the wrong one. False by default since the slice-12 flip.

### The host publishes its own presence now

`registerMediaWorkspaceHost()` is called from **inside the effect that adds the window
listeners** and released in that effect's cleanup, so presence *is* the listener's
lifetime rather than a picture of it. That matters beyond tidiness: the host registers
its listeners unconditionally, so it is listening a full commit **before** `status`
arrives and the launcher renders. The DOM marker reads `false` in that window — which is
exactly the state the reader handoff creates.

The marker is **kept** for the palette's search-mode group and Statistics' By-show rows.
Those decide whether to *offer a list*, in the tick they render, and with the sidecar
disabled those rows would open a player the user never sees. Right question there, wrong
one for dispatch.

### Three true statements replace one guess

```text
no host in this window   -> mediaWorkspace.resumeLast.noWorkspaceHere   (new, 4 languages)
sidecar disabled         -> mediaWorkspace.resumeLast.unavailable       (now only when true)
empty resume store       -> mediaWorkspace.resumeLast.nothing
```

The sidecar answer comes from **main**, on the failure path only, through a new non-hook
`mediaWorkspaceIsAvailable()` that `useMediaWorkspaceAvailability` is now written in terms
of. The shell answer **never asks main** — "no host in this window" is knowable without
the sidecar, and asking anyway would let an IPC failure re-word a shell fact as a sidecar
fact. Pinned by asserting `statusCalls === 0`.

### The reader gets it working, not just diagnosed

`renderer/readerResumeHandoff.ts`. While a book is open, `App` registers a handler that
checks availability, closes the book, and lets the **effect body** run the ordinary
built-in against the desktop that just came back. Three orderings are load-bearing:

- **Availability before the close.** Closing the book and *then* reporting a disabled
  sidecar spends something the user cannot get back on an action that was never going to
  work. Its own test.
- **Resume from the effect body, not the handler**, so it lands after the commit.
  `MediaWorkspaceHost` is a child of the component running the hook and a child's effects
  run before its parent's, so the listener exists by then. No sleep, no polling.
- **It does not wait for the launcher** — see above.

It lives outside `App.tsx` so it can be driven against a **real** `MediaWorkspaceHost`
rather than a re-creation of the shell, which would only pin a copy of the ordering.

### A second instance, found by sweeping — the `player` pop-out

Retirement step 2 routed `player` to the workspace. **Three** places encode "which
sections open the workspace": `AppSection`'s switch, the host's `os:open` listener, and
`App`'s pop-out mount — and only the third still read `popout === 'video'`. So a `player`
pop-out rendered the section's "open the workspace" button in a window where nothing
listened. Now one list: `MEDIA_WORKSPACE_SECTIONS` / `sectionOpensMediaWorkspace()`.

**A pop-out is a separate renderer with its own `App` tree**, so "the host is mounted" is
per-window and cannot be inherited from the desktop that spawned it.

Third time in four slices: **a change's blast radius is every place that gates on the
value it changed, not every place that mentions the thing.**

### Two probe corrections

1. A fifth reader test claimed to prove *"the resume goes through while the host has
   rendered nothing"* by holding the status IPC open. **That gate blocks the built-in's
   own availability check as well as the host's first render**, so it could not tell them
   apart and failed against correct code. Deleted rather than kept green — the sibling
   file settles the same property with a registration and no timing at all.
2. Slice 11's dev harness stands in for the workspace with a bare `.seanime-host` div.
   Once the command stopped reading the DOM that fixture stopped being a host, and the
   probe would have measured the command declining rather than the palette reaching it.
   It registers now: **a stand-in has to stand in for what the thing does, not for how it
   looks.** The class name is still what the z-index rules bind to.

**Guards verified load-bearing:** replacing the host's registration with a no-op fails 4
tests across both new files, including the one that exists to catch exactly that.

**Still open, same class, deliberately not included:** `ResultPanels.tsx:235` reaches
`openMediaWorkspace()` and `scraper` is a pop-out section with no host. It is a view
button rather than the resume command, so its remedy is the same shell-aware gate applied
to a different surface.

**Gates:** tests **3,719 / 326** (+13, +2 files, all this slice's); `tsc` **288**, the
baseline, **0 in any changed file**; i18n exit 0 at **6,330** keys (+1, translated in
ja/zh/ru); architecture audit exit 0 "Nothing new"; ESLint exit 0. **Builds not run** —
dev server up (`EBUSY`); no CSS touched.

## SLICE 13 — SLICE 10 PUT THE PALETTE OVER THE CONSENT GATE — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/consent-gate-20260731180200/consent-outranks-the-shell-overlays.json`.
Reproduce: the same harness as slice 10 — it now runs nine assertions instead of seven.

**A regression slice 10 introduced, caught by extending slice 10's own harness.** Raising
`.palette` from 1201 to 20001 and `.os-toast-host` from 5000 to 30000 moved both past
`.consent` at **9000**. So on a cold profile, `Ctrl+Space` put a fully working command
palette on top of a first-launch gate the user had not answered — and slice 11 had just put
`video.resumeLast` in that palette, making the app *reachable* from behind the gate rather
than merely visible.

Measured **before** the fix line was written, so the defect is on record rather than asserted:

```text
consent over the palette  ->  palette          (should be: consent)
consent over a toast      ->  os-toast-host    (should be: consent)
```

`.consent` was already under `.seanime-host` (9999) before any of this. That was *latent*:
nothing self-opens the workspace at boot since retirement step 3 phase B deleted the mount
dispatch. Slice 10 is what made it one keystroke away.

### The fix is a tier, and the rule is one sentence

```text
--z-shell-blocking: 40000    between feedback (30000) and lock (100000)
```

**An overlay is something you reach FOR; a blocking gate is the one thing you may not reach
PAST.** So it outranks every overlay, and only the lock screen outranks it. Pinned by a new
assertion plus `.consent` in the selector→token binding list, so a raw number cannot return.

### The lesson, which is the reason to read this section

**A layering change is not done when the thing you were fixing works.** Raising a layer moves
it past *everything* between its old value and its new one, and the ones that matter are the
layers you were not thinking about. 1201 → 20001 crossed `.consent` (9000),
`.reading-source-backdrop` (12500) and `.widget-gallery` (901) on the way. The scale is what
makes that reviewable at all — before it, `.palette: 1201` and `.consent: 9000` were two
unrelated numbers 3,000 lines apart in one 24,000-line file.

**Still literals, and now the next candidates:** `.reading-source-backdrop` (12500) and
`.lib-import` (300000/300001). Both are view-scoped and neither was crossed by this scale, so
they are cleanup rather than defects.

**Gates:** tests **3,706 / 324** (+1); `tsc` **288**, the baseline, **0 in any changed file**;
i18n exit 0 at **6,329** keys, unchanged and correctly so; architecture audit exit 0 "Nothing
new"; ESLint exit 0. **Builds not run** — dev server up (`EBUSY`).

## SLICE 12 — THE DEFAULT-ON FLIP SHIPPED A DEBUG PANEL — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/dev-panel-gate-20260731175500/debug-panel-off-the-desktop.json`.

**`SeanimeDevPanel` has been rendering on every user's desktop since this morning.** Its own
file header said *"Phase 1 dev-only proof surface. THROWAWAY"* and *"a normal build never
shows it"*. Its gate was:

```ts
if (!status || status.kind === 'disabled') return null;
```

`disabled` is exactly the status the default-on flip removed. That flip's note in
`shared/seanime.ts` says so in as many words — *"the only effect is that the initial status
is `stopped` rather than `disabled`"* — and nobody traced it to the one other file gating on
the same word. So a 460px monospace console with **Start / Stop / Probe** buttons, fixed at
bottom-right, `z-index: 99,999`, became part of the product.

**Nothing failed.** Two correct decisions in two files added up to shipping a debug tool, and
the claim that would have caught it was a sentence in a comment. That is the reusable lesson
here, not the panel: *a flag flip's blast radius is every file that gates on the value it
changed* — grep for the value, not for the flag.

### The fix, and why not `import.meta.env.DEV`

The gate is now `devPanelIsVisible(status, isDevServerRuntime())`, both **exported and
tested**, because "dev-only in a comment" is what failed.

`import.meta.env.DEV` was the obvious choice and is the wrong one **here**: this repo has no
`vite-env.d.ts` and its `module` setting rejects `import.meta` outright, so every use adds
two permanent `tsc` diagnostics — the two existing sites already do — and the root tsconfig
is off limits (CLAUDE.md). An early cut using it took `tsc` from **288 to 312**, all 24 mine.
`isDevServerRuntime()` is also the better signal for the question actually being asked, which
is how the app is *running*: **a packaged build here serves `app://bundle/index.html` from a
registered custom protocol, never http** — established against the real package in
`proof/packaged-sidecar-launch-20260731102252/`. Anything unrecognised counts as production.
A dev tool that fails closed is a dev tool; one that fails open is this defect.

### Three smaller things fixed with it

- **`.seanime-host-launcher` no longer floats in 190px of empty desktop.** That number was
  `/* Clears the Phase-1 dev panel */`. It is now
  `calc(var(--taskbar-h, 48px) + 12px)` — which follows Aero (34/30/40px), Wired (52px) and
  the taskbar-size preference, none of which 190px followed — with the old offset restored
  only under `html[data-seanime-dev-panel]`, set by the panel while it is mounted. Measured
  live: 60px production, 190px with the panel, `--taskbar-h` resolving to 48px.
- **The panel is collapsed by default** (220px header, not 460px × up to 72vh). Fine while
  it appeared only when someone armed the flag; not fine now that every dev run has a sidecar.
- **Collapsed, its status was colour alone** — a dot and nothing else, which is the WCAG 1.4.1
  rule `.seanime-host-dot` already follows three files away. The kind now rides beside it.

**Gates:** tests **3,705 / 324** (+9, +1 file); `tsc` **288**, the baseline, **0 in any
changed file**; i18n exit 0 at **6,329** keys, unchanged and correctly so (ADR-003 scopes the
i18n gate to shipped Media-workspace chrome; this panel is not shipped chrome); architecture
audit exit 0 "Nothing new"; ESLint exit 0. **Builds not run** — dev server up (`EBUSY`).

**One probe correction:** the CSS test asserted the launcher block does *not* contain
`bottom: 190px` and failed — on its own explanatory comment, which quotes the old value in
order to explain it. Strip CSS comments before checking declarations; a substring search over
a rule reads prose as code.

### The sweep was done, and it is clean

The obvious follow-up — *what else gated on the value that flip changed?* — was run rather
than filed. Every `kind === 'disabled'` site in `src/`:

```text
main/seanime/client.ts:55              refuses calls while disabled          correct
media/MediaWorkspaceHost.tsx:101,186   the shipped surface's own gate        correct, intended
renderer/mediaWorkspaceAvailability.ts:40  picks legacy vs workspace         correct
renderer/widgets/continueWatching.tsx:139  widget's sidecar-off empty state  correct
renderer/components/SeanimeDevPanel.tsx    the defect                        FIXED
```

Everything else gating on `disabled` is **shipped chrome that is supposed to appear** once
the sidecar is on. The dev panel was the only surface for which "the sidecar is enabled" and
"show this to the user" were never the same question. App.tsx's other always-mounted
overlays do not gate on sidecar status at all (`PerfOverlay` is behind its own
`jp-perf-overlay` localStorage key), so the blast radius was one file.

## SLICE 11 — `Ctrl+Space` CAN RESUME AN EPISODE — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/resume-last-20260731174600/resume-last-over-the-workspace.json`.
Reproduce: the harness dev server, then
`http://localhost:5174/src/renderer/__devharness__/resume-last-harness.html`,
`await window.runResumeLastProbe()`.

Slice 10 made the palette reachable over the workspace. Opening it there immediately
exposed the next seam: **slice 7's Continue-watching group is `search`-mode only**, and
`Ctrl+Space` — the binding literally labelled *"Open command palette"* — opens `commands`
mode. So the surface slice 10 had just unblocked still could not resume anything; you had
to know to press `Ctrl+P` instead.

The fix is one **built-in** command, not a second copy of the list. A list of forty titles
belongs in search; `commands` mode is for actions, and "resume the newest one" is the
action. `video.resumeLast` therefore appears in **both** palette modes, in the shortcuts
settings as a bindable row, and works with **no view registered** — which is the point,
because its `video.*` neighbours are registered by the legacy video view and read
"needs view" until that view is open. The media workspace is precisely where it is not.

The whole chain, driven in a real engine at 1440x900:

```text
palette mounted over the workspace                       PASS
a click at the palette reaches the palette               PASS   (hit: palette)
the palette input holds focus                            PASS   <- what keeps the player keymap off
"resume" matches the command in COMMANDS mode            PASS   (2 rows)
Enter dispatched exactly one open request                PASS
… for the most recent file, not the first in the store   PASS   sousou no frieren - 07.mkv
… with a resume position                                 PASS   737s of 742s watched
palette z-index 20001 vs workspace 9999
```

**`defaultKeys` is `''` on purpose.** Every free single letter belongs to the adopted
player's own keymap, and this file already records that its handler is on `document` with
no capture, so a collision fires both. An unbound command you bind yourself beats a default
chord that fights the player.

### Both failure paths are named, because they look identical from outside

`resumeMostRecentWatched()` returns an **outcome**, not a boolean:

```text
no-workspace     the sidecar is disabled, so MediaWorkspaceHost renders null and nothing
                 listens for the open event   -> mediaWorkspace.resumeLast.unavailable
nothing-watched  empty, corrupt, or only media:/stream: resume keys
                                              -> mediaWorkspace.resumeLast.nothing
```

A silent no-op is the failure mode this seam has produced three separate times. The toast
that reports it is only visible at all because of slice 10 — at its old 5000 it sat behind
the 9999 overlay. The `no-workspace` guard was **verified load-bearing**: deleting the line
makes that test fail with `expected 'opened' to be 'no-workspace'`.

### Three probe corrections, all of which first read as defects

1. **React had not flushed yet.** State set from a plain `window` listener lands *after*
   the dispatch returns, and `createRoot().render()` is async too, so the first run
   reported "the palette did not mount over the workspace" — indistinguishable from the
   stacking defect the probe exists to catch. Every step settles now.
2. **A case-sensitive path assertion failed against the correct file.** A resume key is
   lower-cased and forward-slashed on the way *into* the store, so what comes back out is
   not what was seeded.
3. **A detached node's `getComputedStyle` returns an empty declaration, not `auto`.**
   `pick()` closes the palette, so a z-index read taken after Enter reported `''` and
   looked like a token that had failed to resolve. Read it before Enter.

**Gates:** tests **3,696 / 323** (+7, +1 file, all this slice's); `tsc` **288** — the
baseline, **0 in any changed file** including the new `.tsx` harness; i18n exit 0 at
**6,329** keys (+3, translated in ja/zh/ru); architecture audit exit 0 "Nothing new";
ESLint exit 0 on every changed file (the one warning is the pre-existing non-null assertion
at `keyboardShortcuts.ts:657`). **Builds not run** — dev server up (`EBUSY`); no CSS touched.

## SLICE 10 — THE SHELL REACHES INTO THE WORKSPACE — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/shell-layers-20260731172900/palette-reaches-the-workspace.json`.
Reproduce: `npx vite --config vite.renderer.config.ts --port 5174`, then open
`http://localhost:5174/src/renderer/__devharness__/shell-layers-harness.html` and read
`window.__shellLayerProbe` (or call `window.runShellLayerProbe()` after sizing the pane).

This file carried the defect as *"deliberately not fixed — what outranks what across the
whole shell is broader than this seam and is not this track's call."* Deferring the
**magic-number bump** was right. Leaving it open was not, because of what the palette
contains: slice 7 put a **Continue-watching group** in it precisely so the player can be
reached from anywhere else in the app. With the workspace open, that group — and every
other command — mounted, took focus and swallowed keystrokes while completely invisible.

The fix is therefore a **scale**, not a number. `theme/tokens.css` gains a shell tier next
to the existing ui/* one, and the rule it encodes is stated once:

```text
view content  <  a full-screen VIEW  <  shell-global overlays  <  OS chrome
```

```text
9998   --z-shell-view-affordance   .seanime-host-launcher
9999   --z-shell-view              .seanime-host          <- a VIEW, not chrome
20000  --z-shell-overlay-backdrop  .palette-backdrop / .cbh-backdrop   (was 1200)
20001  --z-shell-overlay           .palette / .cbh-panel               (was 1201)
30000  --z-shell-feedback          .os-toast-host                      (was 5000)
100000 --z-shell-lock              .lockscreen
200000 --z-shell-chrome            .os-taskbar
250000 --z-window-chrome           .main-window-chrome
```

A full-screen view sorts **below** the shell on purpose. It is a view; it is merely opaque.

### The control round is what makes this a proof

`elementFromPoint` at the palette's centre, one instrument, two rounds:

```text
fix      palette centre -> palette          toast -> os-toast-host
control  palette centre -> seanime-host     toast -> seanime-host     <- the defect, reproduced
```

Phase 2 puts the pre-fix values back on `:root` and re-measures. jsdom has no stacking model
and no hit testing, so `src/renderer/__tests__/shellLayerScale.test.ts` can only pin the
numbers and the CSS bindings — it cannot answer "does a click at the palette reach the
palette". **Both halves of that guard were verified to fail on the pre-fix state** before
being kept: regressing the token fails the mirror assertion, regressing `.palette`'s
`z-index` back to a literal `1201` fails the binding assertion.

### A comment I wrote was wrong, and the harness said so

An early cut claimed the raise "keeps the taskbar rendering and staying clickable over the
backdrop exactly as before". The clickable half is false — **and it was false before this
change too**. `.os-taskbar` declares 200000, but it lives inside `.os-desktop`, which
declares **`contain: layout paint`** and therefore forms a stacking context: that 200000 is
*local*, and the taskbar has always painted below every root-level overlay, including the
palette backdrop at its old 1200. Fix and control hit the same element there, which is the
actual finding — **the shell is unchanged by the raise**. Do not re-derive this from the
declared number; `contain` is invisible in a grep for `z-index`.

### Three probe failures, all of which read as findings

1. **Viewport 0x0.** The first run reported FAIL on every hit test. The Browser pane is 0x0
   until sized and `elementFromPoint` returns `null` for every point in a zero-sized
   viewport, which reads as "every layer failed". The harness now **refuses to report**
   below 320x320 and re-measures on resize. Same trap as `resize_window({preset:'desktop'})`.
2. **The report panel occluded its own measurement.** It is fixed to the bottom of the
   viewport — exactly where the toast host and taskbar are — so it won those hit tests and
   returned `<body>`. Fixed with `pointer-events: none`, which `elementFromPoint` honours.
3. **`.os-toast-host` ships `pointer-events: none` by design**, so hit-testing a toast
   returns what is *beneath* it and reports a perfectly visible toast as covered. The probe
   makes it hittable for the length of that one test and restores it; paint order and hit
   order follow the same stacking order.

### The aesthetic half, measured

Over the workspace the palette floats on **video**, not on the desktop, and 12% of a bright
frame reads straight through its glass. Measured against a white frame: muted palette text
**4.34:1 at the shipped 88% surface — below the AA floor — and 5.58:1 at 96%** (body text
11.22 → 14.43). `#root:has(.seanime-host) .palette, … .cbh-panel` firms the surface up in
that context only; the desktop keeps the lighter glass it was designed with. `.seanime-host`
exists only while the workspace is open — the closed state renders `.seanime-host-launcher`,
a different class, so `:has()` cannot false-positive on it.

### Two couplings checked in source rather than assumed

- **Typing in the palette cannot drive the player.** Its input autofocuses
  (`CommandPalette.tsx:109`); the adopted VideoCore keymap bails on
  `isEditableKeyboardTarget(e.target)` *and* `document.activeElement`; and
  `VideoCoreStudyOverlay`'s `W`/`S`/`R`/`;`/`'` handler bails on
  INPUT/TEXTAREA/SELECT/contentEditable. All three already existed.
- **`ClipboardHistoryPanel`'s Escape did not `preventDefault`**, so the moment it sat above
  the workspace, one Escape closed both. It now does, like the palette already did —
  `MediaWorkspaceHost`'s window listener already bails on `defaultPrevented`.

**Gates:** tests **3,689 / 322** (+7, +1 file, all this change's); `tsc` **288** — the
recorded baseline, **0 in any changed file**; i18n exit 0 at **6,326** keys, unchanged and
correctly so (CSS and comments, no new UI string); architecture audit exit 0 "Nothing new";
ESLint exit 0 on every changed file. **Builds not run** — dev server up (`EBUSY`); the CSS
landed in `renderer/styles.css` and `theme/tokens.css`, not `mediaWorkspace.css`, so the
containment check is unaffected by slice 5's rule.

**What this does not settle:** the scale documents nine layers and only re-points the five
this defect touched. `.reading-source-backdrop` (12500) and `.lib-import` (300000/300001)
are still literals chosen by eye, and `.consent` (9000) sits *below* the workspace — safe
today only because nothing self-opens the workspace at boot since the mount dispatch was
deleted. Those are the next candidates, not omissions from this one.

## ~~THE LEGACY PLAYER IS NOW UNREACHABLE IN NORMAL USE~~ — 2026-07-31

> **Corrected later the same day.** This heading is an overstatement and the section below
> keeps the wording it shipped with. What this work actually established, and what still
> holds: the legacy player is unreachable **from the desktop sections and `MediaCenterView`'s
> own nav.** It is still reachable, ungated, from **Blanc's toolbox**
> (`BlancMediaPanels.tsx:106`) — a third shell this sweep never enumerated. See the
> Blanc plan at the top of this file.

Evidence: `docs/migration/proof/media-routing-20260731131337/player-video-route-to-workspace.json`.
Reproduce: `node docs/migration/tools/media-routing-harness.mjs` (needs the dev server up).

The routing swap moved `player` and `video` to the workspace, but it left a hole nobody had
looked for: **`MediaCenterView`'s own sidebar still listed Video and Library.** `music` is
the one section that still renders that view, so from the Music app the retired player and
library were one click away. Retirement was not actually retiring anything.

They are now hidden whenever the workspace exists, and `navigate()` no longer selects the
legacy panel behind the overlay — `video` used to open the workspace *and* set the tab, so
closing the overlay revealed the retired player. Live, with the sidecar on:

```text
Media Center nav = Home | Music | Study Mode | Discover      <- no Video, no Library
```

**They come back when there is no workspace**, and phase D asserts exactly that:

```text
SEANIME_SIDECAR=0  ->  Home | Library | Video | Music | Study Mode | Discover
```

That is not an inconsistency, it is the point. `MediaWorkspaceSectionView` falls back to
`MediaCenterView` when the sidecar is `disabled`; hiding the tabs there too would leave the
app with **no video or library surface at all** — the exact failure the fallback prevents.
The rule is read in both directions by the same harness so neither half can drift.

### One decision, one place

`renderer/mediaWorkspaceAvailability.ts` now owns "does this machine have the workspace?".
Both `MediaWorkspaceSectionView` and `MediaCenterView` consume it, and a test fails if either
re-derives it from its own `api.seanimeStatus(` call. Two copies of that rule would be two
chances to disagree about which media surface the app is showing. It asks **main**, not the
DOM: `mediaWorkspaceHostIsMounted()` exists for callers that must answer synchronously, but
it races a component's own first mount. An IPC failure resolves to `unavailable`, which
selects the surface needing nothing from the sidecar — the safe direction.

### A hidden coupling this broke, and the harness caught

`MediaCenterView` rendered `nav.slice(0, 6)`. That count silently meant "everything except
Settings", which has its own control below the nav — so the moment two entries were filtered
out, the slice stopped excluding anything and **Settings rendered twice**. It now filters by
id. A hardcoded count standing in for a predicate is exactly what breaks when the list
changes underneath it.

### The harness lied about its own result — fixed, and worth remembering

Phase D once recorded `result: FAIL` while the run **logged "phase D PASS" and exited 0**:
the guard for the new assertion was never added and the log line was unconditional. A phase
whose log can disagree with its own record is worse than not having the phase. Both nav
checks are now plain array predicates rather than regexes over a joined string, and every
assertion has a throw behind it. This is in the record's `probeCorrections`.

**Gates:** tests **3,682 / 321** (+3); `tsc` **288**, 0 in any changed file; i18n exit 0 at
**6,326** keys, unchanged (no new UI string — the change removes nav entries); architecture
audit exit 0 "Nothing new"; ESLint exit 0 on every changed file. **Builds not run** — dev
server up (`EBUSY`).

### What "step 4" now means — read before deleting anything

With this, ~~**retirement is functionally complete**: nothing reaches the legacy player in
normal use~~ — **overstated; see the correction under this section's heading. Blanc still
reaches it.** What remains is routing Blanc, and then deletion, which is a *product
decision*, not cleanup:

- ~~`MediaCenterView` cannot be deleted at all — `music` still renders it, and the workspace
  has no music surface.~~ **WRONG — corrected 2026-07-31.** Music lives in
  `components/music/MusicContent.tsx` and imports nothing from `MediaContent.tsx`. The real
  constraint is that `useMedia` backs the Home, Study Mode and Settings tabs.
- `MediaContent.tsx` cannot be deleted while `MediaCenterView` composes its library, hub,
  YouTube-bar and transcription exports for the tabs it keeps. **But the deletion target is
  `MediaPlayerStage` (~590 lines), not the 2,982-line file.**
- Deleting the legacy video/library surfaces would make **`SEANIME_SIDECAR=0` stop being a
  rollback** — it would become "no media surface" rather than "the previous one".

So the honest options are (a) keep the legacy surface permanently as the disabled-sidecar
fallback and treat retirement as done, or (b) delete it and accept that the flag's rollback
becomes hollow. That is a call about how much safety net a default-on sidecar deserves; it
is recorded here rather than decided.

## STEP 3 IS COMPLETE — ALL FIVE NAMED CHECKS — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/retirement-step3-20260731125703/new-route-plays-and-shell-survives.json`.
Reproduce: `node docs/migration/tools/retirement-step3-harness.mjs --datadir=<prepared>`
(build one with `prepare-gplay-datadir.mjs <cue-probe-dual.mkv> <empty-dir>` — **a prepared
datadir is single-use for playback**, see below; needs the dev server up).

The study-mode track's step 3 named five things: *dragging, taskbar identity, resume,
subtitles, exact cue seeking*. All five are now driven through the **new** routing path.

```text
A  taskbar identity   Video / Media / Music — distinct, unchanged by the swap
B  window dragging    after the workspace opened AND closed: 67,29 -> 132,72
C  real playback      1920x1080, duration 30.386, readyState 4, textTracks 2 (jpn+eng)
E  exact cue seeking  replay -> 6.551 | previous -> 2.041 | next -> 6.556
                      against the file's true starts 6.5 and 2.0
D  quit mid-playback  ZERO orphans
F  resume + restart   quit at 11.871 -> relaunched -> reopened at 14.197
```

### Phase B found a real defect — the section and the host were both opening the workspace

`MediaWorkspaceHost` has listened for `os:open` with `'video'` since Phase 2. The first cut
of `MediaWorkspaceSectionView` **also** dispatched on mount, so `video` opened twice — and
because the section's dispatch waits on an async `seanimeStatus()` round trip, closing the
workspace inside that window let the late dispatch **reopen** it. The drag probe is what
caught it: it kept finding the overlay back on top of the title bar it had just closed.

Fixed by making the host's listener the **single owner**, now covering `'player'` too, and
deleting the mount dispatch. The panel's button still dispatches — that is an explicit
request. It also means a restored desktop layout no longer throws a full-screen overlay up
at boot with no user action.

### Five ways this harness lied before it was correct — do not remove these guards

1. **A cold profile shows the consent screen, and `.consent` covers the viewport.** Phase B
   reported "no draggable point on the title bar", which reads exactly like the drag-layer
   defect it exists to catch. Earlier harnesses in this track got away with ignoring consent
   because `querySelector` and `.click()` **do not hit-test**.
2. **A prepared datadir is single-use for playback.** Re-running against one that has already
   served a session hangs on "Opening local file". Build a fresh one per run.
3. **Opening a local file is intermittent** — a POST, then `open-and-await`, then `watch`
   over the websocket. It stalls at "Opening local file" (no `watch`) or on a MediaSource
   blob at `readyState 0` (no segments), roughly one attempt in two.
   `StudyPlayerSlice.tsx:683` already calls this path "intermittent". The harness retries and
   **records `openAttempts`** — a silent retry would hide a real regression behind the same
   flakiness it absorbs. This is pre-existing directstream behaviour; nothing in the routing
   swap touches it.
4. **Measure the seek TARGET, not the settled position.** The cue controls resume playback,
   so polling `currentTime` after a click reports the cue start plus whatever played since —
   a first cut read 2.96 / 2.95 / 3.00 against real starts of 2.15 / 6.65 and concluded
   "next-cue does not advance". A capture-phase `seeked` log is exact.
5. **Do not touch the subtitle track selector.** The fixture's default track is already
   selected. Cycling it Off → Japanese — following the G-PLAY note about re-selecting a
   track, which is about switching *mid-playback* — stopped cue delivery after cue 0
   outright.

### What phase E does and does not establish

Cue **navigation** is verified exact: every seek landed on a real cue start from the file,
and `previous`/`next` moved in the right direction. Full-timeline **delivery** is not — only
cues 0 and 1 are ever delivered for this fixture however far playback runs. That is not a
control defect: from a playhead of 11.85 s, `next-cue` returning cue 1 and `replay-cue`
sitting disabled is *exactly* what `adjacentStudyCue` does when `allCues` holds two entries.
Two earlier cuts of this phase failed by asserting cues that had never arrived. Delivery is a
directstream property this run cannot settle; G-PLAY mined a card from cue 0 through the
workspace's own entry (`proof/gplay-20260730/`).

**Dragging is driven with CDP `Input.dispatchMouseEvent`, not synthetic DOM events.**
`dragStart` calls `setPointerCapture(e.pointerId)`, which *throws* for a pointer id that was
never activated — so a synthetic drag does not merely fail to move the window, it throws
inside the handler and reads as a broken drag layer. CDP input reaches that page only and
never moves the real cursor; it is not the Windows mouse control this project refuses to use.

**Gates:** tests **3,679 / 321**; `tsc` **288**, 0 in any changed file; i18n exit 0 at
**6,326** keys; architecture audit exit 0 "Nothing new"; ESLint exit 0 on every changed file.
**Builds not run** — dev server up (`EBUSY`).

## `player` AND `video` NOW OPEN THE WORKSPACE — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/media-routing-20260731115831/player-video-route-to-workspace.json`.
Reproduce: `node docs/migration/tools/media-routing-harness.mjs` (needs the dev server up).

Old-player retirement's **step 2 of 3**, and the study-mode track's step 1, which had been
blocked since it was written. `AppSection.tsx` no longer sends two of the three launchers to
`MediaCenterView`:

```text
player (library)   MediaWorkspaceSectionView legacyTab="library"   -> adopted workspace
video              MediaWorkspaceSectionView legacyTab="video"     -> adopted workspace
music              MediaCenterView initialTab="music"              -> UNCHANGED
```

Four phases, all **PASS**, with the developer's app open and untouched:

```text
A  os:open 'video'        handoff panel rendered, workspace OPEN, no .mc-root
B  os:open 'player'       handoff panel rendered, workspace OPEN, no .mc-root
C  os:open 'music'        .mc-root present, NO handoff panel      <- music did not move
D  SEANIME_SIDECAR=0      .mc-root present + fallback notice, NO workspace
```

### Why `music` did not move, and why that is not an omission

**The step as written said "library/video/music", and that premise is false.**
`MediaWorkspace.tsx` contains **nothing music-shaped** — Seanime is an anime media server.
Routing music into it deletes the music player, its lyrics pane and `PersistentPlayer`
rather than migrating them. The user was asked and chose to keep music on the legacy shell.
Phase C exists so a later "finish the migration" change cannot quietly undo that.

The same correction applies to the scope note below: **`MediaContent.tsx` is 22 exports, not
a player.** `MediaPlayerStage` is one of them; `useMedia` is a ~1,400-line hook that the
library grid, folder nav, hub dashboards, YouTube bar and transcription controls all share.
"Delete the legacy player" is therefore not a file deletion, and `MediaCenterView` still
composes those exports for the music/discover/settings tabs.

### Phase D is the objection this step was blocked on — do not remove it

`src/.coordination/study-mode/NEXT_ACTIONS.md` blocked step 1 because *"`MediaWorkspaceHost`
returns `null` unless the flag is on — the swap would leave the app with no media surface."*
Flipping the default answered the common case but **not** the rollback: with
`SEANIME_SIDECAR=0` the host still returns `null`, so routing straight at it would make the
documented rollback *remove* the media surface instead of reverting the change.

`MediaWorkspaceSectionView` therefore decides from the **main process's own status**
(`window.api.seanimeStatus()`), not from the DOM — `mediaWorkspaceHostIsMounted()` races its
own first render, since the host mounts in the same commit — and a `disabled` sidecar renders
`MediaCenterView` with a stated reason. An IPC failure falls back the same way: a blank
window is never the right answer.

**One probe correction, in the record's own `probeCorrections`.** Phases A and B first waited
on `.media-workspace-section, .seanime-host` — *either* marker. On the cold first open the
overlay won that race, so the run recorded `handoffPanel: false` for A and `true` for B, and
had proved only that *something* opened. Both now wait on the panel specifically. Do not
relax that back to an either-marker wait.

**Gates:** tests **3,679 / 321** (+2 net; the routing test became three, one of which pins
the disabled-sidecar fallback); `tsc` **288**, unchanged — the one diagnostic in
`AppSection.tsx` is the pre-existing `Cannot find namespace 'JSX'`, which simply moved from
line 39 to 46; i18n exit 0 at **6,326** keys (+3, translated in ja/zh/ru); architecture audit
exit 0 "Nothing new"; ESLint exit 0 on every changed file. **Builds not run** — dev server up
(`EBUSY`). New CSS went to `renderer/styles.css`, not `mediaWorkspace.css`, so the CSS
containment check is unaffected (slice 5's rule).

**Step 3 — the deletion — has NOT started**, and it is now the only thing left. What it
needs first is a home for `MediaContent.tsx`'s non-player exports, because `MediaCenterView`
still needs them for music/discover/settings. See the scope table below.

## `SEANIME_SIDECAR` IS ON BY DEFAULT — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/sidecar-default-on-20260731114100/default-on-has-a-media-surface.json`.
Reproduce: `node docs/migration/tools/sidecar-default-on-harness.mjs` (needs the dev server up).

**Old-player retirement's first of two steps is done.** The section below closed the last
unproven thing in front of it; this is the flip itself. `src/shared/seanime.ts` no longer
reads `SEANIME_SIDECAR === '1'`:

```text
unset / empty      ENABLED   <- the flip. A normal run now has a media surface.
=1                 ENABLED   <- unchanged, so every existing harness and recipe still means what it did
=0 / false / off   DISABLED  <- the rollback, trimmed and case-insensitive
```

Four phases, all **PASS**, first run, with the developer's app open and untouched:

```text
A  SEANIME_SIDECAR deleted from the child env   status `stopped`, launcher IN the DOM
B  seanimeStart()                               ready in ~4 s, pid 44704, port 54570, v3.10.2
                                                datadir <userData>/seanime  <- the durable branch
C  graceful quit                                ZERO orphans
D  SEANIME_SIDECAR=0                            `disabled`, NO launcher, shell rendered
```

**Phase D is the whole point — do not drop it.** "Status came back `stopped` and the
launcher was there" is satisfied equally well by a hardcoded `stopped` or by an inherited
`SEANIME_SIDECAR=1` in the developer's shell, and both would look like a working flip. So
the variable is **deleted from the child's environment** rather than left unset here (the
same lesson `SEANIME_EXE` taught the packaged harness), and phase D is required to produce
the *opposite* result. It is also the only exercise the documented rollback has ever had —
an untested escape hatch is a claim, not an escape hatch.

Phase D asserts an **absence**, so it waits for `.desktop-root` *and* `.os-taskbar` before
reading the launcher. Measured before the shell renders it would pass on a blank page.

**Three things not to re-derive:**

1. **Turning this on spawns nothing at boot.** Nothing calls `startSeanime()` eagerly — the
   only effect is that the initial status is `stopped` instead of `disabled`, so the surface
   becomes *reachable*. The 84 MB server still starts only when a renderer asks.
2. **`false` and `off` opt out too, not just `0`.** `SEANIME_SIDECAR=false` is the obvious
   thing to type, and silently getting an enabled sidecar from it is the worst failure this
   flag has: a rollback that looks applied and is not.
3. **Only main reads the flag.** The renderer gates on `SeanimeStatus.kind !== 'disabled'`
   (`MediaWorkspaceHost.tsx:177`), which main derives from it. That is why the flip is one
   constant and why `shared/seanime.ts` reads `false` where `process` is absent — that value
   is never acted on, and `false` is the safe direction.

`phases.B.keepaliveLineAtReady` is `null` in the record and **that is not a finding** — the
log is sampled once at `ready`, when the keepalive socket is still in flight. Same trap the
keepalive harness documents twice. It is incidental context there, never a gate.

**Gates:** tests **3,677 / 321** (+10, +1 file, all this change's, against a measured
3,667/320 baseline — higher than the 3,630/318 recorded below because of other tracks'
in-flight work in this shared tree); `tsc` **288**, the recorded baseline, **0 in any changed
file**; i18n exit 0 at **6,323** keys, unchanged and correctly so (main-process only, no UI
string); architecture audit exit 0 "Nothing new"; ESLint exit 0 on every changed file.
`node --check` passes on the harness. **Builds not run** — the dev server was up (`EBUSY`),
and no renderer, CSS or asset file was touched.

The guard tests in `src/shared/__tests__/seanimeSidecarFlag.test.ts` were **verified to fail
on the pre-flip constant** before being kept. A regression here does not raise an error — the
media surface simply is not there, exactly as it was for every run before today.

### What retirement still needs: the legacy player removal, now SCOPED

The second step. It was never scoped, and the warning in the section below — *"`MediaContent`
is a shared type, not just the player"* — turns out to understate it. There are **two
unrelated things sharing the name**, and conflating them would delete the media provider
system:

- **`components/media/MediaContent.tsx`** — the legacy player, **2,982 lines**. This is the
  retirement target.
- **`shared/mediaProviders.ts`'s `MediaContentType`** — an unrelated content-kind union
  (`anime`/`movie`/`special`/…) used across ~12 files in `shared/` and `renderer/`
  (`mediaTracking`, `mediaIdentity`, `unifiedSearch*`, `MediaProviderPanel`). **Not in scope.
  A grep-driven removal would take this out with it.**

Real consumers of the player, measured rather than assumed — only four files import it:

| file | lines | what it needs |
| --- | --- | --- |
| `renderer/views/MediaCenterView.tsx` | 1,567 | the player itself |
| `renderer/components/blanc/BlancMediaPanels.tsx` | 183 | composes it in Blanc chrome |
| `renderer/components/media/legacyStudyMediaSurface.ts` | 39 | **type-only** — `MediaState` |
| `renderer/__tests__/legacyStudyMediaSurface.test.ts` | — | **type-only** — `MediaState` |

The last two are SM-022's decoupling shim and still need the `MediaState` *type* after the
component goes, so that type has to move rather than be deleted with its file.

**The flip unblocks the study-mode track's step 1**, which was blocked on exactly this and
said so (`src/.coordination/study-mode/NEXT_ACTIONS.md`, "Legacy player migration"). Its
steps 3 and 4 sit behind that one. Coordinate before starting — the removal spans both tracks.

## The PACKAGED sidecar comes up — 2026-07-31. Retirement owes nothing now.

Evidence: `docs/migration/proof/packaged-sidecar-launch-20260731102252/packaged-sidecar-reaches-ready.json`.
Reproduce: `node docs/migration/tools/packaged-sidecar-launch-harness.mjs`.

This was **the single never-proven step old-player retirement opens with**, and this file has
carried it as "one manual launch away" since 2026-07-30. It is closed, and it turned out to
need neither a rebuild nor a manual launch nor mouse control:

- **No rebuild.** The 2026-07-30 package is still at `out/jp-study-app-win32-x64/`, and its
  `resources/seanime/seanime.exe` is sha256-identical to the pinned checkout. So the dev
  server being up (`EBUSY` on any `vite build`) does not block this at all.
- **No mouse control.** `--remote-debugging-port` works in a packaged build exactly as in dev,
  and `window.api.seanimeStart()` is the same call `MediaWorkspaceHost` makes. The old record
  assumed driving a packaged run required synthetic input; it does not.
- **No need to close your app.** A scratch `--user-data-dir` keeps `%APPDATA%/jp-study-app`
  untouched *and* side-steps `requestSingleInstanceLock()`, whose lock file lives in userData.

```text
status before start   stopped          <- not `disabled`: the flag reached packaged main
seanimeStart()        ready in 1,600 ms, pid 40788, port 56679, seanime v3.10.2
running from          out\...\resources\seanime\seanime.exe     <- the PACKAGED slot
keepalive             1 established socket, owned by pid 45552 (jp-study-app MAIN)
quit                  app exited, ZERO orphans
```

### The discriminator is the whole point — do not drop it

`resolveSeanimeExe` tries `SEANIME_EXE`, then the packaged slot, then the pinned sibling
checkout. **The sibling checkout exists on this machine and is byte-identical** — the record
carries both hashes and they match — so "the sidecar reached ready" is satisfied *just as well*
by a silent fallback to it. That fallback is precisely what would ship a dead media surface to
every other machine, so it must be excluded, not assumed away:

1. `SEANIME_EXE` is **deleted from the child's environment**, not merely left unset in the
   calling shell — a developer shell may export it, and it wins outright in `exePath.ts`.
2. The running `seanime.exe`'s own `ExecutablePath` is read back from Windows and required to
   be the packaged one.

### Two probe failures here, and a third instance of one lesson

- **A packaged Electron build does not load from `file://`.** This one registers a custom
  protocol and serves `app://bundle/index.html`. The first cut filtered CDP targets on
  `file://`, matched nothing, and sat at the attach for its full timeout with a perfectly
  healthy app on screen. The filter now matches the *shape* that identifies the main desktop
  window — a page target with no query string — which is `debugBridge.ts`'s own rule and is
  scheme-agnostic.
- **Reading the sidecar's log for `Client connected id=study-os-supervisor` reported `false`
  while the keepalive was demonstrably connected.** Third time this session. This run kills the
  sidecar ~30 s in, and a force-killed process leaves a log ending mid-startup. Phase D now
  measures an **established TCP socket** and its owning process, which cannot be truncated;
  the log check is kept as corroboration and is explicitly allowed to be absent. **Do not
  reintroduce a log-tail read as the primary evidence for a short-lived process.**

**Gates:** no `src/` file changed — this added one tool and documentation, so the test, `tsc`,
i18n, architecture-audit and ESLint numbers stand exactly as recorded below (**3,630 / 318**,
`tsc` **288**, i18n **6,303**). `node --check` passes on the harness.

**What retirement still needs is now only ordinary work**, with no unproven step in front of
it: flip `SEANIME_SIDECAR` on by default and remove the legacy `MediaContent` player. Note that
`MediaContent` is a **shared type**, not just the player — it appears across `shared/`,
`renderer/` and the study-mode track's docs — so scope that removal before starting it, and
coordinate with the study-mode track, which has three legacy-player steps waiting on this flag.

## The crash / restart path is PROVEN — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/sidecar-restart-20260731100930/crash-and-restart-recovery.json`.
Reproduce: `node docs/migration/tools/sidecar-restart-electron-harness.mjs`.

The last thing the keepalive work owed. The section below it closed the workspace-close case
and said so explicitly: *"the crash / dev-panel-restart path … `MediaWorkspaceHost.tsx:64`'s
remount logic is believed to cover it but nothing has yet killed a sidecar mid-session and
watched the renderer re-provision."* **Something has now**, by both routes that occur — a real
crash (`taskkill /F` on the child, so the supervisor learns of it through `child.on('exit')`)
and a dev-panel restart (`seanimeStop()` then `seanimeStart()`).

Seven phases, all **PASS**, four sidecar generations in one session, **zero orphans**:

```text
ready(pid 25552, port 54682)   <- generation 1
offline                        <- killed from outside; "sidecar exited with code 1"
starting -> ready(pid 48460)   <- restarted 1,305 ms later, NOBODY CLICKED ANYTHING
                                  new token provisioned, new websocket ACCEPTED by the new
                                  server, provisioning gate cleared, pane back
          … 35,011 ms with the workspace closed, same pid, still listening …
stopped  -> ready(pid 42724)   <- explicit stop with the workspace OPEN, reversed by the host
stopped  -> ready(pid 33480)   <- explicit stop with it CLOSED, then an explicit start
```

**The phase that had never been asked** is the 35 s hold on the *restarted* sidecar.
`startSeanime()` calls `keepalive.start()` on every `ready`, but only the **first** generation
of a session had ever been observed holding a client. Had it armed once per session, the fix
would protect one sidecar and quietly hand every later one back to the dead-man switch — and a
crash is exactly when a user next closes the workspace. It does not: **all four generations log
`Client connected id=study-os-supervisor`.**

**A token in localStorage is not proof.** `atomWithStorage(..., { getOnInit: true })`
snapshotted localStorage at module-eval, which on a restart happened long ago, so "the stored
token changed" only proves `seanimeBootstrap` ran. The decisive check is server-side: `/events`
validates `?token=`, so a websocket the *new* server accepted could only have carried the new
hash. Use that shape for any future claim about re-provisioning.

### One new finding, recorded and NOT fixed

**While the media workspace is open, the dev panel's Stop button cannot stop the sidecar.**
`MediaWorkspaceHost`'s `[open, status]` recovery effect restarts it within seconds (949 ms and
5,720 ms across runs, with no start call from the harness). That is defensible — an open
workspace is precisely when the app wants a media server — but it is undocumented and it made
the first cut of phase E measure something other than what it claimed. Phase E now runs with
the workspace **closed**; phase E0 records the open case on purpose.

### Two ways this harness lied before it was correct — do not remove either guard

1. **It sampled the server log once, right after `ready`.** `keepalive.start()` runs *just
   before* `setStatus({ kind: 'ready' })`, so at the instant the renderer sees `ready` the
   socket is still in flight. A single read reported `keepalive false` for a generation whose
   connect line landed one second later. Now polled by `waitForKeepalive()`.
2. **It read a log file from a process the harness had just killed.** An earlier cut closed the
   workspace ~1 s after a revival and killed that sidecar seconds later; its log ended
   mid-startup with no client lines at all, which read as "a revived generation never gets a
   keepalive" — a defect that does not exist. **Absence of a line in a truncated log is not
   absence of the event**, and `status.logTail` cannot settle it either: `pushLog` keeps 40
   lines and the sidecar's startup stdout pushes the `keepalive:` line out every time.

Both are in the record's own `probeCorrections` field. Same lesson as the 1×1 GIF and the
`translateRun` probe: check whether your instrument can see the thing before believing what it
reports.

**Gates:** tests **3,630 / 318** (+7 tests, +1 file — all this change's, and the totals are
exactly slice 9's 3,623/317 plus them); `tsc` **288**, **0 in any changed file**; i18n exit 0 at
**6,303** keys, unchanged and correctly so (no UI string — the harness is a tool and the tests
add none); architecture audit exit 0 "Nothing new"; ESLint exit 0 on every changed file.
`node --check` passes on the harness. **Builds not run** — the dev server was up (`EBUSY`), and
no renderer, CSS or `src/` app file was touched; the only `src/` addition is a test.

**Still not exercised after this:** nothing in the keepalive/restart line. The remaining Phase 6
gaps are the ones the live pass listed — the stacked two-channel chart with a real two-channel
day, the widget at non-default sizes, and the per-row mining rollup against a live Anki.

## Slice 9 — "one file, one name" — LANDED 2026-07-31

Full detail: `src/PHASE_6_SEANIME_STUDY_MODE_STATE.md` "Slice 9".

The live pass's last loose end. Statistics called the real library file
`Sousou no Frieren — 1`; the palette and the Continue Watching widget called it
`sousou no frieren - 01.mkv`. Both fallbacks were behaving correctly, which is why this
was fixed in the model rather than at a call site — two surfaces of one app naming one
file differently is itself the defect.

It is exactly the `unlinked` case: no Study OS library item and no mining provenance yet,
so `seanimeContinueWatching` fell through to the basename, while Statistics had the better
name all along from `ledgerTitleForPlayback`. The title chain is now library → mining →
**study ledger** → file name (`ledgerShows`, rule 6), fed from the one reader both surfaces
already share.

Three things not to re-derive: the ledger title sits **below** the library and provenance
titles because those are the ones a user can curate; the ledger's `videoCoreResumeKey` is
converted to a path key by **reusing rule 1's** `continueWatchingPathFromKey`, so a
`media:`/`stream:`/`playback:` row is skipped exactly as its resume entry would be; and
`getWatchedShowTitles()` exists rather than `getSummary()` because the palette builds its
list in the tick it opens.

**Gates:** tests **3,623 / 317**; `tsc` **288**, **0 in any changed file** — the delta
against the morning's 287 is five diagnostics in `src/shared/toolboxShortcuts.ts` from
another track's in-flight work in this shared tree; i18n exit 0 and **unchanged**, correctly
so (a media title is study content and is never translated); architecture audit exit 0
"Nothing new"; ESLint exit 0 on every changed file. **Builds not run** — dev server up,
`EBUSY`, and no CSS or renderer asset was touched. **No live look.**

## The keepalive is now PROVEN INSIDE THE RUNNING APP — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/sidecar-keepalive-electron-20260731093934/keepalive-inside-electron.json`.
Reproduce: `node docs/migration/tools/keepalive-electron-harness.mjs`.

The section below this one closed the defect and proved the module against the real
`seanime.exe`. It left one thing owed, and this file said so: *"the fix has not been seen
inside a running Electron app … the supervisor wiring is covered by tests that read
`supervisor.ts` and assert the three call sites."* **That is now closed, by doing the exact
thing the fix exists for** — opening the media workspace, closing it, and waiting past the
dead-man switch's window.

From the server's own connection log, one run:

```text
12:39:39  ws > Monitoring connection as desktop sidecar      <- switch armed
12:39:44  ws > Client connected id=study-os-supervisor       <- the keepalive
12:39:45  ws > Client connected id=a1415298-…  (x2, StrictMode)  <- the renderer
12:39:52  ws > Client disconnected id=a1415298-…             <- the workspace CLOSED
          … 35,010 ms with only the keepalive connected …
          no countdown line, no exit; pid 11924 and port 63842 unchanged
```

Five phases, all **PASS**: `ready` with both clients; the close dropping the renderer and
**only** the renderer; 35 s held with the same pid and port; a reopen — slice 7's real entry
path — landing on that **same pid and port**; and a graceful quit leaving **no orphan**.
Phase D is the one that matters downstream: an unchanged port and token means the renderer's
stale-token failure mode cannot arise, which is what used to produce `Unrecoverable HLS
error` at `readyState 0`.

**Nothing of yours was touched.** The harness launches its own Electron with its own
`--user-data-dir` (which is also what side-steps `requestSingleInstanceLock()`) and its own
`SEANIME_DATADIR`, and attaches over `--remote-debugging-port` rather than the debug bridge,
because `debugBridge.ts` hardcodes 39273 and a developer instance is normally holding it.
That is a reusable pattern for any future live pass that must not disturb a running app.

**Two guards in that harness exist because it lied twice — do not remove them.**

1. **A dispatch before React mounts is silently lost.** A CDP page target exists as soon as
   the document does, long before `MediaWorkspaceHost` registers its open listener in an
   effect. The first run sat at `stopped` for the full timeout. It now waits for
   `.seanime-host-launcher`, the same test `mediaWorkspaceHostIsMounted()` uses.
2. **A fixed sleep before closing made the proof vacuous.** `MediaWorkspace` is a lazy chunk
   that bootstraps its auth token before `WebsocketProvider` connects, and on a *cold*
   profile that outlasts the sidecar's own startup. A run that closed the workspace before
   that client existed dropped **nothing**, left the keepalive as the only connection all
   along, and still passed phase C. It read as green for two runs — and only because a
   reused temp profile carried a client id in its localStorage. The renderer's websocket is
   now a **precondition** read from the server's log, and phase B fails if the close drops
   no client, or if it drops `study-os-supervisor` too (rule 1's shared-id eviction).

**Gates:** no `src/` file changed — this session added one tool and three documents, so the
test, `tsc`, i18n, architecture-audit and ESLint numbers stand exactly as recorded below.
`node --check` passes on the new harness.

**Still not exercised:** the crash / dev-panel-restart path. `MediaWorkspaceHost.tsx:64`'s
remount logic is *believed* to cover it (see the correction further down this file) but
nothing has yet killed a sidecar mid-session and watched the renderer re-provision.

## The sidecar no longer dies when you close the workspace — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/sidecar-keepalive-20260731/keepalive-holds-the-sidecar.json`.
Reproduce with `node docs/migration/tools/sidecar-keepalive-harness.mjs`.

The live pass named this **the highest-value defect in this track**, because slice 7 exists
to enter the player from *outside* the workspace and every such entry after a close hit it.
It is now closed, and closed at the root.

**The mechanism, confirmed against the pinned Go source rather than guessed.**
`--desktop-sidecar` arms `ExitIfNoConnsAsDesktopSidecar` (`internal/events/websocket.go`):
once *any* websocket client has connected, a 5s poll exits the process with code 1 after
10s with **no connections at all**. Upstream's desktop app satisfies that trivially — its
renderer window *is* the client. Study OS's only websocket lived inside `MediaWorkspace`,
**a transient full-screen overlay**, so closing it dropped the last client and killed a
media server the app still owned. Everything downstream — the new ephemeral port, the
renderer's stale port/token, `Video error → switching to HLS → Unrecoverable HLS error`, a
player stuck at `readyState 0`, "a renderer reload is the only recovery" — descends from
that one fact.

**The fix gives the switch the client it was always meant to watch.** `src/main/seanime/
keepalive.ts` holds one websocket from the **supervisor**, whose lifetime *is* the app's.
Started when the sidecar reaches `ready`, released in `stopSeanime()` and on an unexpected
child exit.

**Three phases against the real `seanime.exe`, not a mock** (the harness imports the
shipped module directly — Node 24 strips the types):

| phase | what | result |
| --- | --- | --- |
| A control | one workspace-shaped client connects and leaves | **exited after 14,268 ms, code 1** |
| B fix | keepalive held, workspace client connects and leaves on top of it | **alive at 25,000 ms, keepalive still connected** |
| C release | `keepalive.stop()` with nothing else connected | **exited after 13,749 ms, code 1** |

Phase A is the part that makes B mean anything — it reproduces the defect and captures the
server's own countdown (`No connection detected. Starting countdown...` →
`No connection detected for 10 seconds. Exiting...`). Phase C is why the flag is **kept**
rather than dropped: dropping `--desktop-sidecar` also fixes the bug in one line, but it
silently surrenders orphan protection when the main process is SIGKILLed, and the datadir
is durable now — an orphan would sit on `<userData>/seanime` holding its SQLite database
while the next launch spawned a second server against the same file.

**Four things not to re-derive:**

1. **The keepalive's client id is distinct and claimed explicitly** (`study-os-supervisor`).
   `RemoveConn` deletes the *first* connection with a matching id, so sharing one with the
   renderer would make this socket's disconnect silently evict the renderer's connection —
   it would stay connected and simply stop receiving events. The server accepts an unsigned
   claimed id here only because the request is loopback with no `Origin`
   (`canAcceptClaimedClientId`). Phase B's record shows the server logging **both ids
   separately**, so this is verified on the real server, not just asserted.
2. **It retries forever while the supervisor believes the sidecar is up.** A bounded retry
   hands the process back to the dead-man switch, which is the bug. The backoff caps at 3s,
   deliberately below the 10s window.
3. **`stop()` releases the generation *before* it closes the socket.** Closing fires
   `onClose`, so the other order has the teardown schedule a reconnect to a port that is
   being killed. Mutating the clear/close lines into either order still passes the suite;
   releasing the generation last fails two tests. That is the invariant.
4. **A keepalive that cannot connect is logged, never thrown** — the sidecar still runs, it
   is only exposed to the old behaviour again.

**One stale claim in this file is now corrected.** The "environment traps" section below
says *"the renderer never re-provisions its auth token when the sidecar restarts …
`bootstrapSeanimeConnection` runs only when the media host mounts"*. That has not been true
for some time: `MediaWorkspaceHost.tsx:64` re-runs the bootstrap on every `status.kind` /
`pid` / `port` change, `MediaWorkspace` is keyed `seanime-${pid}-${port}` so it remounts,
and `MediaWorkspace.tsx` explicitly writes the new token into `serverAuthTokenAtom` behind a
`provisioning` gate — because `atomWithStorage` never receives a storage event for a write
made by the same window. Do not re-fix that.

**Gates:** tests **3,521 / 313** (+20, +1 file, all this change's); `tsc` **287** — the
recorded baseline, **0 in any changed file**; i18n exit 0 at **6,157** keys (unchanged, and
correctly so — this is main-process only, no UI string); architecture audit exit 0 "Nothing
new"; ESLint exit 0 on every changed file. **Builds not run** — no renderer or CSS file was
touched.

~~**Not proven:** the fix has not been seen inside a running Electron app. The harness drives
the real binary and the real module but not the real supervisor wiring, which is covered by
tests that read `supervisor.ts` and assert the three call sites.~~ — **CLOSED later the same
day; see the section at the top of this file.** The residual crash/dev-panel-restart path is
still *believed* handled by the remount logic described above and remains **not exercised**.

## The Phase 6 live pass HAPPENED — 2026-07-31. Read this first.

Evidence: `docs/migration/proof/phase6-live-20260731/` (run record + 5 screenshots).

Slices 6, 7 and 8 all landed with the same hole: harness geometry, no live look. That hole
is now closed. Every Phase 6 surface was driven in the real app through the debug bridge,
against the real sidecar on the isolated Phase 3/5 profile and the one real library file.

**The headline: watch time is real.** A measured in-page run gave
**20.002 s of wall clock → 20.000 s claimed → 20.000 s in the ledger** (media advanced
19.996 s). Rule 1 holds to 2 ms. Total for the session was 115.55 s of genuine playback,
and it produced exactly what slice 8 designed: a `2026-07-31` entry with `watchSeconds`
and `seconds: 0`, a `shows` tally keyed by `videoCoreResumeKey`, `0s READ TODAY` beside
`1m WATCHED TODAY`, and **DAY STREAK 1 → 2**. Nothing merged the channels anywhere.

**Three things closed that were assumptions, not facts:**

1. `seanimeContinueWatching.ts:88` claimed the lower-cased forward-slashed fallback path is
   "fine to open on Windows". Never tested. It is now — `c:/users/…` opened against the
   real sidecar with no error, and added 13.73 s to the same show tally.
2. The By-show row **omitted `startAtSec`** rather than fabricating one, because the resume
   store had genuinely cleared at EOF. The documented rule, exercised by accident.
3. The Continue Watching widget's second row was **`The Big O - 01`, from the legacy Media
   Center store** — slice 7's two-store reconciliation working on real user data.

### One high-severity defect found and FIXED — do not re-derive it

**With a player active, the entire workspace header was unclickable.** Close, the
Library/Readiness/Review switch and Open local video all did nothing, and nothing looked
disabled. `.seanime-host-bar` was `position: static / z-index: auto`, while
`.study-player-slice` in the same stacking context is `position: fixed; z-index: 80` and
spans the viewport — so the header could not win at any z-index. The element eating the
clicks is the adopted player's `[data-vc-element="top-playback-info"]`, **a caption strip
with zero buttons of its own**.

That made it a trap rather than an annoyance: `MediaWorkspaceHost.tsx:153` deliberately
refuses Escape while a player is active, and VideoCore's own control bar sits translated
below the fold in this seam. Header covered + Escape refused + native controls hidden =
**no in-app way out of the workspace**.

Fixed in `src/renderer/styles.css`: `.seanime-host-bar { position: relative; z-index: 100 }`.
The host's chrome must outrank the player it contains. Verified live — a real bridge click
at the Close button now closes the workspace.

**Also fixed:** `studyLibrary.health` rendered **"1 files · 1 need work"** on the real
one-file library. One flat key cannot carry three independently-inflecting counts, since the
plural machinery selects on a single `count`. Split into
`studyLibrary.health.total/.queued/.ready`; Russian needs full `one/few/many/other` and the
catalog-hygiene test will fail an `other`-only cut. Live panel now reads
**"1 file · 1 needs work · 0 ready to study"**.

### Still open, and worth knowing before you drive anything

- ~~**The command palette renders behind the media workspace.** `.palette` is z-index 1201,
  `.seanime-host` is 9999 with an opaque background: the palette mounts, takes focus and
  eats keystrokes while completely invisible. **Deliberately not fixed** — what outranks
  what across the whole shell is broader than this seam and is not this track's call.~~ —
  **CLOSED 2026-07-31 by slice 10.** It was the right call to defer it as a magic-number
  bump and the wrong one to leave open: see the slice 10 section at the top of this file.
- ~~**The no-client watchdog fires on every workspace close**, and the renderer keeps the
  stale token. Seen three times this session (ports 51812 → 64510 → 61480); the symptom is
  `Video error → switching to HLS → Unrecoverable HLS error` and a player stuck at
  `readyState 0`.~~ — **CLOSED 2026-07-31 by the supervisor keepalive.** See the section at
  the top of this file. The workspace close no longer drops the last websocket client, so
  the sidecar keeps its port and token for the life of the app.
- ~~**Two surfaces name the same file differently** — Statistics says
  `Sousou no Frieren — 1`, the palette and widget say `sousou no frieren - 01.mkv`.~~ —
  **CLOSED 2026-07-31 by slice 9.** The stats `shows` title now sits between mining
  provenance and the basename in the continue-watching title chain. See the slice 9 section
  at the top of this file.

**Gates:** tests **3,501 / 312**; `tsc` **287** (baseline, 0 in changed files); i18n exit 0
at **6,157** keys; architecture audit exit 0 "nothing new"; ESLint exit 0 on every changed
file. **Builds and CSS containment NOT run** — dev server up all session, `EBUSY`; the CSS
change is in `renderer/styles.css`, not `mediaWorkspace.css`, so containment is unaffected.

**Not done:** the stacked two-channel chart column was never seen live (no day has both
channels, so every column drew one segment); the widget was measured only at its default
320×250; and the per-row mining rollup stayed in its zero state because Anki was down all
session and mining history is empty.

---

## Slice 8 — "Watching counts" — LANDED 2026-07-31.

Full detail: `src/PHASE_6_SEANIME_STUDY_MODE_STATE.md` "Slice 8".

Slices 6 and 7 built the loop and opened its entrance. Slice 8 connects it to the app that
was already here. Every "did you study today?" surface in Study OS reads one store —
`renderer/stats.ts` — and only the two **readers** had ever written to it, so an evening
mining an episode in the adopted player produced a **0-day streak, an empty heat-map cell
and "read today: 0s"**.

- `shared/seanimeWatchTime.ts` — pure accumulator (20 tests) deciding what may be *claimed*
  as watch time.
- `renderer/stats.ts` — a second channel (`watchSeconds`, a `shows` tally,
  `recordWatching`), plus a real defect fixed: `resetStats()` was
  `localStorage.removeItem(KEY)` against a **nonexistent `KEY`**, a `ReferenceError`
  swallowed by its own `catch`, so the Reset button had been a silent no-op.
- `media/StudyPlayerSlice.tsx` — `ResumeTracker` feeds it from the four listeners it
  already had.
- Surfaces: `TodayStudyTime` (two-channel split), `LearningHeatmap`, `StatsCards`,
  a stacked `StatsChart`, and a **By show** list whose rows resume the file.

**Five things not to re-derive:**

1. **Watch seconds are never folded into `DayEntry.seconds`.** Five existing surfaces label
   that number "read"; merging would make all five lie at once. What the channels *do*
   share is the definition of an **active day** — `streak` and `daysActive` now count
   either activity, which is a real behaviour change to numbers other tracks read.
2. **Wall-clock while playing, capped at 10 s per interval, and a seek backwards still
   counts.** Media time would credit a 2× rewatch with an hour nobody spent; clamping to
   forward progress would zero out *replay line*, the commonest action in this player.
3. **Auto-pause, shadowing and dictionary time are deliberately NOT counted** — a pause
   inside an interval makes the playing fraction unknowable. This under-states a session,
   which is the direction to err in.
4. **`MediaWorkspaceHost` is mounted at the *App* level** (`App.tsx:593`), not inside the
   media view. That is what lets a surface as far away as Statistics offer a real resume
   control, gated by `mediaWorkspaceHostIsMounted()` exactly like slice 7's palette group.
5. **A show's id is `videoCoreResumeKey`** — the join key every Phase 6 surface already
   shares, so the tally lines up with the continue-watching row, the readiness row and the
   mined cards rather than being a fourth identity for the same file.

**The harness found three real defects**, all of which rendered as something plausible:
the split bar **collapsed to 0px** (`.wgt` is a flex column and the 6px bar was the item
that gave way — `flex-shrink: 0`); the full split layout **does not fit the registry
minimum** (measured 108px of content in a 78px box, fixed with a derived compact layout
rather than by inflating `minSize`); and the stacked chart's **peak column overflowed its
track by 2px**, because two percentages summing to 100% plus a `gap: 2px` is 102% and
`overflow: hidden` ate the difference — so the tallest bar was the one telling the smallest
truth. The separator is now a transparent `border-bottom` with `background-clip:
padding-box`, paid for out of the upper segment's own height.

**Measured, not assumed:** the two fills contrast **1.03:1 against each other** — hue-only
separation. That is why every surface stacking them carries a separator and a named legend,
and why the pair is red/blue. Each is ≥6.4:1 against its own track; all new text ≥5.35:1.

**Gates (2026-07-31):** tests **3,501 / 312 files**; `tsc` **287** — one *below* the 288
baseline, thanks to the `resetStats` fix, 0 in any changed file; i18n exit 0 at **6,155**
keys; architecture audit exit 0 "nothing new"; ESLint exit 0 on every changed file.
**Builds and the CSS containment check were NOT run** (Forge dev server up all session,
`EBUSY`); this slice's CSS is in `renderer/styles.css`, not `mediaWorkspace.css`, so it
cannot affect containment.

**Not done: no live look and no screenshot.** The Browser pane cannot composite while
hidden, so the evidence is geometry, computed styles and measured contrast. Nobody has yet
watched a real episode and seen the streak move — that is the obvious opening for the live
pass.

---

## Slice 7 — "Continue watching" — LANDED 2026-07-31.

Full detail: `src/PHASE_6_SEANIME_STUDY_MODE_STATE.md` "Slice 7".

Slice 6 closed the loop's return leg but left it **sealed** — every way in went through the
media workspace's full-screen launcher. Slice 7 opens it, from two surfaces outside the
workspace, using a store nothing had ever read back: `jp-video-core-resume-v1`, which
`StudyPlayerSlice` has been writing for every file ever watched.

- `shared/seanimeContinueWatching.ts` (pure, 20 tests) joins the VideoCore resume store, the
  Study OS media library and mining history into one "what have I started and not finished"
  list. **It is the first thing in this track to reconcile the two resume stores** — the
  legacy Media Center's `MediaItem.positionSec`/`lastPlayedAt` and VideoCore's own. Newest
  write wins; an undated library position timestamps as `0` so a real VideoCore write always
  outranks it.
- `renderer/widgets/continueWatching.tsx` — a Study-category **desktop widget**. Row → the
  player at your position; card pill → the Review panel scoped to that file.
- `renderer/components/CommandPalette.tsx` — a **Continue watching** group in search mode.
- `renderer/continueWatchingStore.ts` — one reader for both surfaces, on purpose.
- `media/MediaWorkspaceHost.tsx` — `STUDY_REVIEW_FOCUS_EVENT` now **opens** the host too.

**Four things not to re-derive:**

1. **Only `file:` resume keys become rows.** The store also holds `media:`, `stream:` and
   `playback:` keys, and the only way to reopen a local file is
   `MediaWorkspaceOpenRequest.localFilePath`. A row from any other key would be a control
   that cannot work, so they are **excluded**, not rendered disabled.
2. **No progress bar without a measured duration.** The resume store has `positionSec` and
   nothing else; `MediaItem.durationSec` exists only where Study OS probed the file. Rows
   without one state the timestamp, which is a fact.
3. **Card counts are provenance, never Anki.** Same rule as slice 6 — a widget on a 30 s
   timer cannot afford an interval snapshot, and with Anki unreachable every Anki-derived
   number becomes a confident zero. Maturity stays in the Review panel.
4. **The palette asks the DOM whether anything is listening.** It builds its list in the tick
   it opens, so it cannot `await seanimeStatus()`. `mediaWorkspaceHostIsMounted()` looks for
   `.seanime-host-launcher, .seanime-host` — presence of the listener established by presence
   of the thing that owns it. With the flag off the group is simply absent.

**The harness found a real defect.** Row height was *estimated* at 46px; measured in
`WidgetFrame`'s real chrome a row with a progress bar is **55px**, and `.wgt-cw-list` clips
rather than scrolls — the first cut cut **51px off the default frame and 32px off the
minimum**, where the one visible row was more than half gone. The registry's two sizes are
now derived from the measured row, the 6px gap, the truncation line, `.widget-body`'s 20px
padding and `WidgetFrame`'s 30px bar, rather than chosen by eye. **`WidgetFrame` passes
`widget.h - 30` but does not subtract the body's own padding** — worth knowing for any future
widget that computes its own row count.

**And one false positive, recorded so it is not "fixed":** an ellipsized `.wgt-cw-title`
reports `scrollWidth > clientWidth`. That is `text-overflow: ellipsis` working, not overflow.

**Gates (2026-07-31):** tests **3,460 / 308 files**; tsc **288** (baseline, 0 in any changed
file); i18n exit 0 at **6,141** keys; architecture audit exit 0 "nothing new"; targeted ESLint
exit 0 on every changed file. **Builds and the CSS containment check were NOT run** — the
Forge dev server was up all session and `vite build` into a locked `dist/` dies with `EBUSY`.
This slice added no rules to `mediaWorkspace.css`; its CSS is in `renderer/styles.css`, the
shell sheet, which is where the slice-5 note already established Phase 6 panel CSS belongs.
Note the test/key totals include concurrent work from other tracks in this shared tree, so
they are larger than this slice's own +40 tests and +11 keys.

**Not done: no live look.** Putting the widget on the real desktop mutates the user's
persisted layout while they are using the app, and no build could be run. See the state doc.

---

Updated 2026-07-30 (fifth session of the day). **Phase 4 is COMPLETE.**
**G-PLAY is CLOSED.** **Both Phase 5 gate slices are PROVEN.**
**Both retirement blockers are CLOSED.**
**A UI/UX pass over every Seanime-delivered surface landed** — read the next
section before driving the player, because one default changed.
**Phase 6 is OPEN with slices 1–5 landed** — both blocking user decisions are
SETTLED; nothing in Phase 6 waits on an answer. See "Phase 6".

## READ FIRST if you are about to drive the player — 2026-07-30 UI pass

Evidence: `docs/migration/proof/ui-pass-20260730/ui-ux-pass.json`.

**The study control dock's advanced section is now COLLAPSED by default.** The
subtitle/audio track selectors, the A–B loop controls and every Whisper control
live behind it. A bridge-driven run must first click
`[data-study-action="toggle-study-controls"]`. Nothing referenced these selectors
programmatically (grepped across `src/`, `docs/`, `tools/`), so no gate broke —
but past live runs reached them directly and will now find them absent.

Two more shape changes worth knowing before you drive anything:

- The mining panel collapses too, via `[data-study-action="toggle-mining-panel"]`.
  It stays expanded by default, so mining runs are unaffected.
- **The overlay now binds five study-loop keys: `W` previous line, `S` next line,
  `R` replay line, `;` / `'` subtitle offset ∓0.1 s.** The *adopted* player
  already owns a full keymap — `vc_defaultKeybindings` in
  `vendor/seanime-web/.../video-core.atoms.ts` claims `A`/`D` (seek ±30 s), the
  arrows, the brackets, and ten more letters, and `video-core-preferences.tsx`
  hardcodes Space, Enter, Home, End, Escape and `,`/`.` (24 fps frame step). Its
  handler is on `document` with no capture, **so a collision fires both**. Check
  that file before moving any of these five.

The pass also fixed two raw machine enums that were reaching the JA/ZH/RU UI as
English (`sidecar ready`, `exported`), three `aria-live` regions that were
created together with their content and therefore never announced, a 3.73:1
contrast failure in the mining provenance list, and gave the full-screen
workspace host `role="dialog"` plus Escape (guarded so it never fires while a
player is active). New baselines: **3,229 / 297** and **6,020** i18n keys.

**One correction recorded there, so it is not "fixed" again:** an early read of
this pass claimed the media workspace had no focus rings. It does —
`src/renderer/styles.css:1012` applies them app-wide via `data-display-focus`,
which `displayPrefs.ts` defaults to `normal`. Nothing in the Study OS controls
overrides it.

**And a tooling unlock:** a `// @vitest-environment jsdom` docblock makes real
renderer component tests run with **no root-config change**. See
`src/renderer/__tests__/videoCoreMiningPanelStructure.test.ts`, which does a real
`createRoot` render of the mining panel. This supersedes the assumption that
component tests were off the table here — the `.test.tsx` files still never run,
so keep writing `.test.ts` with `createElement`, under `src/renderer/__tests__`.
(`src/media/__tests__/` is empty *and* outside every include glob — do not use it.)

Three user decisions from 2026-07-30 govern what happens next — treat them as
settled, not as open questions:

1. **The shadowing microphone proof is SKIPPED by user decision** and recorded as
   a permanent known gap. Phase 3 closes with that one item explicitly unproven
   rather than waiting on it. Nothing technical blocks a later attempt: Windows
   microphone consent is `Allow` for desktop apps, `Microphone (W1)` is present
   and OK, and no Electron permission handler is registered (so Electron's default
   grant applies). The app was armed once — player parked on the cue with
   Shadowing enabled — and the two controls are `Replay original` and
   `Record response` in the Shadowing practice panel.
2. **Phase 5's gate is "manga + novel/EPUB".** PDF is explicitly *not* in the
   gate. Both slices are now proven, so the gate is met.
3. **qBittorrent and debrid stay `untested`** and are revisited in a final
   testing pass once all phases are done.

**Phase 3's proof gates are all settled. What remains before the old player can
retire is implementation, not proof — see the next section, and do not start the
retirement without reading it.**

## What old-player retirement really needs — measured 2026-07-30

`SEANIME_MIGRATION_PLAN.md:606` gates retirement on G-PLAY plus a no-regression
visual comparison. **Both now pass.** That made retirement look like the next
action; it is not, and the reason is two concrete gaps that nothing in the plan's
gate language covers. Both were verified by reading the code, not inferred:

1. **A packaged build has no sidecar binary at all.** `forge.config.ts` ships
   `extraResource: ['public']` and nothing else — no `seanime.exe`. The plan puts
   "Windows packaging with the sidecar" in **Phase 9**, so retirement as written
   depends on a later phase.
2. **The sidecar datadir is deliberately disposable.** `supervisor.ts` comments it
   explicitly: the datadir is "deliberately NOT under `app.getPath('userData')` in
   either branch". Without `SEANIME_DATADIR` every start does
   `fs.mkdtempSync(...'seanime-phase1-')`, which "starts with no settings and no
   library, so the grid would be empty", and it is removed on stop. A normal run
   with the flag on would therefore re-scan into a throwaway directory every
   launch.

So flipping `SEANIME_SIDECAR` on by default today would give every machine except
this one a `failed` sidecar and a dead media surface, and would give this one an
empty library each start. **Retirement needs a bundled binary and a durable
datadir first.** Neither is a proof; both are ordinary work.

**Gap 2 is now CLOSED — 2026-07-30, later session.** Evidence:
`docs/migration/proof/datadir-durable-20260730/durable-datadir-and-adoption.json`.
`src/main/seanime/dataDir.ts` resolves `SEANIME_DATADIR` first (a harness profile must
never be silently redirected at the real one), else `<userData>/seanime` — a
*subdirectory*, never the userData root, so no Study OS file is shared or overwritten.
`stop()` no longer deletes anything; the `mkdtemp` is gone. A leftover
`seanime-phase1-*` temp datadir is adopted **once**, newest by database mtime, only
while the durable profile has no `seanime.db`, skipping `logs/`+`cache/`, as a copy, and
a failed adoption is reported rather than thrown — starting empty beats not starting.

Proven live end to end with `SEANIME_SIDECAR=1` and both other variables unset: run 1
came up `ready` on `<userData>/seanime` having adopted `seanime-phase1-1B4yqk`
(`seanime.db` 188,416 bytes with its **mtime preserved**, so copied not created); a real
quit through `will-quit` left the datadir intact (this is exactly where Phase 1's
`fs.rmSync` fired); run 2 came up `ready` on the same directory — a marker file written
between the launches survived, both runs' sidecar logs sit side by side in it, and **no
new temp datadir was minted**. 29 userData files re-hashed from PowerShell: only `DIPS`
differs. `src/main/__tests__/seanimeDataDir.test.ts` covers the order, the blank
override, adoption selection, the never-overwrite guard, the non-fatal failure, and
**fails if `mkdtemp` or `rmSync` returns to `supervisor.ts`**.

**Gap 1 — the packaged binary — is also CLOSED, 2026-07-30, by explicit user decision.**
Evidence: `docs/migration/proof/datadir-durable-20260730/packaged-sidecar.json`. The user
was asked (the alternative was leaving it to Phase 9) and chose to edit `forge.config.ts`,
overriding `CLAUDE.md`'s root-config rule for that one file. `SeanimeSidecarStagingPlugin`
copies the resolved binary — `SEANIME_EXE`, else the pinned sibling checkout — into
`build/seanime/` in `prePackage`, and `extraResource` ships that directory, which
electron-packager places at `<resources>/seanime` by basename. A **real `npm run package`
exited 0** and `out/jp-study-app-win32-x64/resources/seanime/seanime.exe` is
**84,408,320 bytes, sha256-identical to the pinned checkout** — the previous package had
only `app` and `public` there. A missing binary now **fails the build** rather than
shipping a dead media surface; `SEANIME_SKIP_SIDECAR_PACKAGING=1` opts out loudly, and a
non-win32 target gets an empty slot instead of a `.exe`.

Three things to carry forward:

- **Not proven:** the packaged app was never launched to watch the sidecar come up. The
  debug bridge is dev-server-only, so driving a packaged run would need mouse control,
  which is a standing instruction never to do with this app. The binary is at the exact
  path `exePath.ts` computes and the packaged branch is unit-tested; the live packaged
  start is one manual launch away.
- **Licensing is now live, not hypothetical.** The sidecar is GPL-3.0.
  `LICENSING_PLAN.md` treats an *unmodified* pinned binary as the conventional
  separate-program posture and obligations attach on distribution (`private: true`
  today). But staging honours `SEANIME_EXE`, which is exactly how the **patched**
  sidecar would get into a package — and that is a *modified* Go server, so shipping one
  obliges publishing the fork's source.
- `out/jp-study-app-win32-x64.pre-sidecar` is the previous 3.7 GB package, kept as a
  rollback. Delete it whenever.

**The exe half was done earlier.** The exe path was
`process.env.SEANIME_EXE ?? <an absolute path inside one developer's home
directory>` — shipped main-process code that could only ever work on this machine.
It is now `src/main/seanime/exePath.ts`: `SEANIME_EXE` still wins outright (a proof
harness pointed at a purpose-built binary must never silently fall back), then a
packaged slot at `<resourcesPath>/seanime/seanime.exe` — **named in code so
packaging has a target** — then the pinned sibling checkout derived from
`app.getAppPath()`. Verified live: with `SEANIME_EXE` unset, the sidecar came up
`ready` on port 58554 from
`C:\Users\Arseniy\Projects\seanime-upstream\seanime.exe`, resolved rather than
hardcoded. `src/main/__tests__/seanimeExePath.test.ts` covers the order, the
blank-override case, the actionable failure message, and **fails if an absolute
home path reappears in either file**.

Nothing is owed for retirement any more. **Both blockers are closed** — the durable
datadir and the packaged binary, each with a recorded run (see the two sections above).
`SEANIME_SIDECAR` can now be turned on by default as far as *these* two facts go; that
flip is still its own change, and the one thing it has never had is a live packaged
sidecar start.

## Phase 5 gate slice (b) — novel/EPUB — CLOSED 2026-07-30

Evidence: `docs/migration/proof/phase5-novel-20260730/`.

Run on a **real book from the user's own library** (`02 クビシメロマンチスト`,
stored at `p:12:0.6207`), with the **sidecar deliberately not running** — this
slice is entirely Study OS code. `Start → Library → the book card → the retained
NovelReader → click 無防備 → dictionary popup → + Add to Anki` produced note
`1785399659697` with `Term 無防備 / Reading むぼうび / Sentence` = the exact EPUB
sentence the word was clicked in. A second Add was refused (`Already in Anki`).
Closing the reader after two page turns persisted `p:14:0.0000` through
`progressFromReadingLocator` — the exact four-decimal shape. `library.json` was
restored from its pre-run backup and hash-verified from PowerShell.

### It found a real defect: opening a book destroyed its position

`NovelReader`'s load effect restores `p:<part>:<frac>` asynchronously and its
cleanup wrote the position back **unconditionally**. Torn down before that load
resolved, it persisted the *initial* refs — `part 0, fraction 0`. `percent`
survived (it is seeded from `item.progress.percent`), so the reader reopened at
the right *percentage* through its coarse fallback while the precise locator was
gone — which is exactly why this was never noticed. Observed live: `p:12:0.6207`
became `p:0:0.0000` the moment the book was opened.

**React.StrictMode tears the first mount down on every mount in development, so
this fired on every open of every book.** Production needs a real early close.
Fixed with a `positionRestoredRef` guard and pinned by
`src/renderer/__tests__/novelReaderProgressGuard.test.ts`, which was verified to
fail on the unguarded code.

Two things recorded alongside it, so they are not re-derived:

- **A zeroed within-part fraction is not corruption.** The paged layout snaps it:
  `applyLocal` rewrites `localFracRef` as `page / (pages - 1)`, which is exactly
  `0` when a part occupies a single page at the current font and viewport. That is
  why a reopened position can shift slightly (`percent 0.0311 → 0.0282` here).
- **Two renderer component tests have never run.** `vitest.config.ts` includes
  only `src/renderer/__tests__/**/*.test.ts`, but that directory holds
  `externalPlayerPanel.test.tsx` and `mediaTrackingSourcesHistory.test.tsx`.
  `vitest run` on either path reports "No test files found". The include glob is
  root config, so it needs its owner; until then write renderer component tests as
  `.test.ts` with `createElement`.

## G-PLAY is CLOSED — 2026-07-30 (later session)

Evidence: `docs/migration/proof/gplay-20260730/gplay-asset-reference-and-restart.json`
plus `mounted-preview-cue-and-card.png`.

The oldest open item in this track is done. One uninterrupted run, driven through
the app's own debug bridge (no Windows mouse/keyboard control), against the live
83-deck Anki collection with a namespaced self-cleaning probe deck:

- Mounted preview on the real cue `track 3, index 0, 2,148–5,148 ms`
  (`猫が窓辺で寝ている。`), English secondary rendered simultaneously.
- Screenshot **162,806 bytes** and cue audio **48,843 bytes** attached.
- `addNote` returned **1785396692600** on `JP Study App::JA Immersion`
  (fields `[Term, Reading, Sentence]`, no picture or audio role), and
  **the note references both assets** —
  `Sentence = 猫が窓辺で寝ている。<br><img src="jsa-vn-69a3655b7f3d.png"><br>[sound:jp-video-cue-3-0-2148.webm]`.
  Both files were retrievable from Anki's media folder at their exact byte
  counts. **This is the gap the 2026-07-28 run failed on; it is closed.**
- The deck override is no longer silent: the panel reported
  `Mined to StudyOS::_Phase3GplayProbe.`
- A second Mine was refused (`Duplicate warning: Anki already contains this
  note.`), one note still in the deck.
- **Actual restart**: the window was closed (the supervised sidecar exited with
  it), the app relaunched, and both `jp-video-core-mining-history-v1` (full
  cue/source/asset provenance and the note id) and `jp-video-core-resume-v1`
  survived. Reopening the file produced `play t=6 → seeking t=6 → seeked t=6`,
  i.e. the persisted position applied, captured from a capture-phase media-event
  log rather than by polling. Near-EOF clearing was also observed (the store went
  to `[]` after playback reached 30.386).
- **Undo was performed after the restart**, so it exercised the persisted
  note id: note deleted, both media files gone, history entry `undone`,
  deck count 83 → 84 → 83, **zero note types minted**.
- Cleanup verified **from PowerShell**: `profiles.json`, `profile-rules.json`,
  `library.json`, `media.json` and `study-orchestrator-v2.json` all hash-match
  their pre-run baseline. `anki-intervals.json` and the Chromium `DIPS`/WAL files
  changed, which is ordinary app-launch behaviour, not migration residue.

### Two things this run learned — do not re-derive them

1. **Switching the primary subtitle track mid-playback loses the earlier cues of
   the newly selected track.** directstream starts a *new* subtitle stream from
   the current position. Selecting Japanese with the clock at ~16 s left track 3
   starting at cue index **1** (6,648 ms); index 0 (2,148 ms) never arrived, so
   `Previous line` could not reach it and, from a position with no active cue,
   moved *forward* to the nearest later cue. **Workaround: seek to 0, set the
   track to `Off`, then re-select it.** The whole timeline then arrives. This is
   sidecar behaviour, not an overlay defect — do not read a missing early cue as
   a cue-delivery regression.
2. **`Open local video` in the workspace header calls `window.api.pickMedia()`**,
   which opens a native file dialog that a bridge-driven pass cannot answer, and
   it blocks nothing visible — the run looks stuck. Raise the app's own
   `seanime:media-workspace-open` event with a `localFilePath` instead; that is
   the same request the button ends up making. Watch the escaping: a
   double-escaped path reaches the sidecar as `C:\\Users\\…` and comes back
   `HTTP 500 … could not find local file`.

`docs/migration/tools/phase5-anki-probe.mjs` now takes `JP_PROBE_DECK` so a gate
can name its own deck (`StudyOS::_Phase3GplayProbe` here). `arm` records the deck
in its snapshot and `disarm` deletes *that* deck, so a disarm run without the
variable set still cleans up correctly.

## Start here, 2026-07-30

Read `src/PHASE_5_READING_CONVERGENCE_STATE.md` "Live proof #6" first, then the
sections below. Three things carry over:

1. **A stale architecture-baseline entry was removed.**
   `tools/architecture-baseline.json` listed
   `test-only-module:src/main/city/assets/validateAssets.ts` while that file is
   deleted (`git status: D`) by another track, which failed both
   `node tools/architecture-audit.cjs` and
   `src/shared/__tests__/architectureBaseline.test.ts`. The dead entry is gone
   and both are green again. If that track restores the file, the audit will
   report it as new and the entry should come back.
2. **`tsc` was silently useless and now is not.**
   `src/renderer/assets/reading-garden/audio/fetch-mooncap-music.mjs` opened with
   four shell-style `#` comment lines — a JS syntax error. `tsc` aborted there
   and reported 17 diagnostics, all in that file, masking every other type error
   in the repo, so the recorded **278 baseline was not comparable to anything**.
   Fixed here (`#` → `//`, comments only). The real repo-wide figure is now
   **286**, none of it from migration paths. Treat 286 as the new baseline and
   re-derive it rather than trusting 278.
3. **One piece of Anki residue needs a human.** `JP Study App::Custom::Phase 5
   manga probe (temporary)` is left in the live collection with 0 notes, because
   AnkiConnect has no `deleteModel` action. Delete it in Anki: *Tools → Manage
   Note Types*. `docs/migration/tools/phase5-anki-probe.mjs` no longer creates
   one — see "Anki probe destination" below.

## Anki probe destination — use the tool, and know why it works that way

`node docs/migration/tools/phase5-anki-probe.mjs arm|disarm|status`, run while
the app is **not** running (it reads these files at startup and rewrites them on
quit, which would undo a restore performed underneath it).

It redirects `seed-ja-immersion`'s `deckName` to `StudyOS::_Phase5MangaProbe`
rather than adding a profile, and that is not a style choice. A custom profile's
note type is always derived from its label — `shared/profiles.ts`
`makeCustomProfile` builds `JP Study App::Custom::<label>`, and
`main/profiles.ts` `mergeAnkiBinding` resets any stored `modelName` that differs
from it, treating it as a legacy migration. So a temporary custom profile mints a
permanent note type that nothing can delete through the API. Redirecting a seed
profile keeps the shipped note type and leaves only a deck, which *can* be
deleted.

Also remember the older, related finding: a matching mining rule owns the
destination, so a per-panel deck choice is silently overridden. That is why
arming touches `profile-rules.json` too.

## Translation defects found and FIXED 2026-07-30

**The local model works.** Loaded directly from Node with the exact prompt
`buildSentencePrompt` produces, `Qwen_Qwen3-1.7B-Q4_K_M.gguf` answers
`猫が窓辺で寝ている。` with "A cat is sleeping on the window ledge." in ~800 ms.
Any report that translation is broken should start by re-checking this, because
the first read of this session was wrong: the probe passed `from`/`to` where the
API takes `source`/`target`, so `undefined === undefined` hit a same-language
short-circuit and the input came back as `{ok: true, text: <input>}`. That was a
measurement error **and** it exposed three real defects, all now fixed with
tests:

1. **`translateText` validated nothing about the language pair** — it only
   compared them. A missing or unknown code therefore read as "same language,
   nothing to do" and returned the source text as a successful translation.
   It now rejects an unrecognized or non-string code with a real message
   (`src/main/__tests__/translateGuards.test.ts`).
2. **The sentence path never checked its output, while the batch path always
   had.** `translateSentence` returned `cleanLlmOutput(raw)` straight through,
   so a model that echoed its input — or leaked kana into an English line —
   produced a "translation" nothing could distinguish from a real one. It now
   applies `isValidCrossLangTranslation`, retries once with the strict prompt,
   and yields nothing rather than an echo. `translateText` drops an
   untranslatable sentence instead of back-filling it with source text (a
   Japanese clause inside an English paragraph reads as part of the
   translation), and throws when *no* sentence survives.
3. **The manga analyze persisted a non-translation and counted it.** This is
   what actually produced the bogus caches during the OCR proof:
   `translateMokuroPage` returned the page unchanged when no region translated,
   and `analyzeMangaVolume` wrote it to `_ocr/<stem>.tr.<lang>.json` regardless,
   so `refreshMangaOcrMeta` counted the page as translated and the reader
   offered "Show translation" for its own Japanese. Nothing surfaced because
   `runTranslationBatch` reports a failed item as an empty string rather than by
   throwing. Now: the page is cached only if at least one region really
   translated, an echoed source is rejected at the persistence boundary too, and
   `analyzeMangaVolume` returns a `warning` that the reader shows
   (`src/main/__tests__/mangaOcrTranslateCache.test.ts`).

## Read this before re-verifying anything in the running app

Two traps cost real time this session, both producing convincing false negatives:

1. **Never call app modules via a console `import()`.** Under Vite that resolves to a
   *second* module instance with its own state. `setUiLang` from such an import moves
   nothing the app subscribes to (read as "the UI doesn't repaint"), and
   `getActiveScraperSettings()` from one returns an empty store (read as "sources and
   torrent search are broken"). Drive the real control or the real UI.
2. **A rendered value is not proof of a live call.** `ipcScraperPort.route()` silently
   falls back to sample data when a real call throws. Tail main's log bus
   (`window.api.scraperTailLogs`) and require the matching backend line before believing a
   screen.

## Phase 4 — complete, 2026-07-29

Acceptance was "every `ready` entry still `ready` on the new backend, re-verified live, no
promotion without a recorded run". 28 of 28 hold; per-entry runs are in
`proof/phase4-reverify-20260729/ready-entry-reverification.json`. ADR-003's English-only
regression is closed (`proof/i18n-20260729/`). Two defects were fixed rather than papered
over: the `page.results` per-job library id, and a `src/shared` import cycle between
`acquisition.ts` and `scraperResults.ts`.

Still blocked on this machine, and deliberately left `untested`: qBittorrent (no Web UI
enabled — a user configuration decision) and debrid (no account).

## Phase 5 — opened 2026-07-29, first slice landed

The canonical model (`shared/readingModel.ts`) and the read-only provider-backed manga
boundary are in and proven live — see `src/PHASE_5_READING_CONVERGENCE_STATE.md` and
`proof/phase5-reading-20260729/`. The `ReadingLocator` union (page index | EPUB CFI | char
offset) is the load-bearing piece: it is what lets three readers that address content in
three incompatible ways share one progress type.

**Second slice landed 2026-07-29 (later session).** Full detail in
`src/PHASE_5_READING_CONVERGENCE_STATE.md`; the three things worth knowing here:

1. **The locator union was wrong and is corrected.** It was written against a
   stale comment in `types.ts` calling `Progress.location` an "EPUB CFI location
   string". No reader in this app has ever produced a CFI — `NovelReader` writes
   `p:<part>:<frac>`, `parseLoc` reads it back, and `bookmarks.ts` stores the
   same string in a field it merely *names* `cfi`. The `offset` arm had no
   producer at all. The union is now `page | part`. If you find yourself
   re-adding a `cfi` arm, check that a reader actually emits one first.
2. **Both readers are on the model**, so the `readingLibraryAdapter.ts` pending
   entry in `tools/architecture-baseline.json` is gone (pending 4 → 3). No
   stored progress value changed shape — the projection emits the exact
   `toFixed(4)` string `saveNow` already wrote, and a test pins that.
3. **A renderer surface exists**: `MangaProviderBrowser`, mounted in Reading
   Finder, plus two new channels — `readingMangaProviders` and
   `readingMangaPageImage`. The page fetch lives in main because an `<img>`
   cannot send the Referer/User-Agent pair provider CDNs check, and Seanime's
   own `/api/v1/image-proxy` needs a token an `<img>` also cannot send.

**Pick up here: none of slice 3 has been run live.** See "Next safe actions".

**Running the sidecar for a reading proof:** still set `SEANIME_DATADIR` — not because
the default is disposable any more (it is not, as of 2026-07-30), but because a proof
must run on an isolated profile rather than the real `<userData>/seanime`. The isolated
test profile with both fixture providers is `%TEMP%/seanime-phase3-gplay-20260728`.
Historical note, since older records read the other way: before the durable-datadir
change, omitting the variable minted a fresh temp datadir per start and **deleted it on
stop**, so an extension installed without it vanished on the next restart.

Do not run `vite build` while `npm start` is up: the build writes into `dist/`, which the
Forge dev watcher has locked, and Forge dies with `EBUSY`.

## Where you are

Repo `C:/Users/Arseniy/Projects/jp-study-app` · branch `grammarx/phase-1-5`.

Committed migration line:

- `55df6e9` — Phase 1 and Phase 2;
- `dd2ca47` / `ffc703f` — Phase 3 entry/video-core adoption and record;
- `cfd05fa` / `d96d140` — real subtitle join and opening player seam;
- `a4e495d` — first full-plan continuation slice: core study controls on VideoCore;
- `03d27a3` — editable VideoCore mining preview, screenshot/audio assets, and Anki
  history/undo contract;
- `ea77f59` — secondary-track cue timeline and directstream startup-race fix; live
  dual-track acceptance was negative at that boundary (superseded by `3fe73d0`).
- `3fe73d0` — terminal subtitle-batch fix, verified 6+6 dual cues, shadowing, Whisper
  track generation, and Study OS-owned restart continuity.
- `1c51d6c` — deterministic WebGPU preflight/CPU fallback plus a disposable ffmpeg-PCM
  harness; live `whisper-base` inference generated and mounted 3 cues.
- `29582e0` — card-preview containment correction found by the final old/new visual
  comparison; G-VIS now passes at the normal Chrome proof viewport.
- `8d10aa1` — reusable isolated G-PLAY datadir preparer; the prepared one-file collection
  reopens as media ID `154587` without touching Study OS userData.

The old record called Phase 3 closed after the cue seam. That was too narrow. The
authoritative `SEANIME_MIGRATION_PLAN.md` requires the complete retained control set and
one uninterrupted mine → assets → preview → live Anki → restart run. **That run happened
on 2026-07-30 and passed — G-PLAY is closed.** Phase 3 stays open only for the
shadowing microphone hardware proof.

## Verify before doing anything

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -6
git -C C:/Users/Arseniy/Projects/seanime-upstream status --short
```

The pinned checkout must remain at `9bdd052` with exactly:

```text
 M seanime-web/public/jassub/jassub-worker.js
 M seanime-web/src/routeTree.gen.ts
?? seanime.exe
```

Never clean the main worktree. It contains extensive unrelated concurrent work. Stage
only explicit migration paths.

## Current VideoCore study contract

- One clock only: `vc_videoElement`.
- Real selected-track timeline: `VideoCoreSubtitleManager.getCues()`.
- Cue identity/provenance: `index`, `trackNumber`, raw `text`, exact `startMs` / `endMs`.
- Delay-aware activation:
  `(video.currentTime - subtitleDelay) * 1000`.
- Display text may strip ASS tags; raw text and demuxer timings must remain intact.
- Real audio/subtitle selection goes through `vc_audioManager` /
  `vc_subtitleManager`.

The seven-hunk upstream patch is regenerated in memory by
`make-jassub-substitution.mjs`; never hand-edit or clean the pinned checkout.

## Implemented and proved

`VideoCoreStudyOverlay` now supplies previous/replay/next line, ±1/30 frame step,
subtitle delay, persisted speed, auto-pause, line loop, A–B loop, subtitle/audio track
selection, Japanese subtitle visibility, click lookup with optional pause, selection/line
translation, furigana, and dictation.

Isolated real-sidecar proof:

```text
provider cc8a86ef-1ed4-4a08-9f07-842fbbaf45df
parser 11,871,913 bytes
2148-5148ms  猫が窓辺で寝ている。
6648-9398ms  今日は本当にいい天気ですね。
```

Observed: real element at 0.75×, +0.1 s subtitle delay, delayed auto-pause, repeated
line loop, A–B transition, three furigana readings, and exact dictation match. The
isolated processes and temp datadir were removed afterward.

## Mining preview now implemented

`VideoCoreMiningPanel` stays on the one VideoCore clock and exposes editable word/sentence
fields, deck selection, screenshot capture, exact cue-range audio capture, Mine card,
duplicate history, and undo. `videoCoreMining.ts` preserves cue → episode → media →
assets → draft provenance and builds the committed `MineNoteRequest`.

The isolated real-sidecar proof captured cue 3:0 (`2148–5148 ms`) into a **113,329-byte
PNG** and **48,843-byte WebM**, retained both after editing the term to `猫`, and restored
the video to paused, 1×, `2.151889s`. No Anki mutation was invoked.

Do not import the currently untracked `StudyOrchestratorWorkspace.tsx` or related
orchestrator contracts into this migration line unless their owning session first commits
them. The local adapter deliberately depends only on committed Anki contracts.

## Remaining Phase 3 work

Nothing blocking. G-PLAY closed 2026-07-30, the visual comparison is closed, and
the shadowing microphone hardware proof is a **user decision to skip**, recorded
as a permanent known gap. The implementation is build-clean and the environment is
capable; only the human capture was never performed. **Phase 3 can be closed by
retiring the old player.**

The final visual comparison is closed. Its first run exposed horizontal overflow in the
mounted preview; `29582e0` corrected the grid/control containment, and the rerun retained
readable dual cues, exact timing, the full control dock, and a two-column preview without
horizontal scrolling.

The final Electron run is pre-staged at
`C:\Users\Arseniy\AppData\Local\Temp\seanime-phase3-gplay-20260728`. A clean sidecar
reopen returned one collection item and one local file (`mediaId: 154587`). Launch with:

```text
SEANIME_SIDECAR=1
SEANIME_EXE=C:\Users\Arseniy\AppData\Local\Temp\seanime-phase3-verified.exe
SEANIME_DATADIR=C:\Users\Arseniy\AppData\Local\Temp\seanime-phase3-gplay-20260728
```

Do not launch while the existing `electron-forge start` instance is alive. It was inspected
and is still the old player with the sidecar flag off.

Dual subtitles are now closed. Patch `0002` flushes the terminal directstream batch before
successful stop/cancellation. The isolated two-track run delivered 6 Japanese + 6 English
cues and simultaneously rendered `猫が窓辺で寝ている。` /
`The cat is sleeping by the window.` at 2148–5148 ms. Use
`docs/migration/tools/build-patched-sidecar.mjs` for a corrected binary; the original
pinned `seanime.exe` still contains the bug.

## G-PLAY cue delivery is FIXED and verified live (2026-07-28, later session)

**The negative below is historical.** Cue delivery now works against the real sidecar with
`React.StrictMode` enabled. Proof: `docs/migration/proof/gplay-20260728/`.

Three changes closed it:

1. `patches/seanime/0003-…` **3a** — `video-core.tsx` §1016-1021's "Override active player"
   effect was a no-op (`activePlayer === props.id` can only be true when already set), so a
   nulled `vc_activePlayerId` could never recover. Guard inverted to `!==`.
2. `patches/seanime/0003-…` **3b** — `video-core.tsx` §954 is a `useUpdateEffect` and is the
   only caller of `dispatchVideoLoadedEvent()`, so a player *mounted with* playback info
   never announced its stream. Without `video-loaded` the server holds no playback state and
   drops every `video-loaded-metadata` (`videocore.go` §916-922), so
   `StartSubtitleStream` is never reached. Added a deduped mount-case dispatch.
3. **The seam itself was the root deviation.** `src/media/StudyPlayerSlice.tsx` mounted
   `<VideoCore>` inside `{state.active && …}`. Upstream's own host mounts it
   *unconditionally* (`native-player.tsx` §340-348) and lets `state.active` flow as a prop.
   The slice now does the same and is hidden by CSS while idle. Conditional mounting is what
   exposed 3a and 3b at all — do not reintroduce it.

Live result: 12 real `MKVParser_SubtitleEvent`s, 11 `cuechange` activations across both
tracks, `readyState 4`, `duration 30.386`. The sidecar log now contains the two lines that
had never once appeared — `directstream > Video loaded metadata` and
`directstream > Player seeked` — followed by `Starting new subtitle stream`.

**The asset gap that was open here is CLOSED (2026-07-30).** Mined assets are now
referenced by the note. The sections below are the historical record of how it
was found and fixed; the closing run is at the top of this file.

### Historical record — the first attempt's negative

The environment is fine. The player is fine. **Cue delivery never starts**, so G-PLAY
cannot proceed past step one. Full evidence is in `CURRENT_STATE.md` under "G-PLAY first
live attempt". Summary:

- real sidecar, real fixture, `directstream/play/localfile -> 200`, real frames,
  `readyState 4`, `duration 30.386s`, real `VideoCoreSubtitleManager`, both probe tracks
  discovered, full control dock — all good;
- **0 cue changes** across ~25 s of real playback and after an explicit seek;
- the sidecar only ever ran *metadata* parsing; no subtitle stream was started.

Nothing downstream was claimed. No cue mined, no asset captured, no Anki call made.

**Do not re-derive these two facts:**

1. Draining the directstream body by hand (11,873,146 bytes) does **not** trigger subtitle
   generation. Consuming the stream is not the trigger — a *client event* is.
2. The mounted UI has no click-path to start playback. The card's Watch button routes to
   the unadopted entry page (`media-entry-card.tsx` §178-182), so playback must be started
   through the real endpoint until the entry surface is adopted.

### That lead was tested and is DISPROVEN — do not retry it

The `onLoadedMetadata` / `if (!proofConfig) return;` hypothesis is wrong. That prop is a
Study OS extra; the adopted VideoCore sends `video-loaded-metadata` itself from
`video-core-events.ts` §274-284, independent of our prop. Two more disproven guesses,
recorded so they are not re-derived:

- **not** `isActivePlayer` alone, and **not** the empty `X-Seanime-Client-Platform`.
  `Target` is hardcoded to `player.TargetVideoCore` in `internal/videocore/adapter.go`
  §217-221, so the blank `platform=` in the ws log is a red herring.

### Gate 1 — FOUND AND FIXED: StrictMode double-mount breaks the seam

`src/renderer/main.tsx` wrapped `<App/>` in `React.StrictMode`. The adopted VideoCore is
not StrictMode-safe. Its double-mount runs `useUnmount` (`video-core.tsx` §837-842), which
both dispatches `video-terminated` — killing the just-created server stream — and calls
`setActivePlayer(null)`. Nothing restores it: the only setter is `VideoCoreProvider`'s
mount-only `[]` layout effect (§203-212), and §1016-1021 only re-asserts when the value is
*already* equal. In our seam the provider stays mounted permanently while `VideoCore`
mounts/unmounts with `state.active`, so `vc_activePlayerId` is stuck `null` forever.

`isActivePlayer` false gates the entire DOM-listener block (`video-core-events.ts`
§253-313), so `loadedmetadata`, `seeked`, `play` and `pause` client events are never sent.
Imperative dispatches (`video-loaded`, `video-can-play`, `video-terminated`) still fire,
which is what made this look like a working player.

Discriminator used, worth reusing: dispatch a cancelable `dragover` on the video element.
§500-515 attaches that listener gated on `videoElement` only, so `defaultPrevented === true`
proves the element atom is live and isolates the failure to `isActivePlayer`.

Removing StrictMode flipped the wire from `video-loaded → video-terminated → video-loaded`
to `video-loaded-metadata ×2, video-seeked, video-can-play, video-resumed,
video-subtitle-track`, with no terminate and `readyState 4 / duration 30.386`.

**RESOLVED.** The app-wide StrictMode removal was reverted; StrictMode is enabled again and
the run is green. The correct fix was not to re-assert from the seam but to stop unmounting
the player at all — see the three changes at the top of this file.

### Gate 2 — RESOLVED

Was: `Populating 0 events for track 4`, metadata parsing only, and neither
`directstream: Video loaded metadata` (§519) nor `directstream: Player seeked` (§551) ever
logging.

The suspicion recorded here was correct and the mechanism is now confirmed: `video-loaded`
never reached the wire, so `GetPlaybackState()` failed and §919-922 dropped the metadata
event. The cause was not the `waitForWatchHistory` / `currentPlaybackRef` condition but the
`useUpdateEffect` **at §954 itself** — an update-effect never runs on mount, and our seam
mounted the player with `playbackInfo` already set. Fixed by patch 0003b plus the
unconditional mount.

### G-PLAY asset gap — FIXED and live-verified 2026-07-30

**Update 2026-07-30.** Both findings below are implemented, unit-tested, and now
**re-verified against the live collection** — note `1785396692600` references both
the PNG and the WebM. Evidence:
`docs/migration/proof/gplay-20260730/gplay-asset-reference-and-restart.json`.

- `shared/anki.ts` gained `appendUnreferencedMediaToFields` and
  `mediaFilenamesFromAnkiMarkup`; `main/anki/index.ts` calls them through
  `attachUnreferencedMedia` on **all three** card paths (field-template,
  automatic, prebuilt). Anything the rendered fields do not already reference is
  placed into a name-matching field if the model has one, else the last field
  carrying content (the sentence, in practice), else the final field. A model
  with a real picture/audio role keeps its layout untouched.
- The silent deck override is surfaced: `mineNote` stamps `deckOverriddenByRule`
  and `VideoCoreMiningPanel.tsx:380` reports it instead of swallowing it.
- Covered by `shared/__tests__/ankiMediaFields.test.ts` and
  `shared/__tests__/videoCoreMining.test.ts`.

**Done 2026-07-30:** mined once more against the namespaced probe deck, the note
references both assets, and the restart/resume/history proof passed.

### The original finding, for reference

A real cue (`猫が窓辺で寝ている。`, track 3, 2148–5148 ms) was mined end to end against the
live 83-deck collection: a 171,302-byte PNG and a 48,843-byte WebM were captured from the
one VideoCore clock, `addNote` returned note `1785243770143`, and the panel's Undo removed
it cleanly (83 decks before and after, 0 residual). **But the note referenced neither
asset.**

Both files *were* stored in Anki's media folder (`jp-video-cue-3-0-2148.webm`,
`jsa-vn-2b20c77cfa5e.png`). They are never referenced because the routed model
`JP Study App::JA Immersion` has fields `[Term, Reading, Sentence]` only — no picture or
audio role. `src/main/anki/index.ts` §330 drops the image outright when
`model.fieldMap.image` is falsy, and no `[sound:…]` reference reached a field either.

Second finding from the same run: the panel's **"Anki destination" is silently ignored when
a mining rule matches**. `index.ts` §310-314 sets `routedToRule` and the profile owns the
deck, so a card aimed at `StudyOS::_MigrationProbe` landed in `JP Study::Immersion`. That is
the documented policy, not a bug, but the panel gives no indication — worth a disabled state
or a "routed by rule" hint.

Neither is a player defect and neither should be fixed inside the player seam.

## Two environment traps

> **Two of these are CLOSED as of 2026-07-31** — the watchdog and the stale token. They are
> struck through below rather than deleted, because the *symptoms* they describe are still
> the right things to recognise if the keepalive ever stops being held. See the section at
> the top of this file.

- ~~The sidecar's no-client watchdog exits the process (code 1) shortly after the last
  websocket client disconnects, so a renderer reload kills it. Restart from the dev panel
  and re-read the port — it is **ephemeral and changes every start**.~~ — the supervisor
  now holds a websocket of its own, so only a real app exit drops the last client. The port
  is still ephemeral per *start*; it simply stops changing under you.
- The first-launch telemetry consent screen renders before the desktop shell and blocks
  every surface behind it. It has since been answered and no longer blocks.
- ~~**The renderer never re-provisions its auth token when the sidecar restarts.**
  `bootstrapSeanimeConnection` runs only when the media host mounts, so after any sidecar
  restart every adopted API call returns 401 `UNAUTHENTICATED` until a full page reload.~~
  — **STALE, and it was already stale before the keepalive landed.** `MediaWorkspaceHost`
  re-runs the bootstrap on every `status.kind`/`pid`/`port` change, `MediaWorkspace` is
  keyed `seanime-${pid}-${port}` so it remounts, and `MediaWorkspace.tsx` writes the new
  token straight into `serverAuthTokenAtom` behind a `provisioning` gate — `atomWithStorage`
  never sees a storage event for a write made by the same window. Do not re-fix this.
- `X-Seanime-Token` carries the password **hash**, not the launch `--password`. Read the
  live value from `window.api.seanimeConnection()`, not from `localStorage`, which goes
  stale.
- The renderer logs `[WebsocketProvider] No pong response for 60s, reconnecting` on a loop.
  That churn is what starves the sidecar watchdog; it predates any instrumentation and is
  an open defect in its own right.

## Next safe actions

**The sources popup, both Phase 5 gate slices and G-PLAY are all done.** What is
left, in order:

1. ~~Re-run the G-PLAY mine~~ — **DONE 2026-07-30**, see "G-PLAY is CLOSED" above.
2. ~~The microphone proof~~ — **SKIPPED by user decision 2026-07-30**, recorded as
   a permanent known gap. Do not treat it as a blocker; do not start a microphone
   recording without the user present and asking for it.
3. ~~The novel/EPUB slice~~ — **DONE 2026-07-30**, see "Phase 5 gate slice (b)"
   above. Both gate slices are proven.
4. **Old-player retirement — UNBLOCKED 2026-07-30.** Both blockers are closed with
   recorded runs (`proof/datadir-durable-20260730/`): the datadir is durable under
   `<userData>/seanime` and survives a real quit/relaunch, and a packaged build now
   ships `resources/seanime/seanime.exe`. The retirement itself — flipping
   `SEANIME_SIDECAR` on by default and removing the legacy `MediaContent` player — is
   the next concrete piece of work, and it should open with the one thing still
   unproven: launch the **packaged** app once with the flag on and watch the sidecar
   reach `ready`. Cross-track: the study-mode track's three steps that waited on the
   flag are unblocked; its `HANDOFF.md` has been updated.
5. **Phase 6 — Study Mode over the unified library** (`SEANIME_MIGRATION_PLAN.md:625`).
   This is the next thing that can actually be started, since Phase 5's gate is met
   and Phase 3 has no remaining proof work.
6. Out-of-gate Phase 5 leftovers, whenever they buy something: one run against a
   **real third-party manga provider extension** (the mechanism is proven, a real
   provider's quirks are not), local manga **volumes**, and PDF (no reader — and
   confirmed out of gate scope).
7. **Deferred by user decision to a final testing pass after all phases**:
   qBittorrent Web UI and debrid, the two Phase 4 environment-blocked entries.

Reusable tooling for any reading work, all self-cleaning:

- `node docs/migration/tools/reading-boundary-harness.mjs [--keep]` — the
  boundary against a real sidecar; `--keep` leaves the sidecar and CDN up so the
  app can be pointed at them.
- `node docs/migration/tools/make-manga-fixture-pages.mjs` — the readable
  Japanese pages. Run it before the CDN.
- `node docs/migration/tools/fixture-manga-cdn.mjs` — the CDN alone, port
  **18846**, hardcoded by the fixture extension's page URLs. It serves the
  rendered pages when they exist and the 1×1 GIF otherwise. A stray
  `python -m http.server` once squatted this port and had to be killed.
- `node docs/migration/tools/manga-ocr-harness.mjs` — the shipped OCR pipeline
  outside Electron. Use this, not a live app run, for anything about *what OCR
  reads*; it takes seconds.
- `node docs/migration/tools/phase5-anki-probe.mjs arm|disarm|status` — see the
  section above.

**Sidecar lifetime trap — CLOSED 2026-07-31.** Closing the Media workspace used to kill the
sidecar (`exited with code 1`): `--desktop-sidecar` arms Seanime's no-client dead-man switch
and the *media workspace* was the only thing holding a websocket. The supervisor now holds
one itself for the life of the app, so the workspace can be opened and closed freely. The
observation that the switch does not fire before a *first* client connects still holds and
is why the 2026-07-30 Discover → download run survived, but nothing depends on it any more.

Cue delivery itself needs no further work — it is verified live and covered by
`patches/seanime/0003-…` plus the unconditional mount in `StudyPlayerSlice.tsx`.

## Phase 6 — OPEN, slice 1 landed 2026-07-30

Full detail: **`src/PHASE_6_SEANIME_STUDY_MODE_STATE.md`**.

> **Name collision.** `src/PHASE_6_STUDY_MODE_STATE.md` — without `SEANIME_` — belongs to a
> **different track** (the study-mode track, 2026-07-29). The numbering coincides by
> accident. Migration Phase 6 detail is in the `_SEANIME_` file. Do not merge them.

Study OS already has the whole deterministic readiness engine, keyed on Study OS
`MediaItem.id`. So Phase 6 needs no new engine — it needs the **join**. Slice 1 is that
join, plus the read-only sidecar boundary, wired to `window.api.seanimeStudyLibrary()`.
Pure, no I/O in the model, 52 new tests.

Three things not to re-derive:

1. **The join is by absolute path**, normalised through `studyLibraryPathKey` (case-fold,
   separators, trailing separator), one direction, nothing written back. It is the only
   fact both libraries record independently.
2. **`GET /api/v1/library/collection` does not contain matched local-file paths.**
   `libraryData` is counts only (`types.ts:1527`). Paths come from
   **`GET /api/v1/library/local-files`**; the collection is read only for titles, and that
   read is allowed to fail. Building against `libraryData` yields an empty result that
   looks exactly like an empty library.
3. **`unlinked` is a distinct state** from `unanalyzed` — in the Seanime library but never
   imported into Study OS. Collapsing them sends the user to the wrong action.

**Slice 2 landed too: the renderer surface.**
`renderer/components/reading/SeanimeStudyLibraryPanel.tsx`, mounted in `MediaWorkspaceHost`
behind a **Library / Readiness** segmented switch. Two things in it are load-bearing:

- The library pane is **hidden with CSS, never unmounted**, when Readiness is showing. The
  adopted workspace holds the sidecar websocket and the no-client watchdog kills the sidecar
  shortly after the last client disconnects.
- **`window.api.listLibrary()` is the *reading* library** (`sourcePath`, no `path`). Joining
  against it puts **every** entry in `unlinked` — a total but silent join failure. The media
  library is **`listMedia()`**.

**The join is verified against real data** (`proof/phase6-join-20260730/`): all 30 real
`media.json` paths join across six plausible Go-side formats, 30 distinct keys, negative
control holds. Offline, read-only, hashes identical before and after.

**That verification corrected this file's own previous next-step.** It said to do a live
bridge call. That would have returned a **false green**: the real durable Seanime profile has
`local_files` = `"[]"`, no settings, no scan ever — an empty library, so the join returns `[]`
and looks clean while proving nothing (the 1×1-GIF shape again). Related correction:
`proof/datadir-durable-20260730/` proved datadir adoption and survival, and the datadir it
adopted was **empty** — its "188,416 bytes" is SQLite page overhead, not library content.

**The real data also shaped the UI:** 29 of 30 items have no Japanese subtitle, so the
preparation queue is the default view and `ready` is a filter you ask for.

**Two things for the user to decide, not to be guessed:**

1. **A real cross-track dependency.** All four orchestrator modules are **untracked** —
   including `shared/mediaStudyOrchestrator.ts` and `shared/studyEpisodeReadiness.ts`, which
   `shared/seanimeStudyLibrary.ts` imports. Reusing that engine is what Phase 6 *is*, so the
   coupling is intended, but it is confined to one module and the renderer surface takes the
   document as an optional prop so it needs zero coupling. Either that track commits those
   files, or Phase 6 keeps scores optional permanently.
2. The plan pairs "subtitle and Anki health". Slices 1–2 cover the subtitle half. What makes
   an entry *Anki*-healthy — a configured destination, a matching mining rule, or existing
   notes? It decides what the surface nudges toward.

**Slice 3 landed as well: difficulty filters and the first row action.** Difficulty is read
off the readiness snapshot, never re-derived. The rule that matters: **unknown difficulty is
not a failed difficulty** — an unscored entry is kept, because on the real library that is
30 of 30 and the opposite choice empties the surface the moment anyone touches a filter.
(A null `contentLevel` on a *scored* entry does fail a level filter; a null `knownCoverage`
does not fail a range. Both pinned.) The level control hides itself when nothing is scored.
`Open` raises `seanime:media-workspace-open` with the real path — deliberately not
`pickMedia()`, whose native dialog a bridge-driven run cannot answer. Analyse and import are
**not** wired: they belong to other tracks' services and reach for the same untracked
orchestrator modules this phase is bounded against.

**Slice 4 did the service-ownership check and wired the half that passed.** `unlinked` →
**import** is live: `window.api.addMediaPaths` → `media:addPaths`, and both `main/media.ts`
and `preload.ts` are **tracked**, which is the bar this line already holds itself to.
`unanalyzed` → **analyse** is still not wired, now for a *verified* reason — **no analyse
API is exposed in `preload.ts` at all** (grepped, not assumed); that path goes through the
untracked orchestrator.

Two things from slice 4 worth carrying:

- **`media:addPaths` can silently do nothing.** It skips a file whose extension is not in
  `MEDIA_EXT`, or that does not exist, and returns `readDb().items` either way — so *the
  call not throwing is not evidence the import happened*. Success is checked by the item
  arriving under its join key; the skip gets its own message. Because the handler returns
  the whole library, the join recomputes and the row leaves `unlinked` on its own.
- **A vacuous-assertion trap:** two tests asserted on the text `"Not imported"` to check row
  state, but that string is also a permanent filter-chip label — one passed either way.
  Both now assert on `.study-lib-row[data-state=…]`. When a UI string appears in more than
  one role, assert on the structural attribute.

## Both Phase 6 decisions are SETTLED — slice 5, 2026-07-30

**1. The cross-track dependency: readiness scores stay OPTIONAL, permanently.** The user did
not care either way, so the call was made here. **Nobody needs to commit the four
orchestrator modules.** The surface already degrades gracefully — 30 of 30 real entries
resolve without them — the coupling stays confined to one module that re-exports the types,
and nothing further is owed. Closed, not deferred.

**2. "Anki-healthy" — the user's answer was better than the question:** *"if everything works
as the user intended then it is healthy."* Not three competing definitions. Operationalised
as one deterministic question: **would mining from this library actually land a card right
now?** `seanimeStudyAnkiHealth` reports `disconnected` (with Anki's own reason),
`no-decks`, or `no-profile` — each named separately because each has a different fix — and
when healthy it says *where* cards will land.

Three things not to re-derive: it routes as **`source: 'subtitle'`**, exactly what
`videoCoreMining.ts:211` builds for a mined cue (pinned by a test — if it drifts the panel
advertises a destination the mining panel never uses); a **matched mining rule is named**,
not swallowed, because a rule owns the deck and silently overrides a per-panel choice (a real
G-PLAY finding); and **`disconnected` outranks `no-decks`**, since an unreachable Anki has no
decks to report. It is library-level by design — every file mines through the same route —
and loads in its own effect so a dead Anki never stops the library rendering.

## The Phase 6 surface got its own UI pass — and it found real defects

The session's earlier design pass ran *before* this surface existed, so slices 2–5 had never
had it applied and had never been **looked at**. There is now a harness:

```bash
npx vite --config vite.renderer.config.ts --port 5174
```

then `…/src/renderer/__devharness__/study-library-harness.html?state=empty`
(`populated|empty|offline|anki-down|scored`). The Browser pane still cannot screenshot while
hidden, but **layout resolves**, so geometry and computed styles are measurable — which
caught three things jsdom structurally cannot:

1. **Row action buttons were 23 px tall** — under WCAG 2.5.8's 24×24 minimum; padding alone
   did not clear it. Now `min-height: 26px`.
2. **The row path measured 4.57:1** — over the 4.5:1 line, but only just. Now 6.87:1.
3. **A dead CSS rule at 420 px:** `justify-self` on the button is inert inside a flex parent,
   so the row stacked left while its buttons stayed flush right.

Also measured, not assumed: no horizontal overflow at 1280 or 420 px, rows go column
correctly, chips 27 px, zero console errors. The harness is dev-only and absent from the
production build.

## Slice 6 — the watch-to-review loop — LANDED 2026-07-30. Phase 6's plan line is complete.

Full detail: `src/PHASE_6_SEANIME_STUDY_MODE_STATE.md` "Slice 6".

The outbound half of this loop has existed since `03d27a3` — mining writes a full
`VideoCoreCueProvenance` for every exported card. **Nothing ever read it back.** Slice 6 is
the return path: `watch → mine → review → come back to the line`. New **Review** segment in
the workspace host, so the switch is now **Library · Readiness · Review**.

**Five things not to re-derive:**

1. **An interval is not a due date**, and `shared/seanimeWatchLoop.ts` never pretends
   otherwise — same rule and same reason as `reviewForecast.ts`. Cards are described by
   maturity. `anki:dueForecast` *does* know due-ness but answers collection-wide, so it
   cannot be attributed to a title and is deliberately unused here.
2. **Absent from the interval snapshot is `untracked`, not `new`.** `sourceQueries` is the
   union of the profiles' sync queries, so an unmatched note is never scanned at all.
3. **The card ↔ interval join is by `noteId`, never by expression.** A mined card's `term`
   defaults to the whole sentence and the user may edit it, so expression matching fails
   silently on exactly the cards that matter.
4. **`startAtSec` is what makes this a loop rather than a list.** It rides on
   `MediaWorkspaceOpenRequest`, and in `StudyPlayerSlice`'s `watch` case it **outranks the
   stored resume position** — using `??` not `||`, because a requested `0` is a real
   destination — and **only for the file it was issued for**, since the request object
   outlives the open that consumed it (both sides compared through `videoCoreResumeKey`).
5. **The per-row mining rollup on the Readiness view has its own effect on purpose.** The
   first version put it inside the Anki-health effect and one throwing call erased the
   health verdict; two existing tests caught it. The card count is provenance and survives a
   dead Anki — only "needs a look" needs the snapshot.

**The harness found a real defect:** with Anki unreachable the panel claimed *"Nothing is
stuck — every mined card is in normal rotation"* and showed a row of confident zeroes. A
clean bill of health from a question nobody asked — the 1×1-GIF shape again. It now says
Anki could not be asked and **drops every Anki-derived stat tile**, keeping only the
provenance-derived card count. Both pinned by tests.

**And a measurement trap worth more than the defect.**
`resize_window({preset:'desktop'})` "resets to native size", which with the Browser pane
hidden is **0×0**. Two rounds of geometry taken after that call reported a 14 px flex
overflow and 36 clipped terms; both were fictions. At a real 1280 px and at 420 px measured
overflow is **0 everywhere**. Set an explicit viewport before measuring and re-read
`document.documentElement.clientWidth` inside the same probe.

**The rollup is a handoff, not a label.** Stating "3 need a look" on a readiness row with
nowhere to click is worse than not stating it, so the rollup is a button raising
`STUDY_REVIEW_FOCUS_EVENT` (`{pathKey, title}` — the join key, never a raw path); the host
catches it, switches to **Review** and scopes the view. **Focus filters the input, not the
output** — the mining history is filtered before the model runs, so the tiles, the attention
list and the duplicate count all describe the same set. A focus matching nothing stays
clearable and says "No cards from this title", not the library-wide "Nothing mined yet".

**The player now knows what you already mined.** The last missing arrow: while watching,
nothing told you a line was already a card, so you re-mined it and found out from Anki's
duplicate warning — *after* the framing, screenshot and audio clip were captured. That is
what the G-PLAY run hit. `findMinedCueEntry` (pure, over history already in the panel's
state — no Anki call, nothing that could stutter playback) puts the marker beside the mine
result, outside the collapsible form. Three rules in it:

- **`watchLoopSourceKey` refuses `videoCoreResumeKey`'s `playback:` fallback.** A
  `playbackId` is minted fresh on every open, so it can never prove a cue was mined in an
  *earlier* session. Accepting it would look like it worked — it matches within one
  session, which is when you least need it — and answer "never mined" after every restart.
- **Cue identity is track + index + `startMs` together.** Selecting a track mid-playback
  restarts the stream and re-indexes from the current position, so an index alone can point
  at different lines across sessions. `startMs` is demuxer-stable.
- **`exported` and `duplicate` count; `undone` and `failed` do not.** An undone card was
  deliberately removed, so the line is minable again — warning there costs the user a card.

New harness: `watch-loop-harness.html?state=populated|empty|anki-down|clear|stream|many`,
plus `&focus=1` / `&focus=miss` for the handoff.

## `startAtSec` MOVES A REAL VIDEO — proven live 2026-07-30

Evidence: `docs/migration/proof/startatsec-20260730/`. Bridge-driven (no mouse/keyboard),
isolated G-PLAY fixture profile, real `<userData>/seanime` never touched, 0 stray processes
after quit, resume store restored byte-exact.

The discriminator was free: the store already held `3.566411` for that file from the G-PLAY
run. **Three runs, two distinct supplied values, each landing within 15 ms and each
overriding a different stored resume** —

```
startAtSec 12.5 (store 3.566)  →  play 12.5 · seeking 12.5 · seeked 12.515
startAtSec 25.0 (store 22.2 )  →  play 25.0 · seeking 25.0 · seeked 25.006
startAtSec 12.5 (repeat)       →  play 12.5 · seeking 12.5 · seeked 12.500
```

**An open question found in the same run, deliberately not over-diagnosed.** Reopening the
*same already-active* file with **no** `startAtSec` did **not** apply the stored resume — it
restarted at 0. Not a measurement error (the store was planted with `8.8` under the exact key
the app writes, and re-read immediately before dispatch to rule out `ResumeTracker`
overwriting it), and **not a regression from this slice** (that path is byte-identical to
before). Resume *is* known to work on a cold mount — `proof/gplay-20260730` recorded
`play t=6 → seeking t=6 → seeked t=6` after a real restart. So the failing case is a reopen
while the player is already active. **Measured but unexplained** — do not write it up as
"resume is broken" from one probe.

**Two environment findings worth more than the gate itself:**

1. **The sidecar port is ephemeral AND the renderer's connection can be stale against it.**
   A first attempt gave a permanently idle player: `WebsocketSender … socket state: null`,
   with `seanimeConnection()` on port 50916 while `seanimeStatus()` said 60938. Sequence
   that works: start the sidecar → **reload** → re-read **both** and require them to
   **agree** → only then dispatch the open. Do not trust either alone.
2. **`/eval` takes its code in a field named `js`, not `code`** (a wrong name returns
   `{ok:false,error:'missing js'}`, which reads like a bridge fault). **`/screenshot` writes
   a PNG to `debug/shots/` and returns `{ok, path, size}` JSON** — piping its body to a
   `.png` gives a 137-byte JSON file.

**What is left in Phase 6:** the rest of the live pass — the Library/Readiness/Review switch
itself, the per-row mining rollup against real history, and the Anki verdict against the live
collection. Plus the **analyse row action**, still with no committed API (nothing
analyse-shaped is exposed in `preload.ts` at all), which blocks nothing now that scores are
permanently optional.

**Also unblocked and independent: old-player retirement.** Both blockers closed with recorded
runs; it opens with the one never-proven step — launch the **packaged** app once with
`SEANIME_SIDECAR` on and watch the sidecar reach `ready`.

## Current verification — re-measured 2026-07-30

**Latest, after Phase 6 slice 6 (the watch-to-review loop)** — full tests
**3,404 / 3,404; 303 / 303 files** (+81 tests, +3 files); TypeScript **288** (baseline, 0 in
any changed file); i18n exit 0 at **6,113** keys (five new count keys carry all four Russian
CLDR categories); architecture audit exit 0 "nothing new", 3 known pending, 1,214 modules;
targeted ESLint exit 0 on every changed/new file; main, preload and renderer builds exit 0;
CSS containment **6,950 / 6,950 scoped; 0 unscoped** (+1: the already-mined marker's rule,
correctly `#media-workspace`-scoped in `mediaWorkspace.css`); the dev harness is absent from
`dist`. Treat **3,404 / 303** and **6,113** as the current baselines.

**One structural defect in this slice's own first cut, now fixed and pinned.** The Review
pane was added as a sibling of the other two, *inside* `MediaWorkspaceHost`'s
`status.kind === 'ready'` branch — but Review reads **nothing** from the media server (its
data is localStorage mining history plus Anki), so a stopped sidecar hid the user's own
mined cards. It now renders outside the sidecar gate, the sidecar notice is suppressed
beside it, and the library pane still mounts whenever the sidecar is up (unmounting it kills
the websocket and the watchdog kills the sidecar).
`renderer/__tests__/mediaWorkspaceHostReview.test.ts` is the **first host-level test in this
track**; its key assertion was *verified to fail* on the pre-fix structure. Two traps in
writing it: the **Suspense fallback reuses `.seanime-host-state`**, the same class as the
sidecar notice, so that class cannot distinguish the two states; and **`seanimeBootstrap`
and `MediaWorkspace` must both be mocked** — without the first, `conn.baseUrl` is empty and
the library pane never renders, so the sidecar-up case is untestable; without the second the
test pulls in the whole adopted vendor bundle.

> **Two traps specific to this slice.**
> `// eslint-disable-next-line react-hooks/exhaustive-deps` is itself an **error** in this
> repo — the `react-hooks` plugin is not configured, so the rule "was not found". Do not
> copy that directive in from other React codebases.
> And `function Panel({ focus }: Props = {})` makes tsc infer the component's props as bare
> `Attributes`, so every `createElement(Panel, { focus })` fails with an unhelpful "No
> overload matches this call". Make the props optional; never default the whole object.

**Previous, after Phase 6 slice 5** — full tests **3,323 / 3,323; 300 / 300 files**;
TypeScript **288** (baseline, 0 in changed files); i18n exit 0 at **6,068** keys
(`studyLibrary.unscoredKept` uses CLDR plural forms, all four Russian categories);
architecture audit exit 0 "nothing new"; targeted ESLint exit 0; main, preload and renderer
builds all exit 0; CSS containment **6,949 / 6,949 scoped** (unchanged — the Phase 6 panel's
CSS correctly went to the shell stylesheet, not the Tailwind-scoped one). Treat
**3,323 / 300** and **6,068** as the current baselines.

**Previous, after the UI/UX pass** (`src/media/MediaWorkspaceHost.tsx`,
`src/media/VideoCoreStudyOverlay.tsx`, `src/media/VideoCoreMiningPanel.tsx`,
`src/media/mediaWorkspace.css`, `src/renderer/styles.css`,
`src/renderer/components/reading/MangaProviderBrowser.tsx`, the four i18n catalogs,
new `src/shared/mediaWorkspaceLabels.ts` and two new test files):

| Gate | Result |
|---|---|
| full tests | **3,229 / 3,229 pass; 297 / 297 files** — +14 tests in 2 new files |
| TypeScript | **288** — identical to the baseline, and 0 in any changed file |
| i18n check | **exit 0** — **6,020** English keys in ja/zh/ru (27 added) |
| architecture audit | **exit 0**, "nothing new"; 3 known pending; 1,201 modules |
| targeted ESLint | **exit 0**, zero output, on all 7 changed/new files |
| Electron main SSR build | exit 0 |
| preload build | exit 0 |
| renderer build | exit 0 (run after main, to restore `dist/assets`) |
| CSS containment | **6,949 / 6,949 scoped; 0 unscoped; 0 shell `--tw-` tokens** |

Treat **3,229 / 297**, **288** and **6,020** as the current baselines.

**Lint trap:** `npx eslint src/media/` reports 66 errors — every one of them in
`src/media/jassub/assets/jassub-worker.js` and `src/media/jassub/runtime.js`,
vendored jassub assets that are pre-existing and were never touched. Lint the
changed *files*, not the directory, or you will read those as your own.

**Previous, after the durable-datadir change** (`src/main/seanime/dataDir.ts` new,
`src/main/seanime/supervisor.ts`, `src/main/__tests__/seanimeDataDir.test.ts` new):

| Gate | Result |
|---|---|
| full tests | **3,215 / 3,215 pass; 295 / 295 files** — 12 new datadir tests in 1 new file, plus 3 packaging pins added to `seanimeExePath.test.ts` |
| TypeScript | **288** — identical to the baseline, none in the changed files or `forge.config.ts` |
| targeted ESLint | **exit 0**, 0 errors, 0 warnings — including `forge.config.ts`, which had a **pre-existing** `no-empty-function` error on the keep-alive timer (present in `HEAD`, surfaced only because the file was being linted); given the file was open anyway, the no-op now carries a comment body |
| architecture audit | **exit 0**, "nothing new"; 3 known pending |
| i18n check | **exit 0** — no new UI strings (the datadir line goes to the raw log tail) |
| Electron main SSR build | exit 0 |
| renderer build | exit 0 (run after main, to restore `dist/assets`) |

Treat **3,215 / 295** and **288** as the current baselines. The preload build and the CSS
containment check were not re-run for the datadir change (main-process code only, no
preload surface, no CSS) — but `npm run package` afterwards ran the full Forge build chain
including preload and renderer, and exited 0.

**Previous re-measure, 2026-07-30, after the novel/EPUB slice and the exe-path
change** (`src/renderer/views/NovelReader.tsx`, `src/main/seanime/supervisor.ts`,
new `src/main/seanime/exePath.ts`, two new test files):

| Gate | Result |
|---|---|
| full tests | **3,200 / 3,200 pass; 294 / 294 files** |
| i18n check | **exit 0** — 5,993 English keys present in ja/zh/ru (no new UI strings) |
| architecture audit | **exit 0**, "nothing new"; 3 known pending |
| TypeScript | **288** — identical to the baseline, so none added. The 4 in `NovelReader.tsx` are pre-existing (`item.lang` on `LibraryItem`, line 111) |
| targeted ESLint | **exit 0**, 0 errors; 9 pre-existing `no-non-null-assertion` warnings in `NovelReader.tsx` |
| Electron main SSR build | exit 0 |
| preload build | exit 0 |
| renderer build | exit 0 |
| CSS containment | **6,924 / 6,924 scoped; 0 unscoped; 0 shell `--tw-` tokens** |

Treat **3,200 / 294** and **288** as the current baselines. The table below is the
full set from the earlier session, kept for comparison.

| Gate | Result |
|---|---|
| full tests | **3,191 / 3,191 pass; 292 / 292 files** — green, including the 8 new translate/cache tests |
| i18n check | **exit 0** — all 5,993 English keys present in ja/zh/ru |
| architecture audit | **exit 0**, "nothing new"; 3 known pending findings |
| TypeScript | **288 diagnostics**. The old "278" was unmeasurable — see the `tsc` note at the top. 286 of these are pre-existing and none are in changed logic; the 2 added are `TS1378` top-level-`await` in the two new test files, the same accepted diagnostic the existing `mangaOcr.test.ts` carries for the same `vi.mock` + `await import` pattern |
| targeted ESLint | **exit 0** on every file changed this session (1 pre-existing warning in `translate.ts`) |
| Electron main SSR build | exit 0 |
| preload build | exit 0 |
| renderer build | exit 0 |
| CSS containment | **6,924 / 6,924 scoped; 0 unscoped; 0 shell `--tw-` tokens** |
| manga OCR fixture readability | **exit 0 — 5 / 5 bubbles read exactly** |

Build order matters: run the **renderer build last**. The main and preload builds
write into `dist/` and remove `dist/assets`, which is where
`check-media-css-containment.mjs` looks for the CSS chunks — run it after the
renderer build or it fails with `ENOENT … dist\assets`, which is an ordering
error, not a containment failure.

`src/media/seanime-boundary.d.ts` remains hand-maintained. TypeScript does not open the
vendor tree, so production build and live harness are the signature gates.

## Destructive-risk constraints

- Do not launch a second Electron instance; it shares `%APPDATA%/jp-study-app`.
- Anki is live on the real 82-deck collection. Use only the namespaced, self-cleaning
  probe deck for the final gate.
- Do not edit or clean the pinned upstream checkout.
- Never run `git clean -fd`, `git reset --hard`, or broad staging.

---

## Slice 23 (2026-08-01) — Blanc's toolbox player, watched playing a file

Appended by the Blanc-player session. Earlier sections are untouched.

**The standing item is closed.** Slice 22 recorded "Blanc's toolbox player has still never
been watched playing a file" as the oldest untouched item. It has now been watched:
`4.028 -> 8.039 s`, `1920x1080`, duration `30.386`, inside the Blanc frame, in Blanc's own
window. Record: `docs/migration/proof/blanc-player-live-20260801065000/` (+ `slice-23.json`).

**The 2026-07-31 run could not have succeeded, and the stopped sidecar was the smaller
reason.** The larger one: it never looked at Blanc. The toolbox is a separate
`BrowserWindow` on `blanc.html?blanc=1`, and that harness filtered CDP targets with
`!url.includes('?')` — excluding the Blanc window *by construction*. Its
"a Blanc surface is present in this window" came from the loose `[class*=blanc]` arm
matching a taskbar button. Phase B now reproduces both moves and records the match, so this
is evidence rather than assertion.

**Two questions from slice 15, both answered:**

| Question | Answer |
| --- | --- |
| Does `.blanc-study-player` bound the full-screen-laid-out surface? | **It did not — it collapsed it.** Measured `frame 392x0`, `video 392x0`, while that video was decoding at 1920x1080. Fixed in `theme/blanc-media.css`; now `frame 392x221`, `video 392x189`, dock `353x165`, all contained. |
| Do the `video.*` keys collide with Blanc's own keymap? | **No collision.** R → 6.519 (cue 6.5), W → 2.002 (cue 2.0), S → 6.515 (cue 6.5), control `x` → no seek, toolbox tab unchanged across every press. |

**Two findings worth not re-deriving:**

1. **A bounds check cannot tell "bounded" from "collapsed."** Phase H *passed* against a
   zero-height frame, because `right <= viewport.w` and `h <= 45vh` are both trivially true
   of a 392x0 box. It now tests non-degeneracy first.
2. **Blanc's first directstream open is lost to `React.StrictMode`.** Two sockets on one
   client id (release/re-acquire, which `seanimeSocketPool` cannot prevent), and the sidecar
   logs `Skipping open step for cancelled preparation` when the released one disconnects.
   The main window escapes it only because its open arrives as an *event* at an
   already-mounted session, where the effect re-runs on a prop change — once. The harness
   recovers by changing the **request** (a new `positionSec`, so a new `hashRequestId`) on
   the still-mounted session, never by remounting. **Every run opens on attempt 2.**

**Still open after this slice:** the first open in Blanc still fails for a real user — the
panel says "Opening local file" and stops. The workaround lives in the harness; the fix
belongs in `StudyPlayerSlice`/`BlancStudyPlayer`. Proven in a dev build only.

Gates: vitest **331 files / 3788 tests pass**; `tsc --noEmit` **288** (baseline, unchanged);
i18n **exit 0, 6348 keys**; architecture audit **exit 0, "Nothing new"**; CSS containment
**6950/6950 scoped, 0 unscoped**.
