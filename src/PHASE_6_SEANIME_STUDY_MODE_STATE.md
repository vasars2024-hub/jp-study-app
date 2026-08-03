# Seanime migration · Phase 6 — Study Mode over the unified library

**Opened 2026-07-30. Slice 1 landed: the library join, the readiness projection, and the
read-only sidecar boundary, wired to IPC. Not yet run live; no renderer surface.**

Plan reference: `docs/migration/SEANIME_MIGRATION_PLAN.md` §9 — *"Readiness and difficulty
filters across the Seanime library; preparation queues; subtitle and Anki health;
watch-to-review loop. Deterministic first, AI second."* Size `M`.

> **Name collision, read this first.** `src/PHASE_6_STUDY_MODE_STATE.md` — no `SEANIME_` —
> is a **different track's** doc ("Phase 6 — Unified Study Mode", the study-mode track,
> 2026-07-29). The two numberings coincide by accident. That track's Phase 6 built
> `shared/studyEpisodeReadiness.ts`, which *this* slice consumes, so they are related but
> not the same work. This file follows the migration track's `PHASE_3_SEANIME_*` /
> `PHASE_4_SEANIME_*` naming. Do not merge or overwrite either with the other.

## What slice 1 is, and what it deliberately is not

Study OS already owns a complete deterministic readiness engine
(`shared/mediaStudyOrchestrator.ts`, `shared/studyEpisodeReadiness.ts`), keyed on Study OS
`MediaItem.id`. Phase 6 therefore does **not** need a new engine. What it needs is the
**join** from the Seanime library onto that engine, plus a projection reusing the existing
readiness states verbatim.

Slice 1 is that join. It is pure: no filesystem access, no subtitle bytes read, no sidecar
call inside the model — the same rule `studyEpisodeReadinessRail` follows.

## Files

| File | Role |
|---|---|
| `shared/seanimeStudyLibrary.ts` | Canonical model: `SeanimeLibraryFile`, `studyLibraryPathKey`, `studyLibraryPathIndex`, `joinSeanimeStudyLibrary`, `seanimeStudyLibraryHealth`, `seanimeStudyPreparationQueue` |
| `shared/__tests__/seanimeStudyLibrary.test.ts` | 34 tests |
| `main/seanime/studyLibrary.ts` | Read-only sidecar boundary — two GETs, no writes |
| `main/__tests__/seanimeStudyLibraryBoundary.test.ts` | 18 tests |
| `main/seanime/index.ts` | `seanime:studyLibrary` IPC handler |
| `preload.ts`, `renderer/window.d.ts` | `window.api.seanimeStudyLibrary()` |

## The load-bearing decision: join by absolute path, one direction

The risk register lists *"two identity systems drift"* with the mitigation *"external-id
columns only, one direction"*. Both libraries independently record an absolute filesystem
path for the same file — Seanime's `Anime_LocalFile.path`
(`vendor/seanime/generated/types.ts:1710`) and Study OS's `MediaItem.path` ("Absolute
source path on disk", `shared/types.ts:112`). That path is the only shared fact neither side
had to be taught, so it is the key. **Nothing is written back into either store**: a wrong
guess costs a missing row, not a corrupted library.

Paths go through `studyLibraryPathKey`, never compared raw. The one real Seanime path on
record (`docs/migration/proof/gplay-20260728/`) is native Windows with backslashes, the same
form Study OS stores — but that is **one sample from one fixture library**, and the sidecar
is a Go process under no obligation to keep emitting it. The key folds case, normalises
separators, and strips a trailing separator. It does *not* resolve relative paths or follow
links: both contracts promise an absolute path, and adding resolution would put filesystem
access into a pure module.

`studyLibraryPathKey` returns `''` for anything unusable, and both the index and the join
**skip empty keys explicitly** — otherwise every pathless file would collide into one entry.

## Readiness states

`StudyEpisodeReadinessState` plus one arm only the unified library can produce:

| State | Meaning | Cheapest next action |
|---|---|---|
| `ready` | In both libraries, analysed, every cache-invalidation signal still matches | none |
| `stale` | Analysed, but a fingerprint moved | re-analyse |
| `unanalyzed` | Japanese subtitle attached, never analysed | analyse |
| `missing-subtitles` | In both libraries, no Japanese track | get a subtitle |
| `unlinked` | **Only** in the Seanime library — Study OS never imported it | import |

`unlinked` is deliberately distinct from `unanalyzed`; collapsing them would send the user
to the wrong action, and a test pins the distinction.

`ready` requires **all** of: analyzer version, `subtitleReady`, knowledge fingerprint,
level-lists fingerprint, frequency-lists fingerprint, and the snapshot's
`subtitleRecordId` matching the currently attached Japanese track. Anything less is
`stale` — which still carries the snapshot, so a caller may show it as "last known", but it
must never be presented as current. An **absent** `frequencyListsFingerprint` (a record
predating that field) counts as a mismatch, not a match: treating it as equal would show a
score built from different lists.

`seanimeStudyPreparationQueue` excludes `ready` and orders by how little work each state
needs (`unanalyzed` → `stale` → `missing-subtitles` → `unlinked`), ties keeping incoming
order so the queue is stable.

## The endpoint trap — do not re-derive this

`GET /api/v1/library/collection` looks like where local files live. **It is not.**
`Anime_LibraryCollectionEntry.libraryData` is `Anime_EntryLibraryData`, carrying only
`allFilesLocked`, `sharedPath`, `unwatchedCount` and `mainFileCount` (`types.ts:1527`).
Per-file paths for *matched* entries appear nowhere in that response — only
`unmatchedLocalFiles` and `ignoredLocalFiles` hold `Anime_LocalFile[]`, and by definition
those are the files that matched nothing.

Paths come from **`GET /api/v1/library/local-files`** ("Route returns all local files",
`vendor/seanime-web/api/generated/endpoints.ts:1039`). The collection is read *only* to
resolve `mediaId` → display title, and that read is allowed to fail — an unnamed row beats
no rows, and the model already falls back to the Study OS title and then the file name.

Building this against `libraryData` would have produced an empty result indistinguishable
from an empty library. Caught by reading the generated types before writing the adapter,
which is the standing rule in this track.

## Other decisions worth not re-deriving

- **`ignored` files are dropped.** The user told the sidecar not to treat them as library
  content; surfacing them in a study queue relitigates that.
- **Titles are not translated.** A title is study *content*, which `CLAUDE.md`'s i18n scope
  rule puts out of bounds. `userPreferred` wins because that is the name the adopted library
  UI already shows; then romaji, english, native.
- **The IPC handler never throws across the boundary.** It returns `{ ok: false, error }`,
  because a stopped sidecar reaching the renderer as an empty array is indistinguishable
  from an empty library — the Phase-1 lifecycle rule.
- **`SeanimeLibraryFile` is declared structurally**, not imported from the generated Seanime
  types, so `src/shared` stays independent of `vendor/`. `main/seanime/studyLibrary.ts`
  adapts the real type onto it.

## Gates at the end of slice 1

| Gate | Result |
|---|---|
| full tests | **3,281 / 3,281 pass; 299 / 299 files** (+52 tests, +2 files) |
| TypeScript | **288** — the baseline; 0 in any changed file |
| i18n check | exit 0 — 6,020 keys (slice 1 adds no UI strings) |
| architecture audit | exit 0, "nothing new"; 3 known pending |
| targeted ESLint | exit 0 |
| main / preload / renderer builds | all exit 0 |
| CSS containment | 6,949 / 6,949 scoped; 0 unscoped |

**Two gates moved during this slice; both were real, not noise:**

1. `main/seanime/studyLibrary.ts` was briefly a **new `test-only-module`** architecture
   finding — correctly, because the boundary existed with nothing in production calling it.
   Fixed by wiring the `seanime:studyLibrary` IPC channel, *not* by adding a baseline entry.
   A boundary nobody calls is unfinished work, not acceptable debt.
2. tsc went **288 → 290** because an untyped fixture literal in the new mining-panel test
   silently omitted `VideoCoreMiningSource`'s two required fields. The fixture is now
   explicitly typed. Annotate test fixtures — an inferred literal defers the error to a
   confusing overload message at the call site.

## Cross-track dependency — REAL, and it needs a decision

`shared/seanimeStudyLibrary.ts` imports from `shared/mediaStudyOrchestrator.ts` and
`shared/studyEpisodeReadiness.ts`. **All four orchestrator modules are untracked**
(`git ls-files` returns nothing for them; `git status` shows `??`):

```
?? src/shared/mediaStudyOrchestrator.ts
?? src/shared/studyEpisodeReadiness.ts
?? src/renderer/mediaStudyOrchestrator.ts
?? src/renderer/components/media/StudyOrchestratorWorkspace.tsx
```

`docs/migration/NEXT_SESSION.md` says not to import that track's in-flight orchestrator
contracts into this migration line. But Phase 6 is *defined* as Study Mode over the unified
library, and the plan's whole point is to reuse that engine rather than build a second one.
So the dependency is unavoidable, and reimplementing readiness to dodge it would be strictly
worse.

What was done instead, so the exposure is bounded:

- The dependency is **confined to one module**. `seanimeStudyLibrary.ts` imports it and
  **re-exports** `StudyOrchestratorDocument`, `StudyReadinessSnapshot` and
  `StudyReadinessFingerprints`, so every consumer depends on *this* module. If those files
  churn, exactly one import block breaks instead of every call site.
- The **renderer surface never imports them at all.** It takes the document and
  fingerprints as optional props. Without them the join still resolves
  `unlinked` / `missing-subtitles` / `unanalyzed` — which is **30 of 30** of the user's real
  library, so the surface is fully useful with zero coupling. Only `ready` vs `stale` needs
  the document.

**Decision for the user:** either that track commits those four files, or Phase 6 keeps the
scores optional permanently. Worth asking rather than assuming — it is the difference
between the surface showing coverage percentages or not.

## Slice 2 — the renderer surface, landed 2026-07-30

`renderer/components/reading/SeanimeStudyLibraryPanel.tsx`, mounted in
`MediaWorkspaceHost` behind a **Library / Readiness** segmented switch, with
`renderer/__tests__/seanimeStudyLibraryPanel.test.ts` (10 tests) and 33 new i18n keys in
all four languages.

**The real data dictated the design**, not the other way round — the offline join proof was
run *before* this was written:

- **29 of 30 real items have no Japanese subtitle.** A surface leading with "your ready
  titles" would be empty on this user's actual library. So the **preparation queue is the
  default view**, `ready` is a filter you have to ask for, and every row states its *next
  action* rather than only its state.
- **The real Seanime profile has an empty library.** "Sidecar ready, zero files" is the
  user's current state, not an edge case, so it gets a first-class explanatory empty state
  ("set a library folder and run a scan") — pinned by a test, because the obvious
  implementation renders a blank panel there.
- An **offline sidecar** and an **empty library** are visually and semantically distinct
  (`role="alert"` + the reason vs `role="status"` + the fix). A test asserts the offline case
  does *not* say "your library is empty".

Accessibility and minimalism, consistent with the same-day UI pass: `role="group"` on the
filter set, `aria-pressed` on each filter, selection carried by border + background +
font-weight rather than hue, the load status as a live region that exists before its
content, and state conveyed by a text badge next to the coloured left edge — never colour
alone.

**Two near-misses worth keeping:**

1. **`window.api.listLibrary()` is the *reading* library** — its `LibraryItem` has
   `sourcePath` and **no `path` at all**. Joining against it would have put **every single
   entry** in `unlinked`: a total join failure that renders as a plausible-looking list and
   would have read as "Study OS has none of these files". The media library is
   **`listMedia()` → `MediaItem[]`**. Caught by checking the types, not by running it.
2. The library pane is **hidden with CSS, never unmounted**, when the Readiness view is
   active. The adopted workspace holds the sidecar websocket and the sidecar's no-client
   watchdog exits shortly after the last client disconnects — unmounting it to show another
   view would kill the media server underneath.

Gates after slice 2: tests **3,291 / 3,291; 300 / 300 files**; tsc **288** (baseline, 0 in
changed files); i18n exit 0 at **6,053** keys; architecture audit exit 0 "nothing new";
targeted ESLint exit 0; three builds exit 0; CSS containment **6,949 / 6,949** (unchanged —
the panel's CSS correctly went to the shell stylesheet, not the Tailwind-scoped one).

## The join IS verified against real data — 2026-07-30

Evidence: `docs/migration/proof/phase6-join-20260730/real-data-join.json`. Offline, no
Electron launch, no sidecar, read-only, source hashes identical before and after.

- All **30 real `media.json` items** produce 30 **distinct** normalised keys — no collisions
  on real data.
- All **six** plausible Go-side path formats joined **30/30** (as-is backslash, forward
  slashes, lowercased drive letter, fully lowercased, doubled separators, trailing
  whitespace).
- Negative control: a path only the Seanime side knows stayed `unlinked`.

**And it corrected this document's own next-step.** The gate originally specified here was a
live bridge call. That would have returned a **false green**: the real durable Seanime
profile has `local_files` = `"[]"`, `settings` 0 rows, `scan_summaries` 0 rows — an empty
library, so the join would have returned `[]` and looked clean while proving nothing. Same
shape as the Phase 5 manga proofs running on a 1×1 GIF. Checking the data first cost one
PowerShell copy and one script.

This also means `proof/datadir-durable-20260730/` should not be read as "188 KB of library":
it proved datadir *adoption and survival*, and the datadir it adopted was empty. 188,416
bytes is SQLite page overhead.

**Still unproven:** that a real Seanime *scan* emits paths in the form this join expects.
Only a scan can show that, and a scan is a **user decision** — it writes `settings` and
`local_files` into their profile, walks a media directory, and queries AniList. It is not
blocking; close it the first time a scan happens for any other reason.

## Slice 3 — difficulty filters and the first row action, landed 2026-07-30

**Difficulty filtering** (`filterSeanimeStudyDifficulty`, `matchesSeanimeStudyDifficulty`,
`hasDifficulty`, `seanimeStudyDifficultyLevels`, +12 tests). Difficulty is **not
re-derived** — it is read off the readiness snapshot the existing engine already produced
(`contentLevel`, `category`, `knownCoverage`), so a filtered view can never disagree with
the score shown beside it.

**The load-bearing rule: unknown difficulty is not a failed difficulty.** An entry with no
snapshot is *kept*, and `hasDifficulty` lets the caller mark it as unknown. On the real
library that is **30 of 30 entries**, so the opposite choice would have emptied the surface
the moment anyone touched a filter. `contentLevel: null` and `knownCoverage: null` on a
*scored* entry are handled separately and deliberately: a null level fails a level filter
(the snapshot exists and says nothing matches), a null coverage does not fail a range
(unknown, not out of range). Tests pin both.

**The level control renders only when something is actually scored.** With no readiness
document every level list is empty, and an always-present dropdown offering one option
would imply a filter that cannot do anything. When a difficulty filter is active the panel
says in words how many unscored files it kept, rather than leaving the user to wonder why
unrelated rows survived.

**One row action, and only one.** `Open` raises the app's own
`seanime:media-workspace-open` event with the entry's `localFilePath` — the same request the
workspace header's button ends up making, but *without* `pickMedia()`, whose native dialog
a bridge-driven run cannot answer and which blocks nothing visible. A test asserts the event
carries the real path. It is named by title for screen readers, because "Open" repeated down
a list is nothing to choose between.

**Analyse and import were deliberately NOT wired.** They belong to other tracks' services
(the study pipeline and media import), and the orchestrator modules those would reach for
are the same untracked ones this phase is already carefully bounded against. They remain
stated next actions on each row rather than half-wired buttons.

Gates after slice 3: tests **3,306 / 3,306; 300 / 300 files**; tsc **288** (baseline, 0 in
changed files); i18n exit 0 at **6,058** keys — the new `unscoredKept` string uses CLDR
plural forms, with all four Russian categories; architecture audit exit 0 "nothing new";
targeted ESLint exit 0; three builds exit 0; CSS containment **6,949 / 6,949**.

## Slice 4 — the import action, landed 2026-07-30

The service-ownership check slice 3 deferred, then the half of it that passed.

**Checked, with results:**

| Action | Committed contract? | Outcome |
|---|---|---|
| `unlinked` → import | **Yes** — `window.api.addMediaPaths` → `media:addPaths` in `main/media.ts`; both `main/media.ts` and `preload.ts` are **tracked** (`git ls-files` lists them) | **Wired** |
| `unanalyzed` → analyse | **No** — no analyse/pipeline API is exposed in `preload.ts` at all (grepped, not assumed). That path goes through the untracked orchestrator | **Still not wired**, and now for a verified reason rather than a suspected one |

This is the same bar the migration line already holds itself to — the Anki adapter
"deliberately depends only on committed contracts".

**The non-obvious part: `media:addPaths` can silently do nothing.** It skips any file whose
extension is not in `MEDIA_EXT`, or that does not exist, and returns `readDb().items`
either way — so *the call not throwing is not evidence the import happened*. Success is
verified by checking the item actually arrived under its join key, and the skip gets its own
message ("Study OS does not recognise that file type") instead of a success that did
nothing. A test covers the skip, and a third covers a thrown failure.

Because the handler returns the **whole** library, the join simply recomputes and the row
transitions `unlinked` → `unanalyzed` (or `missing-subtitles`) on its own — no manual
refresh, no invalidation logic.

Import is offered **only** on `unlinked` rows, where it is the stated next action; an Import
button on a file Study OS already has would do nothing and say nothing.

**A vacuous-assertion trap caught here, worth repeating.** Two tests asserted on the text
`"Not imported"` to check row state. That string is *also* a permanent filter-chip label, so
one assertion passed either way and the other would have. Both now assert on
`.study-lib-row[data-state=…]`. When a UI string appears in more than one role, assert on the
structural attribute, not the text. Separately, `IS_REACT_ACT_ENVIRONMENT` is now set in the
panel test — without it React warns on every update, which is noise that would hide a real
warning.

Gates after slice 4: tests **3,310 / 3,310; 300 / 300 files**; tsc **288** (baseline, 0 in
changed files); i18n exit 0 at **6,063** keys; architecture audit exit 0 "nothing new";
targeted ESLint exit 0; three builds exit 0; CSS containment 0 unscoped.

## Slice 5 — Anki health, landed 2026-07-30. Both user decisions are now SETTLED.

**Decision 1 — the cross-track dependency: the user did not care, so the call was made
here. Readiness scores stay OPTIONAL, permanently.** No one has to commit the four
orchestrator modules. The surface already degrades gracefully (30 of 30 real entries resolve
without them), the coupling stays confined to one module, and nothing further is owed. Treat
this as closed, not as a deferred question.

**Decision 2 — what "Anki-healthy" means: the user's answer was better than the question.**
Not three competing definitions — *"if everything works as the user intended then it is
healthy"*. Operationalised to one question with a deterministic answer: **would mining from
this library actually land a card right now?**

`seanimeStudyAnkiHealth` (pure, +10 tests) checks the three things that must hold, reporting
each failure separately because each has a different fix:

| Problem | Meaning | Fix |
|---|---|---|
| `disconnected` | Anki unreachable; the reason is carried through when Anki gave one | start Anki / AnkiConnect |
| `no-decks` | connected, but nothing to mine into | make a deck |
| `no-profile` | nothing routes a subtitle card | set a profile |
| *(healthy)* | a card would land, and it says **where** | — |

Three things worth not re-deriving:

- **It routes as `source: 'subtitle'`**, which is exactly what `videoCoreMining.ts:211`
  builds for a mined cue. A test pins that. If it drifts, the panel would advertise a
  destination the mining panel never actually uses.
- **A matched mining rule is named, not swallowed.** A rule owns the deck and silently
  overrides a per-panel choice — that was a real G-PLAY finding — so the healthy line says
  which rule is doing it.
- **`disconnected` is reported ahead of `no-decks`.** An unreachable Anki has no decks to
  report, so the deck count is not evidence of anything.

It is **library-level, not per-entry**, and deliberately: every file here mines through the
same subtitle route, so a per-row copy of one verdict would be noise. It also loads in its
own effect — a dead Anki must not stop the library rendering, since subtitle work is still
actionable without it, and a test asserts the list survives.

Gates after slice 5: tests **3,323 / 3,323; 300 / 300 files**; tsc **288** (baseline, 0 in
changed files); i18n exit 0 at **6,068** keys; architecture audit exit 0 "nothing new";
targeted ESLint exit 0; three builds exit 0; 0 unscoped selectors.

## UI/UX pass over the Phase 6 surface — 2026-07-30, and it was NOT redundant

The session's earlier design pass ran before this surface existed, so slices 2–5 had never
had it applied and had never been **looked at** — only asserted on in jsdom. A harness now
exists so that is no longer true:

`src/renderer/__devharness__/study-library-harness.html` +
`studyLibraryHarness.tsx`, with `?state=populated|empty|offline|anki-down|scored`.
`empty` and `offline` are first-class scenarios because, per the join proof, they are the
two states the user would actually hit first.

```
npx vite --config vite.renderer.config.ts --port 5174
→ http://127.0.0.1:5174/src/renderer/__devharness__/study-library-harness.html?state=empty
```

The Browser pane still cannot screenshot while hidden, but **layout resolves**, so geometry
and computed styles are measurable — and that found three defects jsdom structurally
cannot see:

1. **Every row action button was 23 px tall.** WCAG 2.5.8 Target Size (Minimum) is 24×24
   CSS px, and padding alone did not clear it. Now `min-height: 26px`, re-measured at 26.
2. **The row path was 4.57:1** — `color-mix(--muted 78%, transparent)` composited over the
   panel at 10 px. Over the 4.5:1 line, but only just. Now plain `--muted` at **6.87:1**;
   the hierarchy was already carried by the size difference.
3. **A dead CSS rule at mobile width.** `.study-lib-open { justify-self: start }` inside the
   420 px media query is **inert** — its parent is a flex container, so alignment has to move
   to `.study-lib-row-actions { justify-content: flex-start }`. Without it the row stacked
   left while its buttons stayed flush right.

Also confirmed by measurement rather than assumption: no horizontal overflow at 1280 px or
420 px, no overflowing children at all, rows correctly go column at 420 px, filter chips are
27 px (pass), and the badge, meta and Anki lines are 17.77:1 / 6.87:1 / 6.87:1. Zero console
errors on load.

The harness is dev-only and **absent from the production build** (`vite build` emits
`index.html` only) and from the architecture audit's findings.

## Slice 6 — the watch-to-review loop, landed 2026-07-30

**The last item on the plan's Phase 6 line is implemented.** The migration has had the
*outbound* half of this loop since `03d27a3` — watch a line, mine it, a card lands in Anki
carrying a full `VideoCoreCueProvenance`. **Nothing ever read that record back.** Slice 6
is the return path:

```
watch a line  →  mine it  →  review it in Anki  →  come back to the line
```

That last arrow is the whole feature. A card that keeps failing has an exact file, an exact
track and an exact millisecond attached to it, and until now that was write-only data.

### Files

| File | Role |
|---|---|
| `shared/seanimeWatchLoop.ts` | Pure model: `watchLoopStage`, `seanimeWatchLoopCards`, `seanimeWatchLoopAttention`, `seanimeWatchLoopSummary`, `seanimeWatchLoopByEntry`, `watchLoopReplaySec` |
| `shared/__tests__/seanimeWatchLoop.test.ts` | 31 tests |
| `renderer/components/reading/SeanimeWatchLoopPanel.tsx` | The **Review** view |
| `renderer/__tests__/seanimeWatchLoopPanel.test.ts` | 15 tests (real `createRoot` render) |
| `renderer/__devharness__/watchLoopHarness.tsx` + `.html` | 6 scenarios, dev-only |
| `shared/mediaWorkspace.ts` | `startAtSec` on the open request |
| `media/StudyPlayerSlice.tsx` | `requestedStartSec` — an explicit destination outranks resume |
| `media/MediaWorkspaceHost.tsx` | Third segment: **Library · Readiness · Review** |
| `renderer/.../SeanimeStudyLibraryPanel.tsx` | Per-row mining rollup (the reverse connection) |

### Three honesty rules the model encodes

These are the load-bearing decisions, and each one had an obvious wrong alternative:

1. **An interval is not a due date.** `reviewForecast.ts` already states this for the same
   reason — interval *length* cannot become a due *date* without a last-reviewed timestamp
   the snapshot does not carry. Cards are described by **maturity**, never by "due today".
   `anki:dueForecast` does know due-ness, but its answer is collection-wide and cannot be
   attributed to one title, so it is deliberately **not** used here.
2. **Absent from the snapshot is `untracked`, not `new`.** `IntervalSnapshot.sourceQueries`
   is the union of the *profiles'* sync queries, so a note no query matches is never
   scanned. Folding those into "new" would report a confident zero-day interval for a card
   nobody looked at. It is its own arm with its own label.
3. **The join is by `noteId`, never by expression.** `createVideoCoreMiningDraft` sets
   `term` to the whole sentence and the user may edit it before mining, so matching
   `IntervalEntry.expression` against the history `term` would be a guess that fails
   **silently on exactly the cards that matter**. Both sides carry `noteId`; it is exact.

Two smaller ones: only `exported` history becomes a card (`undone` was removed, `failed`
never landed, `duplicate` has no `noteId` and is *counted separately* rather than dropped),
and **attention is only Anki's two authoritative markers** — `leech` and `suspended`. A
`new` card is backlog, and rewatching its line does not fix not having studied it; padding
the list with those would bury the two states a rewatch genuinely helps.

### `startAtSec` — the mechanism that actually closes the loop

Without it this surface is a list. `MediaWorkspaceOpenRequest` gained an optional
`startAtSec`, normalised at the boundary (a `NaN` or negative reaching
`initialState.currentTime` reads as a broken file, not a bad request) and consumed in
`StudyPlayerSlice`'s `watch` case, where **an explicit destination outranks the stored
resume position and nothing else does**.

Two details worth not re-deriving:

- **`??`, not `||`.** A requested `0` is the top of the file and must still suppress the
  resume rather than fall through to it.
- **It applies only to the file it was issued for.** The request object outlives the open
  that consumed it, so without a key check a later `watch` for a *different* file would
  inherit someone else's timestamp and silently start it minutes in. Both sides go through
  `videoCoreResumeKey`, reusing the resume store's own normalisation instead of inventing a
  second path-comparison rule.

`WATCH_LOOP_REPLAY_LEAD_SEC` is 1.2 s: seeking to the exact `startMs` lands a frame or two
late and clips the first mora, which is the part a struggling card usually needs.

### The reverse connection, so Phase 6 is one surface and not two

`seanimeWatchLoopByEntry` rolls cards up onto the **same `pathKey` the slice-1 join
produces**, and each *preparation* row now also says what watching it already produced
(`12 cards mined · 3 need a look`). Absent, not zero, when nothing was mined — a permanent
"0 cards mined" on every row is noise, and its absence is already the honest answer.

**It has its own effect, and that is load-bearing rather than tidy.** The first version put
the rollup fetch inside the Anki-health effect, where one throwing call erased the health
verdict entirely — caught by two existing tests going red, exactly the regression that file
already warns about ("a dead Anki must not stop the library rendering"). The card *count*
is provenance and survives a dead Anki completely; only the "needs a look" half needs the
snapshot, which is why a null snapshot still produces a rollup instead of suppressing it.

### The harness found a real defect, and one of my own measurements was an artifact

`watch-loop-harness.html?state=populated|empty|anki-down|clear|stream|many`.

**The defect:** with Anki unreachable the panel rendered *"Nothing is stuck — every mined
card is in normal rotation"* and a row of confident zeroes (`Need a look = 0`). That is a
clean bill of health derived from a question nobody asked — the same false-green shape as
the 1×1-GIF and the empty-library join. Now the attention line says Anki could not be
asked, and **every Anki-derived stat tile is dropped**, leaving only the provenance-derived
card count. Dropping them says "unknown" more clearly than any placeholder glyph, and both
behaviours are pinned by tests.

**The artifact, recorded so it is not repeated:** `resize_window({preset:'desktop'})`
"resets to native size", and with the Browser pane hidden that native size is **0×0**. Two
rounds of measurement taken after that call reported a 14 px flex overflow on
`.study-loop-card-head` and 36 clipped terms. Both were fictions of a zero-width viewport;
at a real 1280 px and at 420 px the measured overflow is **0 everywhere**. *Always set an
explicit width before measuring, and re-check `document.documentElement.clientWidth` in the
same probe.* The `min-width: 0` and two-line clamp added in response were kept — they are
correct guards for a term longer than the harness's — but the CSS comment was corrected to
say so rather than to claim it fixed an observed break.

Measured at a real viewport: replay buttons **26 px** (WCAG 2.5.8 pass), contrast
5.33–19.15:1 (lowest is the accent on the alert tile — passes), no horizontal overflow and
**zero overflowing children** at 1280 px or 420 px, stat tiles reflow 5→3+2 at 420 px, the
card foot re-aligns left via the *container* (the flex lesson from the last pass), zero
console errors, and the truncation at 24 rows is stated in words rather than silent.

### The rollup was a dead end, and that was the last real gap

Stating *"3 need a look"* on a readiness row and giving the user nowhere to click is worse
than not stating it. The rollup is now a **button** that raises
`STUDY_REVIEW_FOCUS_EVENT` (`{ pathKey, title }` — the join key, never a raw path);
`MediaWorkspaceHost` catches it, switches to **Review**, and passes the focus down. So the
connection runs both ways: Review → the video, and a preparation row → its own cards.

An event rather than threaded props, for the same reason `MEDIA_WORKSPACE_OPEN_EVENT` is
one: the two panels are lazy siblings under the host and neither owns the other.

**Focus is applied to the input, not the output.** `scopedHistory` filters the mining
history *before* the model runs, so the tiles, the attention list and the duplicate count
all describe the same set. Filtering only the rendered list would have left the tiles
reporting the whole library next to a single title's cards — quietly wrong in exactly the
way this surface exists to prevent, and pinned by its own test.

**A focus that matches nothing stays clearable.** The chip renders outside the content
branch, and the empty state says "No cards from this title" rather than the library-wide
"Nothing mined yet" — which would tell a user who has mined fifty cards that they have
mined none. Harness: `&focus=1` and `&focus=miss`.

### The third connection: the player now knows what you already mined

The loop had one arrow missing. While *watching*, the player had no idea which lines were
already cards — so you re-mine one and find out from Anki's **duplicate warning**, which is
the worst possible moment: the framing, the screenshot and the audio clip are all captured
by then. That is exactly what the G-PLAY run hit.

`findMinedCueEntry` reads it back at the point of use. Pure, over history already in the
panel's state — **no Anki call and no I/O**, so it cannot stutter playback. The marker sits
beside the mine result, outside the collapsible form, so it is legible before any capture
work is done.

Three rules in it, each with a wrong obvious alternative:

- **`watchLoopSourceKey` refuses `videoCoreResumeKey`'s `playback:` fallback.** A
  `playbackId` is a directstream id minted fresh on every open, so it can never establish
  that a cue was mined in an *earlier* session. Accepting it would make the lookup appear
  to work — it matches fine within one session, which is precisely when you least need it —
  and silently answer "never mined" after every restart.
- **Cue identity is track + index + `startMs`, together.** Index alone is not enough:
  selecting a track mid-playback restarts the stream and re-indexes from the current
  position (a real finding from the same G-PLAY run), so an index can point at different
  lines across two sessions. `startMs` comes from the demuxer and is stable.
- **`exported` and `duplicate` count; `undone` and `failed` do not.** A duplicate means
  Anki refused *because the note exists*. An undone card was deliberately removed, so the
  line is genuinely minable again — warning there would be wrong in the direction that
  costs the user a card.

### A defect in this slice's own first cut: Review was gated behind the sidecar

Worth recording because the mistake is structural, not a typo. The Review pane was added as
a sibling of the library and readiness panes — inside `MediaWorkspaceHost`'s
`status.kind === 'ready' && conn?.baseUrl` branch. But **Review reads nothing from the media
server**: its data is Study OS mining history (localStorage) plus Anki. So a stopped sidecar
hid the user's own mined cards for no reason whatsoever.

The pane now renders **outside** the sidecar gate, first in the body, and the sidecar notice
is suppressed while Review is showing (beside it, a "the media server is stopped" banner is
a standing error about nothing). The library pane still mounts whenever the sidecar *is* up,
including while Review is on screen — unmounting it would drop the websocket and the
no-client watchdog would kill the sidecar.

`renderer/__tests__/mediaWorkspaceHostReview.test.ts` (7 tests, the first host-level test in
this track) pins both directions, and the key one was **verified to fail on the pre-fix
structure** rather than assumed. Two things it learned:

- **The Suspense fallback reuses `.seanime-host-state`**, the same class as the sidecar
  notice, so that class alone cannot tell "sidecar stopped" from "lazy panel not resolved".
  Assert on the notice's own text.
- **`seanimeBootstrap` and `MediaWorkspace` must both be mocked.** Without the bootstrap
  mock `conn.baseUrl` is empty and the library pane legitimately never renders, so the
  sidecar-up case is untestable; without the workspace mock the test drags in the whole
  adopted vendor bundle.

Note the flag interaction, decided rather than overlooked: with `SEANIME_SIDECAR` off the
host returns `null` and Review is unreachable — correctly, since the cards it reports can
only be mined from the VideoCore player, which only exists when the flag is on.

### Gates after slice 6

tests **3,404 / 3,404; 303 / 303 files** (+81 tests, +3 files); tsc **288** (baseline, 0 in
any changed file); i18n exit 0 at **6,113** keys (Russian plurals in all four categories for
five new count keys); architecture audit exit 0 "nothing new", 3 known pending; targeted
ESLint exit 0 on every changed/new file; main, preload and renderer builds exit 0; CSS
containment **6,950 / 6,950 scoped, 0 unscoped**; the harness is absent from `dist`.

Measured for the focus chip at a real 1280 px viewport: chip text **17.77:1**, its clear
button **26 px**, zero overflowing children.

**A tsc trap worth keeping:** writing the panel as
`function Panel({ focus }: Props = {})` makes TypeScript infer its props as bare
`Attributes`, so every `createElement(Panel, { focus })` fails with an unhelpful "No
overload matches this call". Make the props optional; never default the whole object.

## `startAtSec` MOVES A REAL VIDEO — proven live 2026-07-30

Evidence: `docs/migration/proof/startatsec-20260730/`.

The one thing this slice had never done. Driven entirely through the app's own debug bridge
(no mouse or keyboard control), against the isolated G-PLAY fixture profile, with the real
`<userData>/seanime` never touched.

**The discriminator was free.** The resume store already held `positionSec 3.566411` for
that exact file from the G-PLAY run, so "startAtSec was honoured" and "the stored resume was
honoured" predicted different landings. Three runs, two distinct supplied values, each
landing on the supplied value to within 15 ms and each overriding a *different* stored
resume:

```
startAtSec 12.5 (store 3.566)  →  play 12.5 · seeking 12.5 · seeked 12.515
startAtSec 25.0 (store 22.2 )  →  play 25.0 · seeking 25.0 · seeked 25.006
startAtSec 12.5 (repeat)       →  play 12.5 · seeking 12.5 · seeked 12.500
```

Captured from a capture-phase media-event listener, not by polling.

**One open question found here, deliberately not over-diagnosed.** Reopening the *same
already-active* file with **no** `startAtSec` did **not** apply the stored resume — it
restarted at 0 and played forward. That is not a measurement error (the store was planted
with `8.8` under the exact key the app itself writes, and re-read immediately before
dispatch to rule out the `ResumeTracker` overwriting it) and it is **not a regression from
this slice** (the no-`startAtSec` path is byte-identical to before). Resume is also known to
work on a *cold* mount — `proof/gplay-20260730` recorded `play t=6 → seeking t=6 → seeked
t=6` after a real app restart. So the failing case is specifically a reopen while the player
is already active. Recorded as **measured but unexplained**; concluding "resume is broken"
from one probe is the exact error this track has made before.

**Two environment findings worth more than the gate:**

1. **The sidecar port is ephemeral *and* the renderer's connection can be stale against
   it.** A first attempt gave a permanently idle player — `WebsocketSender … socket state:
   null`, with `seanimeConnection()` reporting port 50916 while `seanimeStatus()` reported
   60938. The sequence that works: start the sidecar → reload the renderer → re-read
   **both** and require them to **agree** → only then dispatch the open. Do not trust
   either alone.
2. **The bridge's `/eval` takes its code in a field named `js`, not `code`** — a wrong name
   returns `{ok:false, error:'missing js'}`, which reads like a bridge fault rather than a
   caller mistake. And **`/screenshot` writes a PNG to `debug/shots/` and returns
   `{ok, path, size}` as JSON**; piping its body to a `.png` yields a 137-byte JSON file.

## Slice 7 — "Continue watching": the loop's entry point — LANDED 2026-07-31

Slice 6 closed the return leg. The loop was then complete but **sealed**: every way into it
went through the media workspace's full-screen launcher, and once there you still had to find
the file again in a library grid. Meanwhile `StudyPlayerSlice` had been recording where you
stopped in every file you ever watched (`jp-video-core-resume-v1`), and **nothing outside the
player had ever read that store back**.

Slice 7 is the join that makes it usable somewhere else, plus the surfaces that use it.

- `shared/seanimeContinueWatching.ts` — pure model, 20 tests.
- `renderer/continueWatchingStore.ts` — the one renderer-side reader of both `localStorage`
  stores. Two readers would be two chances to disagree about which files are resumable, on
  the same screen.
- `renderer/widgets/continueWatching.tsx` + a registry entry — a Study-category desktop
  widget, 12 render tests.
- `renderer/components/CommandPalette.tsx` — a **Continue watching** group in search mode,
  8 tests (which also cover the store).
- `media/MediaWorkspaceHost.tsx` — `STUDY_REVIEW_FOCUS_EVENT` now also **opens** the host.
- `renderer/__devharness__/continue-watching-harness.html` + `continueWatchingHarness.tsx`.

### It is the first thing in this track to join the two resume stores

Study OS's legacy Media Center writes `MediaItem.positionSec` / `lastPlayedAt`; VideoCore
writes its own entries under a different key. Two players, two positions for the same file,
and no surface had ever had to reconcile them. **The newer write wins** — preferring one
player unconditionally would silently discard the session the user just finished — and a
library position with no `lastPlayedAt` timestamps as `0`, so a real VideoCore write always
outranks an undated one.

### Five rules, each with an obvious wrong alternative

1. **Only `file:` resume keys become rows.** `videoCoreResumeKey` also mints `media:`,
   `stream:` and `playback:`, and a `playback:` id is minted fresh on every open — the same
   refusal `watchLoopSourceKey` makes. More decisively, the only way to reopen a local file is
   `MediaWorkspaceOpenRequest.localFilePath`, so a row from any other key would render a
   control that cannot work. Excluded, **not** rendered disabled.
2. **Two stores, newest write wins** — above.
3. **A percentage is only reported when a duration was measured.** The resume store holds
   `positionSec` and nothing else; `MediaItem.durationSec` exists only when Study OS probed
   the file. So the progress bar renders only where a real denominator exists, and everywhere
   else the row states the timestamp, which is a fact. Inventing a denominator to fill the bar
   is the 1×1-GIF shape in miniature.
4. **"Finished" needs a duration to be knowable.** With one, a file within 30 s of its end is
   dropped — offering to "continue" the credits is worse than an empty list. Without one, no
   claim is made and the row stays; that is not a gap, because `StudyPlayerSlice` already
   clears its resume entry near EOF, so VideoCore-sourced rows are unfinished by construction.
5. **Card counts come from provenance, never from Anki.** `seanimeWatchLoopByEntry` rolls
   mining history up onto the same `pathKey`, so a row says what watching it already produced
   without asking Anki anything. Partly cost — a per-tick interval snapshot over a real
   collection is far too expensive for a widget on a 30 s timer — but the deciding reason is
   slice 6's: with Anki unreachable every Anki-derived number becomes a confident zero.
   Maturity and "needs a look" stay in the Review panel, where Anki can be asked properly.

### Three connections, and the honesty rule each one needed

- **Widget row → the player.** Raises `MEDIA_WORKSPACE_OPEN_EVENT` with an **explicit**
  `startAtSec` (position minus a 5 s rewind for context). Explicit rather than relying on the
  player's stored resume, so this path does not depend on the reopen-while-active resume
  behaviour still recorded as measured-but-unexplained.
- **Widget card pill → the Review panel.** Raises `STUDY_REVIEW_FOCUS_EVENT` with the join
  key. That event previously only ever came from a readiness row inside an already-open
  workspace, so the host never had to open itself; from the desktop it would have set a view
  behind a launcher the user is still looking at. `MediaWorkspaceHost` now opens too, pinned
  by a test **verified to fail on the pre-fix structure**.
- **Command palette → the player.** Type part of a title in search mode, press Enter, resume.
  The palette builds its list in the tick it opens and has no budget to `await
  seanimeStatus()`, so it asks the DOM instead: `mediaWorkspaceHostIsMounted()` looks for
  `.seanime-host-launcher, .seanime-host`. **Presence of the listener established by presence
  of the thing that owns it** — with the flag off the host renders nothing, and offering the
  command would be a control that silently does nothing.

### The harness found a real defect, and one false positive

Row height was estimated at 46px. Measured at a real 1280px viewport in `WidgetFrame`'s own
chrome, a row with a progress bar is **55px** — and `.wgt-cw-list` clips rather than scrolls,
so the first cut **cut 51px off the default frame and 32px off the minimum**, where the single
visible row was more than half gone. Fixed by measuring instead of estimating: `ROW_PX = 55`,
`ROW_GAP_PX = 6`, `BODY_PADDING_PX = 20` (`WidgetFrame` passes `widget.h - 30` for its title
bar but **not** `.widget-body`'s own `10px 12px` padding), and the registry's two sizes derived
from those rather than chosen by eye — 250 fits three rows, 130 fits one.

The truncation line needed a **second pass**: it only exists if there is truncation, and it
takes height from the very list that decides whether there is any. Reserving it
unconditionally loses a row on every frame that fits exactly, so the count is computed once,
then recomputed with the line reserved only when it will actually show. Pinned by two tests,
including one at a height that fits exactly three rows with nothing hidden.

**The false positive, recorded so it is not "fixed":** `.wgt-cw-title` reports
`scrollWidth > clientWidth` by 17px on a long title. That is the ellipsis working
(`white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`), not an overflow.

**Measured at a real 1280px viewport** (`document.documentElement.clientWidth` re-read inside
the same probe — the `resize_window` preset trap from slice 6): zero list clipping and zero
body overflow at all three frame sizes across `populated`, `empty`, `server-off`, `long` and
`mixed`; contrast 13.82:1 (title), 5.35:1 (meta), 6.18:1 (truncation line); the card pill
30 × 55 with a 26px floor; zero console errors.

### Known cosmetic limit, stated rather than fixed

A file watched but never imported into Study OS and never mined shows a **lower-cased** file
name, because the only record of it is the resume key and `videoCoreResumeKey` lower-cases its
path. It opens correctly (Windows is case-insensitive); only the label is affected. Fixing it
would mean adding the original path to a persisted store the player owns, which is outside
this slice's bounds.

### Not done

**No live look.** The Forge dev server was up for the whole session, so no build could be run
(`vite build` into a Forge-locked `dist/` dies with `EBUSY`), and putting the widget on the
user's real desktop would have mutated their persisted layout while they were using the app.
The component is proven in the harness against the real stylesheet and in jsdom against the
real event contracts; the registry entry itself is one line.

## Slice 8 — "Watching counts": the media half joins the study ledger — LANDED 2026-07-31

Slices 6 and 7 closed the loop and opened its entrance. This one connects the whole of it
to the app that was already here.

Every "did you study today?" surface in Study OS reads one store — `renderer/stats.ts` —
and until now only the two **readers** ever wrote to it. So an evening spent mining an
episode in the adopted player produced a **0-day streak, an empty heat-map cell and
"read today: 0s"**. The app's own judgement of the user's day was blind to the entire half
of it this migration exists to build.

- `shared/seanimeWatchTime.ts` — pure accumulator, 20 tests. Turns a video element's clock
  into seconds that may be *claimed*.
- `renderer/stats.ts` — a second channel: `DayEntry.watchSeconds`, a `shows` tally, and
  `recordWatching`.
- `media/StudyPlayerSlice.tsx` — `ResumeTracker` now feeds it, from the same four listeners
  it already had on the same element.
- `renderer/widgets/study.tsx` — `TodayStudyTime` becomes a two-channel split, 8 tests.
- `renderer/widgets/more.tsx` — `LearningHeatmap` counts both.
- `renderer/components/stats/StatsContent.tsx` — three watch cards, a stacked 14-day chart,
  and a **By show** list whose rows resume the file, 4 tests.
- `renderer/__devharness__/study-ledger-harness.html` + `studyLedgerHarness.tsx`.

### The load-bearing refusal: a second channel, not a bigger number

Watch seconds are **never** folded into `DayEntry.seconds`. That is the one-line change
this slice could have been, and it would have made five existing surfaces lie in unison:
`StatsCards` says "read today", both study widgets say "read", and the status bar agrees.
A new field with a new label leaves every one of them true.

What the two channels *do* share is **the definition of an active day**: `computeStreak`
and `daysActive` count a day on which either happened. That is the whole reason to record
watch time at all, and it is also a real behaviour change to a number other tracks read.

### Five rules for what may be claimed, each with an obvious wrong alternative

1. **Wall-clock while playing, not media time.** The ledger's unit is *time spent* —
   `recordReading` flushes seconds the reader was open. Media time would credit a 2×
   rewatch with an hour nobody spent, and would credit the app's own line-loop with nothing.
2. **Both ends of an interval must be playing.** A pause inside an interval makes the
   playing fraction unknowable; crediting half of it is an invented number. `timeupdate`
   fires ~4×/s, so the discarded fragment is a fraction of a second. The deliberate
   consequence: **auto-pause, shadowing and dictionary time are not counted.** That
   under-states a study session, which is the direction to err in — the alternative grows
   while the user is asleep with a paused window.
3. **An interval is capped, not trusted** (`WATCH_TIME_MAX_INTERVAL_SEC = 10`). A suspended
   machine resumes with a `Date.now()` delta of hours across which nothing played.
4. **A frozen clock earns nothing.** Buffering fires `timeupdate` with an unmoved
   `currentTime`; ≥2 s with no movement is a stall.
5. **Going backwards is not cheating.** Clamping credit to forward progress is the obvious
   anti-fraud reflex and it would zero out *replay line*, the most common action in this
   player. Only elapsed time is counted, so direction never enters it.

`watchTimeStop` exists for `pause`/`ended` specifically: the event **is** the transition,
so the interval ending at it was playing for all of it, and saying so is a fact rather than
the guess rule 2 refuses to make. Without it every pause silently loses up to a `timeupdate`.

### The connections, and the honesty rule each one needed

- **Player → ledger.** `showId` is `videoCoreResumeKey`, the join key every Phase 6 surface
  already shares — so a show's tally lines up with its continue-watching row, its readiness
  row and its mined cards instead of being a fourth identity for the same file.
- **Ledger → Today's study time.** Headline is the sum, which is what the widget's label has
  always promised; the split bar is what keeps the sum honest rather than a merge. A channel
  with no time gets **no segment and no legend entry** — and a reading-only day keeps the
  character line and looks exactly as it did before this slice.
- **Ledger → heat-map and streak.** Both were already named for learning rather than
  reading; both were simply wrong.
- **Ledger → Statistics.** Three watch cards, rendered **only once anything has been
  watched** — a permanent `0s / 0s / 0` row is noise, and the grid is three columns wide so
  the channel fills a whole row or takes none.
- **Statistics → back into the player.** A "By show" row is a real `<button>` that resumes
  the file. Gated exactly like slice 7's palette group: `mediaWorkspaceHostIsMounted()`,
  and only `file:` keys, because `localFilePath` is the only way in. **`MediaWorkspaceHost`
  is mounted at the *App* level** (`App.tsx:593`), which is what makes this reachable from a
  view that is nowhere near the media surface — worth knowing for any future connection.
  A row with no stored position **opens without a `startAtSec`** rather than fabricating one.

### The harness found three real defects, and confirmed one deliberate limit

1. **The split bar collapsed to 0px.** `.wgt` is a flex column, so with the default
   `flex-shrink: 1` the 6px bar was the item that gave way at the registry minimum —
   measured at exactly **0**. The one element carrying the data was the first thing to
   disappear, and it clipped nothing on the way out, so nothing looked broken.
   `flex-shrink: 0`.
2. **The full split layout does not fit the registry minimum.** Measured: 34px value + 16px
   label + 6px bar + a legend that **wraps to two lines at 160px wide** = 108px content in a
   78px box. Fixed by deriving a compact layout from the measurement rather than inflating
   the widget: below 113px of content height *or* 200px of width the legend drops to
   durations-only and gives up the label, keeping the words in a `title`. The alternative
   was raising `minSize.h` to 160 — the default height — and a widget that cannot be made
   small is not a small widget.
3. **The stacked chart's peak column overflowed its own track by 2px.** Two percentages
   summing to 100% plus a `gap: 2px` is 102%, and `overflow: hidden` ate the top of it, so
   the tallest bar in the chart was the one telling the smallest truth. The separator is now
   a `border-bottom: 2px solid transparent` with `background-clip: padding-box` on the upper
   segment — it *pays for* the gap out of its own height, exactly, and shows whatever the
   theme made the chart background. Re-measured: peak stack **97.0px in a 97px track**.

**The deliberate limit, measured rather than assumed:** the read and watch fills are
`#ff6b81` and `#4aa8dd`, which contrast **1.03:1 against each other** — near-identical
luminance, distinguishable by hue only. That is why every surface that stacks or abuts them
also carries a separator and a named legend, and why the pair is red/blue (the safest
dichromacy pair) rather than red/amber. Each fill is 6.4:1 and 6.62:1 against its own track,
well past the 3:1 non-text threshold; all new text is ≥5.35:1.

**A real defect fixed in passing:** `resetStats()` was `localStorage.removeItem(KEY)` against
a `KEY` that does not exist in the module — a `ReferenceError` swallowed by its own `catch`,
so the Statistics tab's Reset button had been a **silent no-op**. It also predates the
per-study-language split, so even the legacy name would have cleared the wrong key. This is
one of the 288 `tsc` diagnostics; the baseline is now **287**.

### Gates after slice 8 (2026-07-31)

Tests **3,501 / 312 files**; `tsc` **287** — one *below* the 288 baseline, 0 in any changed
file; i18n exit 0 at **6,155** keys (EN/JA/ZH/RU); architecture audit exit 0 "nothing new";
ESLint exit 0 on every changed file (2 pre-existing warnings in untouched lines).

**Builds and the CSS containment check were NOT run** — the Forge dev server was up for the
whole session and `vite build` into a locked `dist/` dies with `EBUSY`. This slice adds no
rules to `mediaWorkspace.css`; its CSS is in `renderer/styles.css`, the shell sheet, so it
cannot affect containment. Totals include concurrent work from other tracks in this shared
tree; this slice's own contribution is +41 tests / +4 files and +16 i18n keys.

### Not done

**No live look, and no screenshot.** The Browser pane cannot composite while hidden, so the
harness evidence is geometry, computed styles and measured contrast rather than an image.
The watch-time producer itself has never run against a real video: it is proven in jsdom
against the real event contracts and in the harness against the real stylesheet, but nobody
has yet watched an episode and seen the streak move. That is one bridge-driven session, and
it is the obvious opening for the live pass below.

## The live pass — DONE 2026-07-31

Evidence: `docs/migration/proof/phase6-live-20260731/`. Every surface from slices 2–8
driven in the real app through the debug bridge, real sidecar, real library file, Anki
deliberately down.

**Watch time is real, and measured rather than asserted.** An in-page timed run (shell-side
sleeps were too coarse to judge a wall-clock claim) gave **20.002 s wall clock → 20.000 s
claimed → 20.000 s ledger delta**, media advancing 19.996 s. Rule 1 holds to 2 ms. Across
the session 115.55 s of genuine playback produced a `2026-07-31` entry with `watchSeconds`
and `seconds: 0`, a `shows` tally keyed by `videoCoreResumeKey`, three watch cards that
appeared only because something was watched, `0s READ TODAY` beside `1m WATCHED TODAY`, and
**DAY STREAK 1 → 2**. The load-bearing refusal survived contact with the real app: nothing
merged the two channels on any surface.

Also confirmed live: the dock's own `Previous line` seeked 30.386 → 2.673 and the interval
was still credited (rule 5); the By-show row is a real button named
`Resume Sousou no Frieren — 1` that **omitted `startAtSec`** because the store had genuinely
cleared at EOF (rule from slice 8, exercised by accident); the palette group ranked first
and its lower-cased fallback path — which `seanimeContinueWatching.ts:88` only *claimed*
was "fine to open on Windows" — really does open against the real sidecar; and the widget's
second row came from the **legacy Media Center store**, so the two-store reconciliation
works on real user data rather than fixtures.

### The pass found one high-severity defect, now fixed

**The whole workspace header was unclickable while a player was active** — Close, the
segmented switch and Open local video all silently did nothing. `.seanime-host-bar` was
`position: static / z-index: auto` against a `position: fixed; z-index: 80`
`.study-player-slice` in the same stacking context, so it could not win at any z-index; the
element swallowing the clicks is the adopted player's
`[data-vc-element="top-playback-info"]`, **a caption strip with zero buttons of its own**.
Combined with `MediaWorkspaceHost.tsx:153` refusing Escape while a player is active and
VideoCore's native bar sitting below the fold in this seam, there was **no in-app way out of
the workspace**. Fixed with `position: relative; z-index: 100` on the bar — host chrome must
outrank the player it contains — and verified with a real click.

And a smaller one: `studyLibrary.health` rendered **"1 files · 1 need work"** against the
real one-file library. One key cannot carry three independently-inflecting counts because
the plural machinery selects on a single `count`; it is now three plural keys joined at the
call site, with full Russian `one/few/many/other` (the catalog-hygiene test rejects an
`other`-only cut).

### Left open on purpose

- **The command palette renders behind the media workspace** (`.palette` 1201 vs
  `.seanime-host` 9999, opaque): it mounts, takes focus and eats keystrokes while invisible.
  Not fixed — shell-wide layering is broader than this seam.
- ~~**The no-client watchdog + stale-token trap now blocks slice 7's own entry path.** Every
  workspace close kills the sidecar and the renderer keeps the old port/token, so the next
  outside-in entry lands on a dead player until a reload. Seen three times
  (51812 → 64510 → 61480).~~ — **CLOSED 2026-07-31**, see "The sidecar keepalive" below.
- **Two surfaces name the same file differently**, because it is `unlinked`; a future slice
  could prefer the stats `shows` title over the basename.

### Not covered by the live pass

The stacked two-channel column (no day has both channels yet, so every column drew one
segment — the 2px-overflow fix stays harness-only evidence); the widget at its 240×130
registry minimum (a CSS-only resize would not move the React prop the compact layout derives
from); and the per-row mining rollup beyond its zero state (Anki down, history empty).

## The sidecar keepalive — the restart trap is CLOSED, 2026-07-31

Evidence: `docs/migration/proof/sidecar-keepalive-20260731/keepalive-holds-the-sidecar.json`.
Reproduce: `node docs/migration/tools/sidecar-keepalive-harness.mjs`.
Full write-up at the top of `docs/migration/NEXT_SESSION.md`.

The live pass called this the highest-value defect in the track, precisely because slice 7
exists to enter the player from *outside* the workspace. `--desktop-sidecar` arms Seanime's
dead-man switch, which exits the server 10s after the **last** websocket client drops — and
this app's only client lived inside `MediaWorkspace`, a transient overlay. So closing the
workspace killed a media server the app still owned.

`src/main/seanime/keepalive.ts` holds one websocket from the **supervisor**, whose lifetime
*is* the app's — which is the lifetime the switch was written to track. Started at `ready`,
released in `stopSeanime()` and on an unexpected child exit.

Measured against the real `seanime.exe` in three phases: a **control** that reproduces the
death (14,268 ms, code 1, with the server's own countdown captured), the **fix** (alive at
25,000 ms with the keepalive still connected, and the server logging
`study-os-supervisor` and `harness-workspace` as two separate clients), and a **release**
phase proving `keepalive.stop()` still lets the switch finish (13,749 ms, code 1) — which
is why the flag is kept rather than dropped. Dropping it fixes the bug in one line and
silently surrenders orphan protection on a SIGKILLed main process, which now matters
because the datadir is durable.

The rules, and the one measurement that corrected a comment: the client id must be distinct
(`RemoveConn` deletes the first match, so a shared id would evict the renderer's own
connection); retries are unbounded while started, capped at 3s under the 10s window; and
`stop()` must release the **generation** before closing the socket — mutating the
clear/close lines into either order still passes, while releasing the generation last fails
two tests, so that is the invariant worth pinning, not the ordering originally claimed.

## The keepalive, inside a real Electron app — CLOSED 2026-07-31

Evidence: `docs/migration/proof/sidecar-keepalive-electron-20260731093934/keepalive-inside-electron.json`.
Reproduce: `node docs/migration/tools/keepalive-electron-harness.mjs`.

The previous section proved `keepalive.ts` against the real `seanime.exe`, but the harness
supplied its own sockets and its own lifecycle — **the supervisor wiring was covered only
by tests that read `supervisor.ts` and assert its three call sites.** That gap is now
closed against the real app, doing the real thing the fix exists for: opening the media
workspace, closing it, and waiting past the dead-man switch's window.

The run is fully isolated — its own `--user-data-dir` and its own `SEANIME_DATADIR` — so a
developer instance and `%APPDATA%/jp-study-app` are untouched, and the isolated userData is
also what side-steps `requestSingleInstanceLock()`. It attaches over
`--remote-debugging-port` rather than the debug bridge, because `debugBridge.ts` hardcodes
39273 and a developer's instance is normally holding it. No synthetic mouse or keyboard
input; the workspace is opened by raising the app's own event and closed by clicking its
own Close button.

One timeline, from the server's own connection log:

```text
12:39:39  ws > Monitoring connection as desktop sidecar      <- switch armed
12:39:44  ws > Client connected id=study-os-supervisor       <- the keepalive
12:39:45  ws > Client connected id=a1415298-…  (x2, StrictMode)  <- the renderer
12:39:52  ws > Client disconnected id=a1415298-…             <- the workspace CLOSED
          … 35,010 ms with only the keepalive connected …
          no countdown line, no exit; pid 11924 and port 63842 unchanged
```

| phase | what | result |
| --- | --- | --- |
| A ready | sidecar up, both clients connected | pid 11924, port 63842 |
| B close | workspace closed, server logs the renderer dropping | client drop confirmed |
| C hold | 35,010 ms with no workspace | **alive, listening, same pid and port** |
| D reopen | slice 7's real entry path | **same pid, same port** |
| E quit | `will-quit` → `stopSeanime()` | **no orphan** |

D is the phase that matters for this track: an unchanged pid and port means the renderer's
stale-token failure mode cannot arise at all, which is what used to produce
`Unrecoverable HLS error` at `readyState 0`.

### The harness had to be made honest twice — do not remove either guard

1. **A dispatch before React mounts is silently lost.** A CDP page target exists as soon as
   the document does, long before `MediaWorkspaceHost` registers its
   `seanime:media-workspace-open` listener in an effect. The first run sat at `stopped` for
   the full three-minute timeout. The harness now waits for `.seanime-host-launcher` — the
   same "is the listener there?" test `mediaWorkspaceHostIsMounted()` uses.
2. **Waiting a fixed 5 s before closing made the whole proof vacuous.** `MediaWorkspace` is
   a lazy chunk that bootstraps its auth token before `WebsocketProvider` connects, and on a
   *cold* profile that takes longer than the sidecar takes to answer `/status`. A run that
   closed the workspace before that client existed dropped **nothing**, left the keepalive
   as the only connection all along, and still sailed through phase C. It looked like a pass
   for two runs, and only because a reused temp profile carried a client id in its
   localStorage. The renderer's own websocket is now a **precondition**, asserted from the
   server's log, and phase B fails if the close drops no client — or if it drops
   `study-os-supervisor` too, which would mean rule 1's shared-id eviction.

Both are the same lesson this track keeps relearning: a green harness that never exercised
the mechanism is worse than a red one.

~~**Still not exercised:** the crash / dev-panel-restart path.~~ — **CLOSED 2026-07-31 by
the section below.**

## The crash / dev-panel-restart path — CLOSED 2026-07-31

Evidence: `docs/migration/proof/sidecar-restart-20260731100930/crash-and-restart-recovery.json`.
Reproduce: `node docs/migration/tools/sidecar-restart-electron-harness.mjs`.

The last thing the keepalive work owed. The section above proved the fix for the case it was
written for — a workspace close no longer kills a healthy server — and explicitly left this
open: `MediaWorkspaceHost.tsx:64`'s remount logic was *believed* to cover a mid-session death,
but nothing had killed a sidecar and watched the renderer come back. Now something has, twice
per run, by the two routes that actually occur: a **crash** (`taskkill /F` on the child from
outside the app, so the supervisor learns of it through `child.on('exit')`) and a **dev-panel
restart** (`seanimeStop()` then `seanimeStart()` — the panel has no single restart button).

Isolation is the keepalive harness's, for its reasons: own `--user-data-dir`, own
`SEANIME_DATADIR`, CDP rather than the debug bridge. The only process it ever kills is a pid
the isolated instance itself reported.

| phase | what | result |
| --- | --- | --- |
| A crash | child killed from outside | reported **`offline`**, "sidecar exited with code 1" |
| B recover | restarted with **nobody clicking anything** | **1,305 ms**, pid 25552 → 48460 |
| C re-provision | new token, new accepted websocket, gate cleared | all three |
| D keepalive | re-armed on gen 2, then 35,011 ms with the workspace closed | **same pid, still listening** |
| E0 stop-while-open | explicit stop, workspace open | **reversed by the host in 5,720 ms** |
| E restart | stop + start with the workspace closed | gen 3 ready, re-provisioned |
| F orphans | quit after **four** sidecars in one session | **0 survivors** |

`ready → offline → starting → ready` is captured from a listener installed in the page, not
from polling, so no transition is inferred from a gap between samples.

### D is the phase that had never been asked

`startSeanime()` calls `keepalive.start()` on every `ready`, but only the **first** generation
of a session had ever been observed holding a client. If it armed once per session the fix
would protect one sidecar and quietly hand every later one back to the dead-man switch — and a
crash is exactly when a user is most likely to close the workspace next. It does not: all four
generations of a clean run log `Client connected id=study-os-supervisor`, and the restarted
sidecar survives 35 s alone, where the module harness measured an unprotected one exiting after
14,268 ms.

### Three links that are invisible until they break

Each fails as "the player just doesn't work after a crash", with nothing in the console, so
each gets its own assertion rather than being inferred from "it looked fine":

1. **The restart is unattended.** The `[open, status]` effect fires for any kind that is not
   ready/starting/disabled. `starting` is excluded on purpose — two overlapping
   `startSeanime()` calls would race a second server onto one durable datadir's SQLite file.
2. **A changed localStorage token is NOT evidence the adopted client uses it.**
   `atomWithStorage(..., { getOnInit: true })` snapshotted localStorage at module-eval, which
   on a restart happened long ago. The decisive check is server-side: `/events` validates
   `?token=`, so a websocket the *new* server accepted could only have carried the new hash.
3. **A `provisioning` gate that never clears looks exactly like a slow load.** The phase
   requires the library pane back on screen, not merely the absence of an error.

### One new finding: the dev panel's Stop button cannot stop the sidecar

Phase E0. With the media workspace **open**, an explicit `seanimeStop()` is reversed by the
host's own recovery effect within seconds (949 ms and 5,720 ms across runs), with no start call
from the harness. That is not a defect — an open workspace is precisely when the app wants a
media server — but it is undocumented, and it is why the first cut of phase E measured
something other than what it claimed: its "explicit stop, then explicit start" never happened,
because the stop had already been undone. Phase E now runs with the workspace **closed**, where
the status can actually come to rest at `stopped`, and E0 records the open case deliberately.

### The harness lied to me twice — both guards are recorded in it

Same shape as the two the keepalive harness carries, and the same lesson:

1. **Sampling the server log once, immediately after `ready`.** `keepalive.start()` runs *just
   before* `setStatus({ kind: 'ready' })`, so at the instant the renderer learns the sidecar is
   up the socket is still in flight. A single read there reported `keepalive false` for a
   generation whose connect line landed a second later. Now polled by `waitForKeepalive()`.
2. **Reading a log file from a process the harness had just killed.** An earlier cut closed the
   workspace ~1 s after a revival and killed that sidecar seconds later; its log ended
   mid-startup with no client lines at all, which read as "a revived generation never gets a
   keepalive". It does. **Absence of a line in a truncated log is not absence of the event** —
   and `status.logTail` cannot settle it either, because `pushLog` keeps 40 lines and the
   sidecar's startup stdout pushes the `keepalive:` line out every time.

Both are in the record's own `probeCorrections` field.

### The regression guard

`src/renderer/__tests__/mediaWorkspaceHostRecovery.test.ts` — 7 jsdom tests over a real
`createRoot` render, pinning the unattended restart, the `starting` exclusion, the unmount on
leaving `ready`, and the remount-with-a-new-token. The workspace stub numbers its instances
from a `useState` initializer, which runs once per **mount**, and one test is a **control**: a
status push that changes no connection detail must leave the instance number alone. Without it,
"instance became 2" could equally be a component that remounts on every status push, and the
remount assertion would keep passing after the key was broken.

## Slice 9 — one file, one name — LANDED 2026-07-31

The live pass left this open: Statistics called the real library file
`Sousou no Frieren — 1` while the command palette and the Continue Watching widget called
it `sousou no frieren - 01.mkv`. Both were documented fallbacks behaving correctly, which
is what made it worth fixing rather than patching at a call site — **two surfaces of the
same app naming one file differently is the defect, not either name.**

The divergence is exactly an `unlinked` file: no Study OS library item, and no mining
provenance until it has been mined, so `seanimeContinueWatching` fell straight through to
the basename. Statistics had a better name all along, because `ledgerTitleForPlayback`
builds `<userPreferred> — <episode>` from the sidecar's own metadata while recording watch
time, and slice 8 stores it in the `shows` tally under `videoCoreResumeKey`.

- `shared/seanimeContinueWatching.ts` — new optional `ledgerShows` input and **rule 6**.
  The chain is now library → mining → **ledger** → file name.
- `renderer/stats.ts` — `getWatchedShowTitles()`.
- `renderer/continueWatchingStore.ts` — passes it, so both surfaces get it from the one
  reader they already share.

**Three things not to re-derive:**

1. **The ledger's title goes *below* the library and provenance titles, and only above the
   basename.** Those two are the names a user can curate; this one is whatever the media
   server said. Above the basename because anything is.
2. **Rule 1 already owns the key conversion, so it is reused rather than repeated.** The
   ledger keys by `videoCoreResumeKey` and this join keys by `studyLibraryPathKey`; running
   a ledger id through `continueWatchingPathFromKey` means a `media:`/`stream:`/`playback:`
   row produces no path and is skipped, exactly as its resume entry would have been. A
   second conversion here would have been a second chance to disagree.
3. **`getWatchedShowTitles()` exists instead of `getSummary()`.** The palette builds its
   list in the tick it opens; `getSummary()` also walks fourteen days, recomputes the streak
   and sorts the book list. Same read, none of that work.

No UI string was added — the title is study *content* and is never translated
(`CLAUDE.md`'s i18n scope rule), which is why the i18n key count is unchanged and correctly
so.

**Gates (2026-07-31):** tests **3,623 / 317 files** (+2 tests, one rewritten); `tsc` **288**
with **0 in any changed file** — the delta against the 287 recorded that morning is five
diagnostics in `src/shared/toolboxShortcuts.ts` from another track's in-flight work in this
shared tree; i18n exit 0 (unchanged); architecture audit exit 0 "Nothing new"; ESLint exit 0
on every changed file. **Builds not run** — the Forge dev server was up (`EBUSY`), and no
CSS or renderer asset was touched.

**Not done: no live look.** The fix is verified by tests over the exact shapes the live pass
recorded, but nobody has reopened the widget and seen the row rename itself.

## Slice 10 — "one shell layer scale" — LANDED 2026-07-31

Full detail and the probe corrections: `docs/migration/NEXT_SESSION.md`, top section.
Evidence: `docs/migration/proof/shell-layers-20260731172900/palette-reaches-the-workspace.json`.

The last thing the live pass listed as open, and the one it explicitly declined to fix:
`.palette` at 1201 behind `.seanime-host` at 9999, so the command palette **mounted, took
focus and ate keystrokes while completely invisible** whenever the media workspace was up.

Deferring it as a magic-number bump was right. Leaving it open was not, and the reason is
**slice 7**: the palette's Continue-watching group exists precisely so the player can be
entered from somewhere else in the app. The one place it could never be used was the place
you would most want it — already inside the player, wanting the next episode.

- `renderer/theme/tokens.css` — a **shell tier** beside the existing ui/* z-index scale,
  documenting one rule: `view content < a full-screen VIEW < shell-global overlays < OS
  chrome`. A full-screen view sorts below the shell because it is a view; it is merely opaque.
- `renderer/theme/tokens.ts` — `shellZIndex`, mirrored and catalogued like every other tier.
- `renderer/styles.css` — `.palette*`, `.cbh-*`, `.os-toast-host`, `.seanime-host*`,
  `.os-taskbar` and `.lockscreen` now reference the tokens instead of nine independent
  literals.
- `renderer/__tests__/shellLayerScale.test.ts` — 7 tests pinning the values, the ordering
  and the CSS bindings.
- `renderer/__devharness__/shell-layers-harness.html` — real-engine hit testing, with a
  control round that puts the pre-fix values back and reproduces the defect.

**Four things not to re-derive:**

1. **`.os-taskbar`'s 200000 is local.** It sits inside `.os-desktop`, which declares
   `contain: layout paint` and so forms a stacking context. The taskbar has always painted
   below every root-level overlay — before this change and after it. A comment claiming
   otherwise was written, measured, and corrected. `contain` does not show up in a grep for
   `z-index`.
2. **jsdom cannot answer this question.** It has no stacking model and no hit testing, so
   the vitest guard pins numbers and bindings only; "does a click at the palette reach the
   palette" needs a real engine. Both halves of the guard were verified to fail on the
   pre-fix state before being kept.
3. **`.os-toast-host` is `pointer-events: none` by design**, so `elementFromPoint` returns
   what is beneath it. Hit-testing a toast without accounting for that reports a visible
   toast as covered.
4. **The palette floats on video here, not on the desktop.** Muted palette text measures
   **4.34:1** against a white frame through the shipped 88% glass — under AA — and 5.58:1 at
   96%. `#root:has(.seanime-host)` firms the surface up in that context only.

**Gates (2026-07-31):** tests **3,689 / 322 files** (+7, +1 file, all this slice's); `tsc`
**288** with **0 in any changed file**; i18n exit 0 at **6,326** keys, unchanged and
correctly so (CSS and comments, no new UI string); architecture audit exit 0 "Nothing new";
ESLint exit 0 on every changed file. **Builds not run** — dev server up (`EBUSY`); the CSS
is in `renderer/styles.css` and `theme/tokens.css`, not `mediaWorkspace.css`, so slice 5's
containment rule leaves the check unaffected.

**Not settled:** the scale documents nine layers and re-points only the five this defect
touched. `.reading-source-backdrop` (12500) and `.lib-import` (300000/300001) are still
literals chosen by eye, and `.consent` (9000) sits *below* the workspace — safe only because
nothing self-opens the workspace at boot since the mount dispatch was deleted (step 3's
phase B). Those are the next candidates.

## Slice 11 — "resume last episode" as a real command — LANDED 2026-07-31

Full detail: `docs/migration/NEXT_SESSION.md`, top section.
Evidence: `docs/migration/proof/resume-last-20260731174600/resume-last-over-the-workspace.json`.

Slice 10 made the palette reachable over the workspace and that immediately exposed the
next seam: **slice 7's Continue-watching group is `search`-mode only**, while `Ctrl+Space`
— the binding labelled "Open command palette" — opens `commands` mode. The surface slice 10
had just unblocked still could not resume anything.

- `renderer/continueWatchingStore.ts` — `resumeMostRecentWatched()`, beside the reader the
  widget and the palette group already share.
- `renderer/keyboardShortcuts.ts` — `video.resumeLast` in `COMMAND_CATALOG` **and** in
  `builtinHandler`, so it is live with no view registered.
- Four catalogs — the command label plus two toast messages.
- `renderer/__tests__/resumeLastCommand.test.ts` — 7 tests.
- `renderer/__devharness__/resume-last-harness.html` — the chain end to end in a real engine.

**Four things not to re-derive:**

1. **One command, not a second copy of the list.** Forty titles belong in `search`;
   `commands` mode is for actions, and "resume the newest one" is the action.
2. **It is a built-in.** Its `video.*` neighbours are registered by the legacy video view
   and read "needs view" until that view is open — and the media workspace is exactly where
   that view is not mounted.
3. **`defaultKeys: ''`.** Every free single letter belongs to the adopted player's keymap,
   whose handler is on `document` with no capture, so a default chord would fire both.
4. **It returns an outcome, not a boolean.** `no-workspace` and `nothing-watched` look
   identical from outside — nothing happens — and this seam has produced a silent no-op
   three separate times. The toast that distinguishes them is only visible over the
   workspace because of slice 10. *(Slice 14 renamed `no-workspace` to `no-host` and split
   the sidecar half out of it; the outcome had been describing two different things.)*

**Gates (2026-07-31):** tests **3,696 / 323 files** (+7, +1 file); `tsc` **288** with **0 in
any changed file** including the new `.tsx` harness; i18n exit 0 at **6,329** keys (+3,
translated in ja/zh/ru); architecture audit exit 0 "Nothing new"; ESLint exit 0 on every
changed file. **Builds not run** — dev server up (`EBUSY`); no CSS touched.

## Slice 12 — the default-on flip shipped a debug panel — LANDED 2026-07-31

Full detail: `docs/migration/NEXT_SESSION.md`, top section.
Evidence: `docs/migration/proof/dev-panel-gate-20260731175500/debug-panel-off-the-desktop.json`.

`SeanimeDevPanel` — header: *"Phase 1 dev-only proof surface. THROWAWAY … a normal build
never shows it"* — gated on `status.kind === 'disabled'`, which is **exactly the status the
morning's default-on flip removed**. A 460px monospace console with Start / Stop / Probe
buttons, fixed bottom-right at z-index 99,999, had been part of the product since.

**The reusable lesson is not the panel.** Nothing failed and neither change was wrong: a flag
flip's blast radius is *every file that gates on the value it changed*, and the claim that
would have caught it was a sentence in a comment. **Grep for the value, not for the flag.**
That sweep was then run — every other `kind === 'disabled'` site is shipped chrome that is
supposed to appear once the sidecar is on, so the blast radius was one file.

**Three things not to re-derive:**

1. **`import.meta.env.DEV` is the wrong tool in this repo.** No `vite-env.d.ts` and a `module`
   setting that rejects `import.meta`, so each use adds two permanent `tsc` diagnostics and
   the root tsconfig is off limits. An early cut took `tsc` 288 → 312, all 24 mine.
   `isDevServerRuntime()` asks how the app is *running*, and a packaged build here serves
   `app://bundle/index.html`, never http.
2. **`bottom: 190px` on the launcher was a dependency on an invisible thing.** It is now
   `calc(var(--taskbar-h, 48px) + 12px)`, which tracks Aero (34/30/40px), Wired (52px) and
   the size preference; the old offset returns only under `html[data-seanime-dev-panel]`.
3. **A type predicate, not a boolean.** `devPanelIsVisible(...): status is SeanimeStatus`
   keeps the visibility rule and the null-narrowing as one decision; a plain boolean left 18
   `'status' is possibly null` diagnostics in the body it guards.

**Gates (2026-07-31):** tests **3,705 / 324** (+9, +1 file); `tsc` **288** with **0 in any
changed file**; i18n exit 0 at **6,329** keys, unchanged and correctly so (ADR-003: this
panel is not shipped chrome); architecture audit exit 0 "Nothing new"; ESLint exit 0.
**Builds not run** — dev server up (`EBUSY`).

## Slice 13 — the consent gate outranks the shell overlays — LANDED 2026-07-31

Full detail: `docs/migration/NEXT_SESSION.md`, top section.
Evidence: `docs/migration/proof/consent-gate-20260731180200/consent-outranks-the-shell-overlays.json`.

**A regression slice 10 introduced, caught by extending slice 10's own harness.** Raising
`.palette` 1201 → 20001 and `.os-toast-host` 5000 → 30000 moved both past `.consent` (9000),
so `Ctrl+Space` on a cold profile put a working command palette over an unanswered
first-launch gate — with slice 11's `video.resumeLast` inside it.

Fixed with a `--z-shell-blocking: 40000` tier between feedback and lock. **An overlay is
something you reach FOR; a blocking gate is the one thing you may not reach PAST.**

**The lesson:** a layering change is not done when the thing you were fixing works. Raising a
layer moves it past *everything* between its old and new value, and the ones that matter are
the layers you were not thinking about. 1201 → 20001 crossed `.consent` (9000),
`.reading-source-backdrop` (12500) and `.widget-gallery` (901) on the way.

**Gates (2026-07-31):** tests **3,706 / 324** (+1); `tsc` **288**, 0 in any changed file;
i18n exit 0 at **6,329** keys and unchanged; architecture audit exit 0; ESLint exit 0.
**Builds not run** — dev server up (`EBUSY`).

## Slice 14 — a shell without a host is not a sidecar that is off — LANDED 2026-07-31

Evidence: `docs/migration/proof/shell-handoff-20260731183500/resume-reaches-every-shell.json`.

Slice 11 made `video.resumeLast` a **built-in** so it would work from anywhere, which means
it is offered in every shell that mounts `CommandPalette`. Only some of those mount
`MediaWorkspaceHost` — not the reader, not any pop-out but `video`. The app's one test for
"can I hand a file to the player?" was `mediaWorkspaceHostIsMounted()`, a DOM query for
`.seanime-host-launcher`, which actually answers *"is a host mounted **and** has a
non-disabled status arrived?"*. Measured before the fix, with the sidecar at `ready`:

```text
{ sidecar: 'ready', hostMounted: false,
  toasts: ['The media server is off, so there is nothing to resume into.'] }
```

**A missing host is a fact about the window; a disabled sidecar is a fact about the
machine.** One test answered both, with the wrong one — and false by default since slice 12.

Presence is now published by the host itself, from **inside the effect that owns the window
listeners**, so it is the listener's lifetime rather than a picture of it — true a full
commit before `status` arrives and the launcher renders. The DOM marker is kept where it
answers the right question: the palette's search-mode group and Statistics' By-show rows
decide whether to *offer a list*, in the tick they render, and with the sidecar disabled
those rows would open a player the user never sees.

Three true statements replace one guess, the sidecar one coming from **main** on the failure
path only (a new non-hook `mediaWorkspaceIsAvailable()` the existing hook is now written in
terms of). The shell answer **never asks main**: it is knowable without the sidecar, and
asking anyway would let an IPC failure re-word a shell fact as a sidecar fact.

`renderer/readerResumeHandoff.ts` then makes it *work* from a book — availability checked
**before** the close so a disabled sidecar never costs the user their reader, and the resume
run from the **effect body** so it lands after the commit that mounts the host.

**A second instance, found by sweeping:** a `player` pop-out routes to the workspace but
`App` mounted the host only for `popout === 'video'`. Three places encoded that list and one
was stale; now `MEDIA_WORKSPACE_SECTIONS` / `sectionOpensMediaWorkspace()`. **A pop-out is a
separate renderer with its own `App` tree**, so "the host is mounted" is per-window.

**The lesson, third time in four slices:** a change's blast radius is every place that gates
on the **value** it changed, not every place that mentions the thing.

**Gates (2026-07-31):** tests **3,719 / 326** (+13, +2 files); `tsc` **288**, 0 in any
changed file; i18n exit 0 at **6,330** keys (+1, translated); architecture audit exit 0;
ESLint exit 0. **Builds not run** — dev server up (`EBUSY`); no CSS touched.

**Next candidate, same class:** `ResultPanels.tsx:235` reaches `openMediaWorkspace()` and
`scraper` is a pop-out section with no host.

## Slice 15 — the analyse row action — LANDED 2026-08-01

Evidence: `docs/migration/proof/analyse-action-20260801153334/analyse-action.json`.
Reproduce with `npx vite --config vite.renderer.config.ts --port 5174` then
`node docs/migration/tools/analyse-action-measure.mjs`. **Three scenarios PASS**, each a real
`MouseEvent` in a real Chromium.

**Item 1 below was half stale.** "Nothing analyse-shaped is exposed in `preload.ts` at all"
was re-grepped and is false: **`preload.ts:1275` exposes `studyPrepare`**, and
`renderer/mediaStudyOrchestrator.ts:255` exposes `prepareStudyMediaById(mediaId,
subtitleRecordId)` — whose two ids the entry already carries, so the adapter is an
assignment. *A verified reason has a shelf life.*

What survives is the other half: the `study:prepare` **handler** lives in the untracked
`main/mediaStudyOrchestrator.ts`, so the main-side bar is unmet and importing it would break
the standing cross-track rule. So the capability is **offered, not reached for** —
`onAnalyse` is an injected optional prop, exactly as `orchestrator` has been since slice 2,
and the panel gains **no new import**. Offered on `unanalyzed` and `stale` only (`stale`
reads **Re-analyse**). `queued-transcription` is reported as its own outcome, never as
"analysed". The row deliberately does **not** transition — readiness lives in the injected
document this surface does not own, and pretending otherwise would have the row lie.

**Production wiring is one prop** in `MediaWorkspaceHost.tsx:339` the moment that track
commits — the same call site that mounts this panel with no props today, which is why
`ready`/`stale` are already unreachable in the real app.

**Gates (2026-08-01):** vitest **333 / 3,834** (+7, mutation-tested — 4 mutants, all caught);
`tsc` **288**, 0 in any changed file; ESLint 0; architecture audit exit 0; i18n exit 0 at
**6,358** keys (+6, translated).

## Next slice

1. ~~**The analyse row action** — still **no committed API**: nothing analyse-shaped is
   exposed in `preload.ts` at all.~~ — **LANDED 2026-08-01, see slice 15 above.** The
   premise was stale; `studyPrepare` has been in `preload.ts` all along. What remains is
   supplying the action in production, which is one prop once
   `main/mediaStudyOrchestrator.ts` is committed by its owning track.
2. ~~**Old-player retirement** is independent and still opens with its one never-proven step:
   launch the **packaged** app once with `SEANIME_SIDECAR` on and watch the sidecar reach
   `ready`.~~ — **BOTH CLOSED 2026-07-31.** The packaged start was proven
   (`proof/packaged-sidecar-launch-20260731102252/`, and it needed neither a rebuild nor a
   manual launch), and **the flag is now on by default** — a normal run comes up `stopped`
   with the launcher in the DOM, and `SEANIME_SIDECAR=0` is the exercised rollback
   (`proof/sidecar-default-on-20260731114100/`). See `docs/migration/NEXT_SESSION.md`, top
   section.

   What retirement has left is **only the legacy player removal**, now scoped there: the
   target is `components/media/MediaContent.tsx` (2,982 lines) with four importers, and
   `shared/mediaProviders.ts`'s `MediaContentType` is an **unrelated union sharing the
   name** that must not be removed with it. The study-mode track's step 1 is unblocked by
   the flip and its steps 3–4 sit behind that one, so coordinate before starting.
3. ~~**The crash / dev-panel-restart path has still never been driven.**~~ — **CLOSED
   2026-07-31**; it got its own harness rather than a sixth phase on the keepalive one, since
   it needs four sidecar generations and its own status-transition recorder. See "The crash /
   dev-panel-restart path". The one thing it surfaced and did **not** fix is that the dev
   panel's Stop button is inert while the media workspace is open — recorded, not decided.
