# The Files app — plan

Opened 2026-08-16 on a direct user request, superseding the catalogue half of
`MINING_UNIFICATION_PLAN.md` (which stays as the plan for the four miners and the
YouTube/dub gaps). Everything under "Grounding" was re-derived from source, with line
evidence, on the day it was written.

## What the user asked for

A **folder application**: one place where everything the app stores is visible, browsable and
actionable, behaving "entirely like a Windows filing system". It **replaces Notebook** — the
Notebook section is deleted and its capabilities absorbed. Clicking a file anywhere in the app
opens it in the Files app, at its place in the tree. The app is **context-aware**: it
highlights the files relevant to the page you came from — on an epub page it opens on the epub
selection with all related files already in view — while still letting you widen to everything.

Two constraints the user stated explicitly, and they pull against each other on purpose:

- **Extensive.** It should have *everything* in it, including the memory and statistics that
  currently live in Settings.
- **Not a gatekeeper.** "It shouldn't be too pretentious that everything needs to be found in
  the folder to actually use in the app." Every route that works today keeps working. The Files
  app is an *additional*, faster way in — never a required one. A feature that can only be
  reached through the Files app is a regression, not a migration.

## Grounding — what already exists

- **Notebook is a first-class section**, not a component: it is in `DesktopWinSection`
  (`shared/agentNavigation.ts:64`), the command palette (`:175`), the agent navigation index,
  and all four i18n catalogs. Deleting it touches every one of those; `:194` also carries a
  `note` alias that resolves to the same palette key and is deliberately non-navigable.
- **A Settings "memory" page already exists** with system memory, storage usage and related
  rows (`renderer/components/settings/settingsRegistry.ts:169`, `:1078-1137`). The Files app
  absorbs its *content*; whether the Settings page remains as a second route is a product
  decision — per the not-a-gatekeeper rule, prefer keeping it.
- **The mineable assets are already on disk** and are indexed nowhere: `yt-transcripts/`
  with one `<youtubeId>.json` per video (`main/ytPlaylists.ts:44`, `:60`), a `transcribed`
  flag already computed per video (`:254`), and subtitle sidecars enumerated by directory scan
  (`:376`, `:547`).
- **Dictionaries are rows in SQLite**, not files: `dictionaries` in `dict.db` carries id,
  title, kind, licence, attribution and `entry_count` — as of 2026-08-16, eight of them
  totalling ~1.5 M glosses, 341,768 inflections, 234,982 examples, 13,108 characters.
- **userData has no restore point.** Backups were cancelled by standing user instruction and
  `downloads` alone is ~5.3 GB. This is a *design input*, not a footnote — see Deletion below.

## The central design decision: it is an index, not a directory

The folders are **views over heterogeneous stores**, not real directories. What the app owns
lives in at least five different shapes: real files (`downloads`, `models`, epubs, transcripts,
subtitle sidecars), SQLite rows (dictionaries, examples, inflections), `localStorage` (the
flashcard deck, mining history, lens history), main-process JSON (playlists, library,
desktop layout), and derived state (statistics, memory usage).

A literal filesystem browser cannot represent that, and forcing everything into real
directories would mean moving the user's media around to satisfy a UI. So: every item carries a
**real location** it can reveal (path, table row, or store key) and is *placed* in the tree by
its **derived category**. Nothing is filed by hand; a newly transcribed video appears in the
right place because of what it is.

## What goes in the tree

A first cut. The tree is derived, so adding a category later is additive.

**1. Sources — things that can become flashcards**
   - Books / epubs · manga · visual novels
   - Video: local media, YouTube downloads, anime episodes
   - Audio: music tracks, audio-only downloads, podcasts
   - Text: transcripts (`yt-transcripts/`), subtitle sidecars, harvested anime subtitles
   - Each row states **provenance** — human subtitles / auto-captions / Whisper transcript /
     book text — because that is what decides whether a card from it is trustworthy.

**2. Outputs — things the app produced**
   - Flashcard decks and their folders · mined-card history (with undo state)
   - `.apkg` packages imported and exported · epub-mining CSV exports
   - Notes (absorbed from Notebook) · highlights and reading-lens history
   - Anki draft sessions (the workbench already lists and discards these; it has no resume —
     see `MINING_UNIFICATION_PLAN.md`)

**3. Reference — installed assets**
   - Dictionaries, each with entry count, licence and attribution, enable/disable, delete
   - Models (Whisper tiers, GGUF translators) with size and what is actually cached
   - Wallpapers, artwork, covers

**4. System — the Settings content the user asked for**
   - Memory: system memory, per-store storage usage, what is safe to reclaim
   - Statistics: known words, cards mined over time, study activity
   - Profiles

**5. Workspaces** — study workspaces, scrape queue and jobs, in-flight acquisitions

## Behaviour

- **Two panes, Explorer-shaped:** category tree on the left, item list on the right with
  sortable columns (name, kind, provenance, size, date, and state flags like *transcribed*,
  *mined*, *exported*).
- **One search across everything**, matching name, kind and provenance.
- **Context entry.** Opening from a page passes a *scope* — a category and optionally a focused
  item — which pre-filters and highlights it. Scope is a filter, not a mode: clearing it reveals
  everything, and the same window is used either way.
- **Per-item actions, by kind:** open · mine · transcribe · export · reveal in OS · note ·
  enable/disable · delete. Every one of these must already be reachable elsewhere.
- **Star / pin.** The user asked for something here that transcribed ambiguously ("60 stars").
  Read as starring or favourites: an item can be starred and starred items surface first.
  Still unconfirmed; it is small and isolated, so build it last.

### Opening a file opens the right app — reuse `planForPath`, do not invent a second table

The user's requirement: clicking any item opens it in whichever app handles that type. **This
already exists** and must not be rebuilt. `main/fileRouter.ts` is the drop router:
`planForPath(filePath)` (`:202`) returns a `DropPlan` of ranked `DropCandidate`s, and it does
real **content sniffing**, not extension guessing — `sniffZip` (`:61`) and `sniffJson` (`:98`)
settle extension-level ambiguity and set a `sniffed` flag, which is how a Yomitan dictionary
zip is told apart from an `.apkg`. A second, divergent mapping in the Files app is how the two
disagree six months later, so the Files app **calls this one**.

Where a file has more than one plausible handler the router already ranks candidates; the Files
app should offer the ranked list as an "Open with" rather than silently taking the top one.

### Ingest — the app finds your files, you don't feed it one at a time

Clarified by the user 2026-08-16: they do **not** want a disk browser. They want the app to
**scan storage, recognise what it can use, and bring it in in bulk** — including live, while
things are still downloading, and including "here is a folder, sort all of it".

This is the same classification problem the drop router already solves, applied to many files
at once: `planForPath` classifies, ingest supplies the volume. Three entry points:

**1. Scan.** Point it at roots (offer sensible defaults — Downloads, Videos, Documents — never
the whole drive by default), walk them, classify every candidate, and present a **review list
grouped by destination**: *14 subtitles → Sources/Text, 3 epubs → Sources/Books, 1 dictionary
zip → Reference*. The user confirms or deselects; nothing is imported silently on the first
run. Scanning is strictly **read-only** on the user's files.

**2. Watch — live, while downloading.** Chosen folders stay monitored, so a file finishing in
the browser's or a torrent client's download directory is recognised as it lands. This also
connects the MAL pipeline for free: the qBittorrent save path is just another watched folder.

  Two traps that decide whether this works or is maddening:
  - **Never touch a file still being written.** `.crdownload`, `.part`, `.tmp`, `.!qB` and
    friends are ignored, *and* a file is only considered once its size has been stable for a
    few seconds. Importing a half-written video is the obvious way to produce a corrupt
    library entry that looks like an app bug.
  - **Confidence tiers.** High-confidence matches (an `.epub`, an `.apkg`, a subtitle beside a
    known video) may auto-import; anything the router settled by guessing goes to a review
    queue. Silent auto-import of a guess is how a library fills with junk nobody can trace.

**3. Paste a folder.** Paste a path or drag a folder in; it is walked recursively, archives are
expanded far enough to see what they contain (the router already sniffs zips), and every item is
placed in its proper category. The result is a report: placed, skipped, ambiguous, and why —
never a bare "done".

**Copy or reference? Reference in place, by default.** `downloads` is already ~5.3 GB; copying
discovered media into userData would duplicate tens of gigabytes for no benefit and is
irreversible from the user's point of view once they tidy the original. So an imported item
records a **path to where it already lives**, and copying is opt-in (and the sane default only
for small derived files — subtitles, `.apkg`, dictionaries). Two consequences that must be
designed for, not discovered: the app now has **broken links** when a user moves or deletes an
original (already a T3 feature — detect and report, never crash), and **removal semantics
differ** — removing a referenced item from the library must never delete the user's file.

**Never modify what it did not create.** Ingest reads, indexes and references. It does not move,
rename, reorganise or delete anything in the user's own folders. If the user asks for tidying
later, that is a separate feature with its own confirmations.

Re-scanning is incremental and idempotent: known files are recognised by path, size and mtime
(hash where it matters), so a second scan imports nothing twice and reports honestly that it
found nothing new.

### Real-filesystem bridge — browsing what the app owns, importing from anywhere

Scope decision (user): the tree is **what the app owns**. But the user also asked to be able to
open a real folder and drag or copy files in from the computer, which is a different feature
and a very good one:

- **Import in** — drag from Explorer, paste, or an "Add files" picker, routed through
  `planForPath` so a dropped epub, `.apkg`, subtitle or dictionary lands where it belongs and
  is immediately in the tree. This is the drop router's existing job, given a surface.
- **Reveal out** — every item can open its real location in Explorer.
- Deliberately **not** in scope: a general disk browser competing with Explorer. Import and
  reveal are the two crossings; the tree itself stays app-owned.

### The AI assistant and other surfaces wire in through the existing index

"Smartly wired" grounded: the assistant already resolves destinations through
`AGENT_NAVIGATION_INDEX` and `resolveAgentNavigationQuery` (`shared/agentNavigationIndex.ts:296`,
`:492`). The Files app registers its categories there, so the assistant can send the user to a
scoped view ("show my transcripts", "where is that epub") using the mechanism that already
exists rather than a bespoke one. Any surface that owns a file type registers its opener the
same way — one registration point, so a new type appears in the Files app and to the assistant
at once.

**Music stays exactly as it is.** Tracks and lyrics are listed and openable, and clicking one
opens the existing music app unchanged. The Files app never becomes a second music player. Same
rule for every other established surface: the Files app is a *finder and a router*, not a
re-implementation.

### Windows-file-manager parity, aimed at this app's material

As much of the real thing as is meaningful here: sortable columns (**name, kind, size, date
created, date modified**, plus provenance and state flags), ascending/descending, list and
detail views, breadcrumbs with a path bar, multi-select, keyboard navigation, right-click
context menus per type, rename where the underlying store allows it, copy/move where it is
meaningful, one search across everything, and filters by kind and provenance. Column sorting is
a first-class requirement, not a nicety — the user named time-created and size specifically.

Where a store cannot support an operation (a SQLite dictionary row cannot be "renamed" on disk),
the action is absent rather than present-and-failing.

## Feature inventory

The user asked for as much of a real file manager as makes sense here, and asked that the list
itself be brainstormed rather than dictated. Tiers are implementation order, not importance:
**T1** is the app being usable at all, **T2** is it feeling like Explorer, **T3** is where it
beats Explorer because it knows what the files *are*.

### The one real conflict: derived folders vs. folders you make

"Automatically sorted" and "let me create folders" pull against each other — a tree computed
from provenance has nowhere to put a folder the user invented. Resolved with **two container
kinds, visibly distinct**:

- **Derived folders** — computed from what an item is (Sources/Video, Reference/Dictionaries).
  Membership is automatic and cannot be edited; new items self-file. These cannot be deleted or
  renamed, and that refusal is honest rather than hidden.
- **Collections** — user-made, arbitrary membership, an item may belong to many, and belonging
  to one never moves or copies the underlying file. Nest freely, rename, delete (deleting a
  collection never deletes its contents — stated in the confirm).

Anything else — a user folder that silently competes with the derived tree — produces two
answers to "where is this file", which is the failure this whole design is trying to avoid.

### T1 — the spine

- Tree pane with expand/collapse; item list pane; resizable split.
- **Sorting** by name, kind, **size**, **date created**, date modified, and date last used,
  ascending/descending, sort persisted per folder.
- Columns: choose which show, reorder, resize.
- Details view + list view; item count and total size of selection in a status bar.
- Multi-select: Ctrl+click, Shift+range, Ctrl+A, marquee drag, invert selection.
- Open (routed via `planForPath`), Open with (the ranked candidates), Reveal in Explorer.
- Search within the current folder and across everything.
- Back / Forward / Up with history, breadcrumbs, and an editable path bar.
- **New folder** (creates a Collection), rename, delete-collection.
- **Favorites**: pin items *and* locations; a Favorites node at the top of the tree.
  The user's earlier ambiguous "60 stars" is read as this same feature — starring an item
  surfaces it in Favorites — which makes the two requests one thing.
- Refresh, and a live-updating list (a new transcript appears without a manual refresh).

### T2 — the Explorer feel

- View modes: details, list, tiles, large/extra-large icons with **thumbnails** (covers,
  video posters, epub art).
- **Preview pane** (selected item rendered: cue list, page, cover, waveform) and a **details
  pane** (metadata, provenance, study stats).
- **Group by** kind / date / size / provenance, with collapsible groups.
- Drag and drop: into Collections, out to Explorer, in from Explorer (import via the router).
- Cut / copy / paste semantics where they are meaningful, with **Undo (Ctrl+Z)** for
  operations that can be reversed and an explicit "cannot be undone" where they cannot.
- Context menus per type; a Properties view per item.
- Filter bar: kind, provenance, date range, size range.
- Keyboard throughout: F2 rename, Delete, F5 refresh, Alt+←/→, Enter, type-ahead find.
- **Tabs** — several locations open at once (Windows 11 parity), and optionally a dual pane,
  which is genuinely useful when moving items between Collections.
- Progress with cancel for long operations (import, transcribe, bulk mine), and errors that
  name the item that failed rather than failing the batch silently.
- Per-folder view settings remembered.

### T3 — what Explorer cannot do, because it does not know what these files are

- **Smart folders** (saved searches that stay live): *Untranscribed videos*, *Never mined*,
  *Mined this week*, *Has human Japanese subtitles*, *Transcript-only*, *Largest downloads*.
  This is the honest home for "automatically sorted" beyond the fixed tree.
- **State columns**: transcribed · mined · exported · enabled (dictionaries) · has notes.
- **Provenance column** as a first-class citizen: human subs / auto-captions / Whisper
  transcript / book text — with transcript-derived material visibly marked everywhere.
- **Study statistics per item**: cards mined from this source, known-word coverage, last
  studied — the statistics moved out of Settings become per-item facts here, not just totals.
- **Bulk study actions**: mine all selected, transcribe all selected, export selection.
- **Duplicate detection** (the same episode acquired twice) and **broken-link detection**
  (a record pointing at a file that is gone) — both are real conditions in this app today.
- Notes attached to any item (absorbed from Notebook), searchable.
- Sort by "most useful to study next" using coverage and frequency data the app already has.

### Explicitly out of scope

Browsing arbitrary disk as a navigation surface, file compression, network locations,
sharing/permissions, and anything that duplicates the OS for its own sake. The crossings to the
real filesystem are **ingest** (scan, watch, paste-a-folder — see above) and **reveal**. The
distinction the user drew is worth keeping sharp: the app *finds and indexes* your files, it is
not a second Explorer for navigating them.

## Folder settings

The user's framing: the ingest traps are handled by junk/clean options plus general folder
settings, and those settings should be in-depth. Agreed with one correction that shapes the
design — **cleanup is a remedy, not a substitute for prevention**. If a half-written file is
ingested, the entry is built from a partial read (wrong duration, wrong cue count, wrong hash)
and once the file finishes nothing looks broken enough for a cleaner to notice. So the stability
check stays; settings make it *tunable*, and cleanup handles what still slips through.

### What must never become a setting

Stated first, because the value of a settings surface is partly in what it refuses to offer:

- Ingest never moves, renames, reorganises or deletes anything in the user's own folders. There
  is no toggle for this. A setting that could turn a library indexer into a file mover is a
  footgun with no legitimate use.
- Deletion of irreplaceable media always confirms. Not a preference.
- Auto-clean may never target irreplaceable material, whatever its age — only derived and cache
  data. "Delete old videos automatically" is not offered.

### A. Ingest and scanning

- **Watched folders** — list, add/remove, enable per folder, and per-folder rules (auto-import
  vs review).
- **Scan roots** and **exclusions** (glob patterns), max depth, skip hidden/system, symlink
  policy.
- **Stability window** — how long a file's size must be unchanged before it is considered
  complete. Default a few seconds; raise it on slow external drives. This is the partial-download
  trap, made adjustable rather than hidden.
- **Ignored extensions** — `.crdownload`, `.part`, `.tmp`, `.!qB` and friends, user-editable,
  because every download tool invents another.
- **Auto-import confidence** — always review · auto-import high confidence only · auto-import
  everything (with an honest warning on the last).
- **Per-category overrides** — e.g. auto-import subtitles and epubs, always review video.
- **Size thresholds** — ignore files under/over a size, per category.
- **Archive handling** — expand archives to classify, max archive size, nesting depth.
- **Duplicate policy** — skip · import anyway · ask.
- **Reference vs copy**, globally and per category (default: reference; copy small derived files).
- **Schedule** — on launch · periodically · manual only; plus a background-priority cap so a
  scan never competes with playback or transcription.

### B. Junk and cleaning

Junk is *defined* here, and the definition is the feature — a cleaner that guesses is worse than
none. Candidate classes, each individually toggleable:

- Zero-byte and truncated files; abandoned `.part`/`.tmp` beyond an age threshold.
- **Orphaned index rows** — a record pointing at a file that no longer exists (broken links).
- **Orphaned derivatives** — a transcript whose video is gone, a cover for a deleted book.
- Duplicate media (same content, two paths), with a rule for which copy is kept.
- Stale caches: thumbnails, previews, extracted archive temporaries.
- Failed or aborted downloads and empty folders the app itself created.
- Old exports (CSV, `.apkg`) past an age threshold.

Controls: **dry run first, always** — a report with counts and reclaimable size before anything
happens; per-class enable; age thresholds; **destination** (Recycle Bin by default, quarantine,
or permanent with an explicit warning); optional schedule that is **report-only by default**.
A cleanup run writes a log of exactly what it removed, so a surprise is traceable afterwards.

### C. Library, display and organisation

- Default view mode, sort column and direction; per-folder overrides remembered.
- Default visible columns and their order; date format; show extensions; show hidden items.
- Thumbnails: on/off, cache size cap, regenerate.
- Default grouping; Favorites pinned to top; whether Collections may nest.
- Provenance display: how prominently transcript-derived material is marked (it may be made
  *more* prominent, never hidden).

### D. Storage and maintenance

- Storage usage per store, with the memory/statistics content that moved out of Settings.
- Cache caps and a clear-cache action with sizes shown.
- **Index rebuild / re-verify** — re-check every record against the disk and report drift.
- **Broken-link policy** — mark only · prompt · attempt automatic relocation by name/size/hash.
- Library location, and what happens to references if it moves.

### E. Safety

- Confirmation thresholds (confirm above N items or X GB).
- Undo window length for soft deletes.
- Whether permanent delete is offered at all — default **no**, Recycle Bin only.

### F. Rules (advanced, later)

A small rules engine — *if a file matches this pattern, route it here, tag it, auto-mine it* —
plus episode/series naming patterns for anime filenames. Powerful and easy to get wrong, so it
ships after the fixed behaviour is proven, and every rule shows what it would have matched
before it is saved.

## Deletion, and why it gets its own section

There is no userData restore point. `downloads`, `models`, `wallpapers`, `library` and
`artwork` have no copy anywhere, and this app's own skill documentation refuses operations that
delete media for exactly that reason. A file manager whose whole idiom is "select and delete"
sitting on top of unbacked media is the single most dangerous thing in this plan.

Rules: deletion states what will be removed and its size before acting; media deletion is
guarded separately from index deletion; removing a *derived* item (a transcript, a CSV export)
is distinguished in the UI from removing an *irreplaceable* one (a downloaded video); and
nothing cascades silently.

**And the mitigation that changes the risk entirely: file-backed deletions go to the Windows
Recycle Bin, not to `unlink`.** Electron's `shell.trashItem` does exactly this. It restores the
undo that this app has been missing since backups were switched off, it costs no extra storage
(the Recycle Bin is the OS's problem), and it means a mis-click on a 2 GB download is
recoverable by the user without any involvement from us. Adding a file manager to an app with
no restore point is the risk; routing its deletes through the Recycle Bin is what makes the
feature responsible rather than reckless — so it is a requirement, not an enhancement.

Index-only rows (a dictionary, a Collection, a note) have no Recycle Bin equivalent, so they get
a soft delete with an undo window instead. Wherever neither is possible, the confirm says so in
plain words rather than using the same wording as a recoverable delete.

## Gates

Numbers, never adjectives. An empty result is a FINDING — say so and stop.

1. The index enumerates real items across all five groups, reporting a count per category that
   matches what is on disk / in the tables. A category reading 0 while items exist is a FINDING.
   <!-- status: closed; evidence: 2026-08-31 live census 5,263 items / 17 main + 3 renderer enumerators; both retractions resolved, every zero measured -->
   **CLOSED 2026-08-31, third attempt, at 5,263 items.** Two retractions preceded it and
   both were right. See the 2026-08-31 (second) Progress entry for the table, the numbers
   and the four remaining zeros, each measured against its own store.
2. A video transcribed earlier is findable in the Files app **without navigating to that video**.
   <!-- status: closed; evidence: 2026-08-31 86e9cb41 -- named after its video (a37d4c5e) AND found by search; NFKC+kataToHira fold, control fails 1 of 25 -->
3. One-click mine from the list works end to end for one item of each mineable kind.
   <!-- status: closed; evidence: 2026-08-31 d17d138b -- 85/86 cue transcripts, 210/177/204 cue subtitles, 6603/16787/9517 sentence books, all real; two MP4 controls refuse -->

4. Categorisation is derived: a newly transcribed video appears in the right place with no
   manual step.
   <!-- status: closed; evidence: 2026-08-31 940cbbab -- deriveCrossStoreFlags; live 83 media / 49 with a derivable id / 2 transcripts -> exactly 2 marked; control with transcripts removed marks 0 -->
5. Context entry from an epub page opens the Files app scoped to epubs with that book focused,
   and clearing the scope reveals the full tree in the same window.
   <!-- status: closed; evidence: 2026-08-31 504f7863 -- reader Study menu -> openFilesAppForBook/Manga; 8 tests incl. consumed-on-read, live re-scope, and a refused unknown category -->
6. Every action offered in the Files app is still reachable by its original route — enumerated
   route by route. A capability that became Files-app-only is a FAIL. The one permitted
   exception is memory/statistics (decision 1), which must be named explicitly in the report.
   <!-- status: closed; evidence: 2026-08-31 -- 29 rows in shared/filesApp/routeParity.ts, 22 preserved / 7 new / 0 migrated; all 111 branch deletions audited, 0 removed routes; 6 negative controls -->

7. Notebook is deleted with its features absorbed: notes survive the migration with a stated
   count, and `DesktopWinSection`, the palette, agent navigation and all four i18n catalogs are
   consistent afterwards (`node tools/i18n-check.cjs` exit 0).
   <!-- status: closed; evidence: 2026-08-31 92bd3e06 + 63a83468 -- 3,349 live entries over 15 streams each given a surviving route in shared/filesApp/notebookAbsorption.ts; 20 call sites removed, every legacy id aliased; i18n exit 0 at 11,747 keys; 2 index gaps named -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (seventh) Progress entry for the per-stream
   table, the two named index gaps and the 15th stream nobody had counted.
8. Memory and statistics render in the Files app with the same numbers the old Settings page
   produced, captured **before** removal and compared after. Settings no longer carries them,
   and every search entry that pointed at `pageId: 'memory'` resolves to the Files app — a
   search hit landing on a page that no longer holds the row is a FAIL.
   <!-- history (superseded by the closing tag below): 2026-08-31 f26e9932 + d9bec5be + cd9ae66d -- panels on the OLD page's own readers, MemoryPage.tsx deleted, 9 entries repointed via movedTo:'files', parity rows landed as panel:system/memory (migrated) + panel:system/statistics (preserved); the "compared after" reading needs an EXCLUSIVE app and is blocked on the mergeback -->
   <!-- history (superseded by the closing tag below): 2026-09-01 3402a184 -- the AFTER COMPARISON now exists and
        RUNS, against the imported gate8-before.json rather than retyped values. 12 assertions
        across filesAppGate8Parity.test.tsx (8) and filesAppGate8Stats.test.tsx (4). Memory:
        all 8 card anchors EQUAL and in order; formatBytes(totalmem) and platform rendered off
        a stubbed window.api.systemGetMetrics; the inventory table 30 rows / 24 sized, the six
        largest by the capture's own byte values in the capture's order. Statistics: 14
        stats-bar-col for the capture's recentDays=14, and knowledge reports the measured 0 on
        every tier. Three controls: totalmem x2 renders the doubled figure and NOT the
        original; scaling the inventory bytes x3 moves the rendered sizes; recentDays 7 renders
        7 columns. Search half: 9 entries keep pageId 'memory' by design (types.ts:109 -- the
        index must still resolve) and EVERY one carries movedTo 'files', with 8 of the 9 anchor
        ids matching a card the panel renders. STILL OPEN on one clause only: that the live app
        ROUTES to this panel, which needs an exclusive Electron. -->
   <!-- status: closed; evidence: 2026-09-01 64c22632 -- the last clause, measured LIVE in a
        second dev instance this worktree now starts for itself (vite 5273 / bridge 39274 /
        scratch userData), beside the other track's app. Typed "factory reset" into the real
        Settings search and clicked the real hit: the Files app OPENED (fwin 3 -> 4), scoped to
        Memory, and exactly ONE of its 8 cards carried .fa-panel-card.is-highlight -- "Factory
        reset". Control (b), that the card id is carried rather than hardcoded: "Data inventory"
        highlights "Settings inventory" instead, count still 1. Control (a), that the redirect
        is not indiscriminate: "Accent colour" (not migrated) navigated Settings to Appearance
        and opened NO Files window (fwin 4 -> 4). Settings-no-longer-carries-them, also live:
        the nav rail lists 19 items, none matching /memory|storage/ or /statistic/.
        2 of the 9 migrated entries were driven end to end; the other 7 share the single
        `next === 'memory'` branch in SettingsApp.tsx:171 that both driven ones exercised, and
        the committed test already pins all 9. -->
   **CLOSED 2026-09-01.** All four clauses hold. The before-capture exists
   (`gate8-before.json`), the after-comparison is a test that imports it rather than retyping
   it, and the routing clause is now a live reading with two controls.
   <!-- follow-up 2026-09-01 90502392, found while landing the branch and NOT caught by any of
        the 12 assertions above, because it is outside this gate's own words: deleting the
        Notebook section also deleted `notebook: 'Notebook'` from App.tsx's POPOUT_LABELS, and
        that object is `popoutSection()`'s allow-list, not just a label map. `files` was added
        to main.ts's ARGV_OPEN_SECTIONS but never here, so main would open `?popout=files` and
        the renderer answered null -- a capability Notebook HAD (verified at 733fa357^) and
        Files did not inherit. The gate stays closed; the lesson is that "absorbed its features"
        has to be checked against every list the deleted section was a member of, not only the
        ones the gate names. popoutSectionParity.test.ts now compares the two halves as sets. -->
   <!-- follow-up 2026-09-01 084dcfea -- boss audit finding 4, the three whole-src sweeps that
        timed out at 20s under full-suite load and read as product regressions. Cause was the
        walk (re-read + re-strip per call), not the assertions: 30.97s -> 3.38s, 17 -> 18 tests,
        with a hard floor and a positive control so an empty walk can no longer pass. -->
   <!-- follow-up 2026-09-01: boss audit finding 3 (cherry-pick f104600b) is ALREADY CLOSED --
        `git merge-base --is-ancestor f104600b feat/nyaa-subtitles` returns true. Do not redo it. -->
   The routing lives in `SettingsApp.tsx:159` `navigate()`, NOT in the search box — four callers
   reach it (search, nav rail, agent guided-navigation, recent pages) and a redirect in one
   would leave the other three dead-ending. So `movedTo` is registry METADATA that no component
   reads; grepping for a `movedTo` consumer finds only tests and concludes, wrongly, that the
   routing was never built. It is keyed on `pageId === 'memory'`.
   TRAPS the comparison found, both in the instrument and both worth not repeating:
   `.fa-panel-table` also matches the agent-memory and agent-history tables, so an unscoped
   row count read 32 for a 30-domain inventory; and `knowledgeCounts()` is indexed by LEVEL
   (`counts[1..3]`), so a `{ known, learning, unknown }` stub renders "undefined" in every
   card and reads as a product defect.
9. Deleting a derived item removes exactly it; the guard for irreplaceable media refuses without
   an explicit confirmation, proven by a refusal that actually fires.
   <!-- status: closed; evidence: 2026-08-31 c7035ae6 (wiring) + 341b94e4 (live) -- "exactly it":
        the live probe deletes one of two real 4 KB files through the PRODUCTION
        deleteFilesItemInMain and the bystander is still on disk after; the soft-delete half is
        asserted on the production FilesApp, where one row leaves the list AND the item count
        while its neighbour does not. The refusal FIRES rather than being asserted as a branch:
        a delete with no confirmedItemId returns filesApp.delete.confirmationRequired with the
        file still on disk, and an unknown id returns filesApp.delete.notFound. -->
   <!-- decision: the request that crosses IPC carries an id and its confirmation and NOTHING
        else -- no path, kind or referenced flag. Main re-resolves all three from its own index
        immediately before acting, so a compromised renderer cannot downgrade a video or aim
        Delete at an arbitrary file. Asserted on the sent object's own key list. -->
   <!-- decision: the index is rebuilt with force:true for a delete rather than served from the
        15-second cache. A stale path is exactly the input that trashes the wrong file, and a
        delete is a rare user-initiated act, so one rebuild is the cheap side of that trade. -->
10. **Opening routes through `planForPath`.** Clicking an item of each handled type opens the
   app that owns it, and a type with more than one candidate offers the ranked list rather than
   silently choosing. Proven with a file whose extension is ambiguous and whose handler is
   settled by content sniffing (`sniffZip`/`sniffJson`), so the sniffing path is exercised.
   <!-- status: closed; evidence: 2026-08-31 c8fac9ea + e3816480 -- shared/filesApp/openPlan.ts; 18 tests on real .zip/.json through the real planForPath, both sniffers, 12 of 15 targets own an app and 3 refuse by name, 4 controls; filesApp.test.tsx 39 -> 46 -->
11. **Import from the real filesystem.** A file dragged in from Explorer is routed, lands in the
   correct category, and appears in the tree without a manual refresh. A file the router cannot
   place gets a named refusal, not a silent drop.
   <!-- status: closed; evidence: 2026-08-31 8bc72866 -- renderer/filesIndexBus.ts + useFilesIndex force:true reload; the two silent returns in DropRouter now refuse by name with distinct severities; 10 tests incl. DropRouter's first coverage and 3 controls -->
12. **Reveal out.** An item opens its real location in Explorer, for at least one file-backed
   and one non-file-backed kind — the latter must refuse honestly rather than open the wrong
   folder.
   <!-- status: closed; evidence: 2026-08-31 -- filesAppReveal.test.ts, 7 tests on the handler with shell.showItemInFolder SPIED: exact recorded path for a file, refused-without-asking for sqlite/json/localStorage/derived, a malformed location, and a store shape carrying a path. Found and fixed a SECOND wrong folder: a brokenLink row is file-backed, so the old handler revealed a dead path and Explorer opened the nearest surviving ancestor as ok:true -->
13. **The assistant can reach it.** A natural-language request resolves to a scoped Files view
   through `AGENT_NAVIGATION_INDEX`, not a bespoke path.
   <!-- status: closed; evidence: 2026-08-30 'files' in DESKTOP_WIN_SECTIONS/AGENT_NAVIGABLE_SECTIONS/palette/POPOUT_SECTIONS/AGENT_NAVIGATION_INDEX; both directions tested -->
14. **Sorting is real.** Sorting by date created and by size reorders correctly on a set with
   known values, in both directions, including items whose store supplies no such value — those
   must sort predictably rather than landing arbitrarily.
   <!-- status: closed; evidence: 2026-08-30 sortItems by size+date, both directions, nulls last in both; negative control broke 4 tests across 2 suites -->
15. **Music is untouched.** A track opens the existing music app, and that app's behaviour is
   unchanged before and after.
   <!-- status: closed; evidence: 2026-08-31 -- found FAILING by gate 10's own table (audio shares the router's `media` bucket, which maps to `player`); fixed with one explicit {target:'media',kind:'audio'}->'music' pair, control proves it is not "kind wins"; the untouched half asserted as an absence -- FilesApp imports no music module and routes through openSectionSurface -->
16. **Collections are real folders.** Create a folder, add items of two different kinds to it,
   nest it, reopen the app and it survives. Deleting the collection leaves every item in place —
   proven by re-finding one of them afterwards.
   <!-- status: closed; evidence: 2026-08-31 f2313736 (model) + 64abd9d8 (store) + 733ce361 (UI) -- 20 UI tests, every survival claim asserted after a real unmount/remount with the store's memory fallback cleared; delete re-finds the item in Everything; a stale id is COUNTED under the list; control: removing setItem turns 12 of 20 red -->
17. **Derived folders refuse honestly.** Renaming or deleting a derived folder is refused with a
   named message; it does not silently no-op. Adding an item to one by hand is not offered.
   <!-- status: closed; evidence: 2026-08-31 733ce361 -- rename/delete/move stay PRESENT on a derived node so they have somewhere to refuse, each naming the folder; the "not offered" half is the absence of preventDefault on dragover, asserted as event.defaultPrevented false, with the user's own folder as the true control; the Add menu lists only the user's own folders -->
   <!-- decision: the refusal controls are shared rather than per-node. A control that
        vanishes on a derived folder cannot say why, and gate 17 asks for a named message
        rather than an absence. Reversible: per-node menus can be added later without
        moving the refusal logic. -->
   
18. **Favorites.** Pin an item and a location; both appear under Favorites and survive a
   restart. Unpinning removes them and deletes nothing.
   <!-- status: closed; evidence: 2026-08-31 5827f201 -- 14 real-component tests pin an item plus derived/user location, remount against persisted localStorage, unpin, and re-find the unchanged item/folder; 18 pure/store tests pin the one-list target shape and stale-row retention -->
19. **Smart folders stay live.** A saved search such as *Untranscribed videos* changes its
   membership after a video is transcribed, with the count before and after both reported.
   <!-- status: closed; evidence: 2026-08-31 9286bf90 -- production component rail and body report Untranscribed videos 2 -> 1 and Transcribed videos 0 -> 1 after a real forced index refresh; unchanged Broken links is the negative control; criteria, never membership, persist -->
20. **Bulk actions.** Select several items and mine them in one action; the result names the
   per-item outcome, and one failure does not silently abort the rest.
   <!-- status: closed; evidence: 2026-08-31 88913972 -- production component selects 3 rows, attempts all 3 sequentially, catches an exception on item 2, then item 3 still adds; receipt names 2/3 succeeded, 2 cards, 1 failed plus every item outcome; bulk undo returns deck count 2 -> 0 -->
21. **Deletion is recoverable.** Deleting a file-backed item places it in the Windows Recycle
   Bin (`shell.trashItem`) and it is restorable from there — verified by actually restoring one.
   An index-only row is soft-deleted with a working undo. Where neither applies, the confirm
   says so in different words from a recoverable delete.
   <!-- status: closed; evidence: 2026-08-31 c7035ae6 (wiring) + 341b94e4 (live) --
        debug/filesapp-trash-roundtrip.cjs, a real Electron main process calling the production
        deleteFilesItemInMain with the real shell.trashItem: a self-created 4 KB file leaves the
        disk, is FOUND IN THE BIN by its original path, is put back by the bin's own Restore
        verb, and returns byte-identical and absent from the bin. "Verified by actually
        restoring one" is that Restore verb, not a mock. The soft-delete half and the
        different-words half are 9 tests on the production FilesApp; adverse control: 2 of 9. -->
   <!-- defect found by the integration test, fixed in the same commit: a successful delete
        removes the row, which clears the selection, which unmounts the inspector -- taking the
        receipt and its Undo button with it. The Undo was unreachable in exactly the case it
        exists for. The receipt is hoisted to the status dock, which never unmounts. Removing
        that hoist turns 2 of 9 red. The control's own suite never saw it: it mounts the control
        standalone with a fixed item, so the row it deletes can never leave. -->
   <!-- TRAP for anyone reading the Recycle Bin from PowerShell, which cost three runs:
        (a) Get-ChildItem cannot see into it; use Shell.Application Namespace(10).
        (b) GetDetailsOf(item,0) honours "hide extensions" and returned `gate21-episode`, not
            `gate21-episode.mkv` -- take the extension from the $R stub's own .Path.
        (c) JSON.stringify is the WRONG quoter for a Windows path in PowerShell: it doubles
            every backslash and PowerShell's escape char is the backtick, so the path compares
            equal to nothing. Use a single-quoted PS literal.
        (d) $ErrorActionPreference='Stop' aborts the enumeration on an unrelated item.
        Each of these reported the file as ABSENT from a bin it was demonstrably sitting in --
        i.e. each would have read as "trashItem does not work". Suspect the instrument. -->
22. **View state persists.** Sort column, direction and view mode are remembered per folder
   across a restart.
   <!-- status: closed; evidence: 2026-08-31 0ef89ef0 -- shared/filesApp/viewState.ts + renderer/filesViewStateStore.ts; 26 tests (19 pure + 7 on the real component across a real unmount with the store's memory fallback cleared); every "remembered" claim paired with a neighbour folder that must not have moved; adverse control collapsing folderViewKey to one global key turns 6 of 26 red, 3 of them restart tests -->
   <!-- decision: view modes are `details` (the column table) and `compact` (name + kind, 24px
        row), not a four-way Explorer set. The list is windowed by VirtualList on a fixed
        `itemHeight`, so a tile grid is a second windowing mode rather than a class name, and
        the gate asks about REMEMBERING the mode. A third value can be added to
        FILES_VIEW_MODES later without touching the persistence contract. -->
   <!-- finding, recorded not fixed: a folder can be sorted by a column its own view mode has
        dropped, so compact renders no `aria-sort` anywhere. The toolbar select still names the
        column and the order is correct — Explorer's List view behaves the same way. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (seventeenth) Progress entry.
23. **Scan finds things in bulk.** Point it at a folder holding a mixed set — subtitles, an
   epub, a dictionary zip, a video — and it reports a count per destination. Report the number
   found, the number placed and the number left ambiguous; "scanned successfully" with no
   numbers is not a pass.
   <!-- status: closed; evidence: 2026-08-31 8fca0963 -- shared/filesApp/scan.ts + main/filesApp/scan.ts + filesapp:scan IPC + preload filesScan; real mixed folder through the PRODUCTION planForPath: 9 files -> found 8 / placed 7 / ambiguous 0 / unplaced 1 / skipped 1; per destination subtitle 3, media 2, library-book 1, dictionary-yomitan 1 (sniffed, a real Yomitan zip with format:3), unknown 1; scanReportBalances asserted; adverse control removing the incomplete skip turns 4 of 12 red -->
   <!-- decision: placement reuses the drop router's own preferredTarget/needsTriage verbatim.
        A second opinion here would let a file scan into a destination the drop router would
        refuse, and the plan's "one classifier" would quietly become two. `unplaced` is kept
        separate from `ambiguous` because they ask the user for different things. -->
24. **Scan is read-only.** After a scan and an import, every original file is byte-identical and
   still in its original path — verified, not assumed.
   <!-- status: closed; evidence: 2026-08-31 8fca0963 (scan half) + 38d26b93 (import half) -- the real media:addPaths and library:importPaths handlers, captured off a mocked ipcMain, run over a 4 KB .mkv and a real 3-page .cbz that live OUTSIDE userData; every source file byte-identical (size:mtime:bytes) and still at its own path, twice, and the rows reference the ORIGINALS (media.path === VIDEO, library.sourcePath === MANGA, pageCount 3 so the archive really was read). Instrument control: a same-length rewrite, a move and a deletion each detected. -->
   **CLOSED 2026-08-31.** Both clauses measured. Two assertions, not one: byte-identity
   alone would pass an importer that copied and then referenced the copy, so the row's
   `sourcePath`/`path` is asserted against the original as well — the plan's decision (c),
   reference in place, checked rather than assumed.
25. **Watch picks up a live download.** A file appearing in a watched folder is recognised
   without a manual refresh, and the elapsed time is reported.
   <!-- status: closed; evidence: 2026-08-31 8c0796df (main) + 59e72c27 (renderer) -- main/filesApp/watch.ts over real chunked writes: a file appears, is refused while growing, and is announced at 4,096 bytes with elapsedMs 4,000 measured from firstSeenAt; a 60 s stall reports 63,000, not the 3,000 window. "Without a manual refresh" is driven with NO sweep call -- one fs.watch event, then the session's own re-check timer -- and on the renderer side by pushing main's broadcast into the production FilesApp, which forces an index rebuild nothing asked for and renders "ep99.mkv arrived after 4.2 s". Adverse controls: disarming the re-check turns 2 of 8 red, a non-silent baseline 1 of 8. -->
   <!-- decision: an event is a hint to look, never an answer. The LAST fs.watch event for a
        file arrives while it is still unstable and nothing further ever fires, so a sweep
        arms its own re-check while anything is pending -- and nothing at all when idle, so a
        permanently watched Downloads costs nothing at rest. -->
   <!-- finding, fixed: the baseline was silent only in intention. Every pre-existing file is
        a first sighting, so it was skipped and then announced as an "arrival" one sweep
        later -- adding Downloads would have reported nine hundred of them. The mtime rule
        (gate 31's slice) is what makes the baseline silent in fact; a file genuinely
        mid-write at baseline still has a fresh mtime and is announced for real when it
        finishes. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (twenty-first) Progress entry.
26. **A partial download is never ingested.** A `.crdownload`/`.part`/`.!qB` file, and a file
   still growing, are both ignored until complete — proven by watching one arrive mid-write,
   not by asserting the extension list exists.
   <!-- status: closed; evidence: 2026-08-31 f12f54de -- shared/filesApp/stability.ts; watched mid-write against real bytes on real disk with the scan running BETWEEN chunks: firstSighting -> stillGrowing -> refused at +2s -> tooSoon -> found 1 at sizeBytes 7168 (every byte written); 8 incomplete extensions each skipped by name with one finished file as the control; adverse control making a size change not restart the clock turns 3 of 14 red -->
   <!-- decision: stability is a COMPARISON, never a single reading — the observation carries
        the moment the size last changed, and any change (shrinking included, because clients
        that preallocate then trim would otherwise read as finished) restarts it. Also stated
        as a test: a scan with no ledger does not pretend to judge completeness. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (eighteenth) Progress entry.
27. **Ambiguity goes to review, not into the library.** A file the router settles only by
   guessing lands in the review queue; a high-confidence match may auto-import. Both paths
   demonstrated with a real file each.
   <!-- status: closed; evidence: 2026-08-31 30b13bfb (model) + 2e332b86 (surface) -- shared/filesApp/ingest.ts + components/filesapp/ScanReviewSheet.tsx; 34 tests. Real files through the production scanRoots/planForPath: .srt exact -> auto, .csv guessed -> review, .png ambiguous -> review carrying both real choices, a real Yomitan zip sniffed to exact -> auto, .xyz -> refused. The component's claims are asserted on the IMPORTER spies, not the DOM. Adverse control putting review rows in the auto pile turns 3 of 8 component tests red on "expected importPaths not to be called, called 1 times"; a second control (certain = settlement === 'placed') turns 8 of 26 model tests red. -->
   <!-- FINDING that shaped the design, recorded so it is not re-derived: `placed` is NOT
        the same as "safe to import unattended". `settlementOf` calls a single `likely`
        candidate `placed`, and `likely` is defined by fileRouting.ts as "best guess". A
        `.csv` is placed AND a guess. Reusing gate 23's settlement as the auto-import test
        would import every guess — exactly what this gate forbids — so disposition reads the
        router's CONFIDENCE instead. -->
   <!-- decision: the scan root is typed, not browsed. A Browse button opens a native OS
        directory dialog that nothing on this side can drive, so this gate's own evidence
        would then depend on a human clicking. Reversible: a Browse button can be added
        beside the field later without moving any of the sheet. -->
   <!-- decision: nothing imports until Import is pressed, INCLUDING the auto pile. "May
        auto-import" is the router's permission, not a licence for a scan to write to the
        library while the report is still being read. The scan stays read-only (gate 24) and
        the confirm is the one write. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (nineteenth) Progress entry.
28. **Paste a folder sorts all of it.** A pasted folder is walked recursively, archives are
   expanded far enough to classify their contents, and the report names placed / skipped /
   ambiguous with reasons.
   <!-- status: closed; evidence: 80034ac4 + 06087c12 + afeab217. Four claims, four
        measurements. PASTE (afeab217): live on real Windows with the real clipboard --
        `npx electron .../filesapp-trash-roundtrip.cjs --gate 28` prints GATE 28 LIVE: PASS.
        The user's own text clipboard was Explorer's "Copy as path" shape and resolved to the
        one real folder; a 90-wide padded FileNameW buffer resolved to the same 69-char path;
        a pasted FILE resolved to `season 1`, the folder it sits in. THREE CONTROLS, all
        firing: a path not on this machine -> 0 folders (not offered as an unreadable root);
        two lines of prose -> 0 candidates (no filesystem call per line); and the naive decode
        of the padded buffer is 90 chars against a 69-char path and `statSync` says it is NOT
        a directory -- so the NUL-strip is load-bearing, not decoration. The user's clipboard
        was captured and restored byte-identical (112 chars, compared, not assumed), and the
        write half REFUSES outright if a file selection is already held.
        RECURSIVE (main/filesApp/scan.ts:121,167): filesAppScan.test.ts:161 walks a real
        fixture -- 8 found recursively, 4 with `recursive: false`, difference exactly the 3
        subtitles and 1 video in `season 1`. The shallow scan IS the control.
        ARCHIVES (shared/filesApp/archive.ts): 50 tests across filesAppArchive.test.ts,
        filesAppArchiveScan.test.ts and filesAppScan.test.ts, on real .zip bytes.
        REPORT (06087c12): the production component renders the four piles from a paste --
        auto [ep01.srt, ep01.mkv], review [vocab.csv, page001.png], refused [notes.xyz],
        skipped [ep02.mkv.crdownload], each with its reason key; asserted in
        filesAppScanReview.test.tsx's gate 28 block, which scores `filesScan`'s ARGUMENT
        against a deliberately stale root in the field so "scanned the pasted one" cannot
        pass by scanning what was already there. 38 tests total on the paste half. -->
   <!-- decision: the clipboard is read in MAIN, not in the renderer's paste event. A folder
        copied in Explorer arrives as `FileNameW`, which the DOM cannot see at all, so a
        renderer-only handler finds an empty `clipboardData` and the feature looks BROKEN
        rather than absent. Parsing stays in shared/filesApp/clipboardPaths.ts so it is
        testable without Electron; main supplies only `statSync` and `dirname`. -->
   <!-- decision: a pasted FILE is answered with its parent rather than refused, and several
        pasted folders fill the field with the first and SAY SO rather than choosing. The scan
        takes one root; picking one silently is the quiet decision the review sheet exists to
        avoid. Ctrl+V inside the root field is left to ordinary text editing, or the field
        becomes impossible to correct by pasting a fragment. -->
   <!-- decision: this is a THIRD way in, not a reversal of gate 27's "the root is typed".
        A native directory dialog is still not something this side can drive; paste needs no
        dialog, which is exactly why it can carry live evidence. -->
29. **Re-scan is idempotent.** Running the same scan twice imports nothing the second time and
   says so — a duplicate library entry is a FAIL.
   <!-- status: closed; evidence: 2026-08-31 -- shared/filesApp/importLedger.ts + renderer/filesImportLedgerStore.ts + a fourth `known` pile in planIngest; 19 tests. "Says so": the production component scans, imports, scans again, and reports the 3 that landed under Already brought in with auto empty, while the refused .csv stays offerable; the second confirm calls NO importer and reports 0 of 1. "Imports nothing": the real media:addPaths and library:importPaths handlers, called twice with the same paths, return the same row counts and exactly one row per source. Undo forgets, so the files are offered again. -->
   <!-- decision: identity is path + SIZE, never path alone. A file replaced in
        place — a re-download, a better rip under the same name — is a different
        file and deserves to be offered again; the scan already has the size, so
        recognising that costs nothing. mtime is deliberately excluded: some
        copy tools change it while the bytes are identical, which would re-offer
        something genuinely already held. -->
   <!-- decision: `known` is its own pile rather than folded into `refused`. The
        user is being told something different — "you already have this", a
        previous run's success — and the disposition runs BEFORE the refusal so
        a file whose classification changed since is answered by history rather
        than re-judged into an import the importers would silently swallow. -->
   <!-- trap: `localStorage.clear()` does NOT isolate a test of this store. It
        keeps an in-module `memory` fallback so a quota error degrades to
        "forgotten on restart" rather than to "gate 29 stops working"; that
        fallback survives a cleared localStorage. Call `clearImportLedger()`. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (nineteenth) Progress entry.
30. **Referenced items behave.** Removing a referenced item from the library leaves the user's
   original file on disk; moving the original produces a reported broken link rather than a
   crash or a silent disappearance.
   <!-- status: closed; evidence: 2026-08-31 -- main/__tests__/filesAppReferenced.test.ts, 5
        tests on real files in a real temp tree whose media rows point OUTSIDE userData, which
        is what "referenced in place" means. Removing: the production deleteFilesItemInMain
        refuses with filesApp.delete.refuseNotTrashable, the user's bytes are still on disk and
        unchanged, and `trashItem` is a spy that THROWS if reached -- it is not reached, so the
        claim is "never called", not "called harmlessly". Moving: the row survives the rebuild,
        keeps its name and gains brokenLink:true, while the untouched neighbour does not gain
        it; putting the file back clears the flag, so it is derived per build and not stored.
        Two adverse controls: dropping the referenced->soft branch turns 2 of 5 red, and making
        brokenLink unconditional turns the other 2 red. -->
   <!-- note: `referenced` is what makes a row file-backed for Open and Reveal but index-backed
        for Delete. A generic `location.store === 'file'` branch in a future delete path would
        trash the user's own bytes; that is the single line this gate protects. -->
31. **The stability window is honoured and adjustable.** Setting it higher delays ingest of a
   file still growing by that amount; setting it lower does not bypass the completeness check
   entirely. Proven against a file arriving mid-write at two different settings.
   <!-- status: closed; evidence: 2026-08-31 3589c6fa (handler) + 41a678c0 (document) + 8ef06751 (controls) -- the production `filesapp:scan` handler, real files, real clock, ages set with utimesSync: one 10 s-old file refused as tooSoon at 30,000 ms and taken at 3,000; refused/taken either side of its own boundary at 20 s; a mid-write file refused at 0, 1, 3,000 AND 30,000; -5,000 clamps to 0 and still refuses; no settings at all means the default, not off. The window is typed in the scan sheet, survives a restart, and travels with every filesScan call. Adverse controls: dropping the evidence floor turns 2 of 22 red; pinning the sent window turns 4 of 9 component tests red. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (twentieth) Progress entry.
32. **Cleanup dry-runs before it acts.** Every cleanup class reports its count and reclaimable
   size first, and the report matches exactly what is removed when confirmed — item for item,
   not just in total.
   <!-- status: closed; evidence: 2026-08-31 ec0a57f9 (model) + b2d8ff95 (executor) + 4081c05b
        (surface) + b8052e6a (live) -- LIVE, real Electron + real shell.trashItem over a real
        temp userData: the dry run named exactly ["gate35 nothing.ja.vtt","gate35
        unfinished.mp4.part"] / 4,096 reclaimable bytes and removed nothing; the run's log was
        that same pair, item for item, every destination "recycle-bin". "Matches exactly" is
        enforced by planning TWICE and intersecting -- the user confirms ids from report A,
        main rebuilds report B from the live stores, and drift is NAMED in `skipped` (gone /
        protectedNow / notConfirmed) rather than acted on. 42 tests (23 shared + 19 main on
        real files). Adverse control: ignoring the confirmed set turns 1 main test red;
        dropping the unconfirmed-candidate accounting turns 3 shared red. -->
33. **Cleanup never touches irreplaceable material.** Point it at a library containing a
   downloaded video and every junk class; the video survives every class, including a scheduled
   run. A cleanup that can reach it is a FAIL regardless of settings.
   <!-- status: closed; evidence: 2026-08-31 ec0a57f9 + b8052e6a (live) -- LIVE: an 8,192-byte
        video in `downloads/` (which the downloads enumerator stamps `orphan: true` by
        construction, so this is the reachable mistake, not a hypothetical), every class
        enabled, and a run confirming ALL 3 ids the app knows about. Video still on disk, bytes
        byte-identical, listed in the report as protected with reason
        `filesApp.cleanup.protect.irreplaceableMedia`. In vitest the same holds under all three
        broken-link policies and under trigger 'scheduled' -- which is not a second code path:
        the trigger is a label on the result and both go through `planFilesCleanup`.
        LIVE ADVERSE CONTROL, the strongest available: with the single guard line disabled the
        probe prints "video survived: false" and then THROWS ENOENT reading its bytes. The
        video really does reach the Recycle Bin. In vitest the same edit turns 5 main tests red
        with the trash spy raising "GATE 33 VIOLATION" on the video's own path, and 5 shared. -->
   <!-- decision: the guard reuses `deletionRiskForKind` from the DELETE path rather than
        re-deriving risk, so cleanup and Delete cannot come to disagree about what is
        irreplaceable. It is keyed on the authoritative `kind`, never on a caller field: a
        `.part` row that CLAIMS kind 'video' is protected too (tested), and the main-side
        sweep gives fragments kind 'other' because `extOf('x.mp4.part')` is `.part`, which is
        in no media set. Calling a fragment a video would put the entire partial-downloads
        class permanently behind this guard. -->
   <!-- decision: `orphan-files` is OFF in DEFAULT_CLEANUP_SETTINGS. It is the 5.14 GB class
        (96 files in `downloads/`, 4 of them claimed by media.json, measured 2026-08-30); the
        user opts into it after reading a report, never by installing the app. -->
34. **Orphan detection is real.** Delete a video's file behind the app's back; the broken-link
   class finds exactly that record, names it, and the chosen policy (mark / prompt / relocate)
   does what it says.
   <!-- status: closed; evidence: 2026-08-31 b2d8ff95 + 4081c05b -- main/__tests__/
        filesAppCleanup.test.ts, real files in a real temp tree, media rows pointing OUTSIDE
        userData. Before the deletion the report has 0 candidates; `fs.rmSync` behind the app's
        back and it has exactly 1, named "Episode 01", class broken-links, mode soft (the bytes
        are gone; only the record remains), and the untouched neighbour media:v2 is not in it.
        Each policy does its own thing: `mark` -> 0 candidates, protected with reason
        brokenLinkMarked, the record survives still flagged; `prompt` -> removable but
        requiresConfirmation, and confirming calls the soft-delete adapter and returns an undo
        token; `relocate` -> `relocateBrokenLinkInMain` rewrites the media.json row and the
        row is HEALTHY on the next real `buildFilesIndex` (brokenLink undefined, location.path
        equal to the new file) with the next plan reporting 0 protected. Three refusals, each
        naming its own cause rather than failing vaguely: missingTarget (repointing at another
        missing path would move the break, not fix it), notBroken (a healthy row must not be
        silently repointed), unsupported (a scraper job, whose broken link is regenerable
        derived output). -->
   <!-- CORRECTION worth keeping: the first cut of this made a broken media row
        `location.store === 'json'` with a `/items/v1` pointer. It is not. `mediaEnumerator`
        builds media rows through `fileItem`, so they are store 'file' + `referenced: true`,
        and `fileItem` adds `brokenLink` when the stat fails. Relocate therefore keys off the
        row id (`media:<id>`), not a JSON pointer, and `RELOCATABLE_SOURCES` is the single list
        the UI offer and the executor both consult -- so the surface cannot offer a Relocate
        that must refuse. -->
35. **Cleanup is logged.** After a run, a log names each removed item and its destination, and
   Recycle-Bin-destined items are actually restorable from there.
   <!-- status: closed; evidence: 2026-08-31 4081c05b (the log file) + b8052e6a (live) --
        LIVE, through the real Windows shell: both removed files were found in the Recycle Bin
        BY THEIR ORIGINAL PATH and both came back on the bin's own Restore verb, the fragment
        byte-identical to what was written. The log names, per entry, the item, its class, its
        destination and the exact path the OS was asked to trash. A destination is one of
        recycle-bin / index-undo / failed, and a failure is logged as `failed` and contributes
        0 to removedBytes -- proven in vitest with a trashItem that throws: 2 calls, 2 failed
        entries, removedBytes 0. The log is a FILE under userData (files-cleanup-log.json,
        capped at 2,000 entries), not a toast: the gate asks that a binned item be restorable,
        and a user who closed the window still needs to know which file to restore. -->
   <!-- trap, already cost three runs on gate 21 and still true: `Get-ChildItem` cannot see
        into the Recycle Bin (use Shell.Application `Namespace(10)`), `GetDetailsOf(item, 0)`
        honours "hide extensions" so the extension must come from the $R stub's own `.Path`,
        and `JSON.stringify` is the WRONG quoter for a Windows path -- PowerShell's escape
        character is the backtick. All three are handled in the shared probe helpers; do not
        write a fourth copy. -->
   <!-- decision: gates 21, 32 and 35 all ask "did the bytes reach the Recycle Bin and can the
        user get them back", so the live evidence is a SECOND `--gate` mode on
        `probes/filesapp-trash-roundtrip.cjs`, sharing every helper, rather than a second
        probe. RULE 1: a new single-use probe is a defect. -->
   <!-- OPEN, deliberately: no SCHEDULED trigger fires today. `runCleanupInMain` takes
        trigger: 'manual' | 'scheduled' and gate 33 is proven for both, but nothing calls it
        with 'scheduled' yet -- there is no timer. That is a separate slice (a settings-owned
        interval plus a main-side timer), and gate 33's wording is satisfied because the
        scheduled path is the same function; gate 35 does not require a schedule at all. -->
36. **Per-category ingest overrides work.** With subtitles set to auto-import and video set to
   review, a folder containing both routes each one differently in a single scan.
   <!-- status: closed; evidence: 2026-08-31 30b13bfb (routing) + 41a678c0 (document) + 8ef06751 (controls) -- the production ScanReviewSheet's own per-destination selects: the SAME folder puts ep01.srt and ep01.mkv in one pile before the overrides and in two after; the video moved to review and skipped never reaches addMediaPaths, which it did on the identical run before; `auto` on deck-csv still cannot promote a guessed .csv past gate 27; both overrides survive an unmount + memory-reset restart and still route the scan. Adverse control dropping byTarget turns 3 of 9 red. -->
   <!-- decision: a category set to `auto` NARROWS and never widens — it cannot promote a
        guessed or ambiguous file past gate 27, or "auto-import subtitles" would repeal
        gate 27 for every file that happens to rank a subtitle first. Widening is the
        global `everything` confidence policy's job, and every row it promotes carries
        `warned: true` so the surface can say so. -->
   **CLOSED 2026-08-31.** See the 2026-08-31 (twentieth) Progress entry.
37. Full gates: `npx vitest run`, `node tools/i18n-check.cjs`,
    `node tools/architecture-audit.cjs`, `npx eslint <touched paths>`. `tsc --noEmit` is NOT a
    gate — 327 pre-existing errors; prove "no new" by set-difference.
    <!-- status: open; evidence: 2026-09-01 b8db81bd -- ONE failure, unchanged, and this turn
         finally names its MECHANISM instead of re-observing it. vitest: **996 files passed /
         1 failed / 1 skipped, 12,897 tests passed / 1 failed / 6 skipped** (+14: the popup
         DOM suite). i18n exit 0 at 12,115 keys. architecture exit 0, "Nothing new", 9 pending.
         eslint 0 on both touched paths. Set difference vs the inherited baseline: zero new.
         WHY IT CANNOT CLOSE FROM HERE, and it is not a flake: `tools/i18n-hardcoded-baseline.json`
         was created on 2026-08-11 by `478566fa` with SIX entries, generated from a working tree
         in which 27 components had already been converted -- but those conversions were never
         committed. So the ratchet on disk asserts a tree that HEAD has never contained, and
         committed HEAD has been red for three weeks. The main tree passes only because it still
         holds those 27 conversions uncommitted; `git status` on the baseline file itself is
         clean there, which is what makes this invisible from a status line.
         CONTROL, run this turn in a detached probe worktree: `node tools/i18n-hardcoded-check.cjs`
         at `feat/nyaa-subtitles` committed HEAD (2ee7c924) reports **27** offending files, exit 1.
         The same command in this worktree reports **27**, exit 1, and `diff` of the two sorted
         file lists is EMPTY -- the identical set. files-app contributes ZERO offenders, so no
         action on this branch can move this gate. It closes when the i18n track commits its 27
         files, or when someone re-baselines from a committed tree and says why.
         Baselining them from here would be WRONG: the tool also fails on `fixed` entries, so the
         moment that track lands, a baseline containing them goes red again.
         (superseded numbers from 2026-09-01 6c140279: 995 files / 12,883 tests passed / 1
         failed / 6 skipped -- up 21: 11 planner/status tests, 7 on the live model
         substitution, 3 on the popup's pre-click status call. i18n exit 0 at 12,115 keys.
         architecture exit 0, "Nothing new", 9 pending. eslint 0 on all 13 touched .ts/.tsx.)
         This run took TWO passes and the first one is the honest part of the record: the
         RE-MEASURED 2026-09-01 21:30 (primary2, after fab72cac): **1,005 files passed / 1 failed /
         1 skipped; 12,973 tests passed / 1 failed / 6 skipped**, exit 1 -- still exactly the one
         `i18n.test.ts > catalog hygiene` suite, still the same 27 components, and my three new
         desktop cases pass. i18n-check exit 0 at 12,115 keys; architecture exit 0, "Nothing new",
         9 pending; eslint exit 0 on both touched paths. WORTH NAMING because two concurrent
         workers now report this gate differently and BOTH readings are correct: a liquid turn
         reported i18n.test.ts absent from its failures, measured in the SHARED main tree, which
         still holds the 27 conversions uncommitted. This worktree is a clean checkout of the
         branch, so it reports the branch. The branch is red; the shared tree is green on someone
         else's uncommitted work. That is boss-audit Finding 1 verbatim, and it is why this gate
         must be read from a clean tree only.
         RE-MEASURED 2026-09-01 late (primary2, after 96a7b579): **1,009 files: 4 failed /
         1,004 passed / 1 skipped; 13,001 tests: 4 failed / 12,991 passed / 6 skipped**, 130.7 s.
         FOUR is not a regression and the re-run proves it: the same four files run ALONE give
         **1 failed / 62 passed of 63** -- flashcardAudio, extensionPopup and scraperSources all
         PASS in isolation, leaving the identical single `i18n.test.ts > catalog hygiene` / 27
         components. So gate 37 is UNCHANGED at exactly one real failure, still not files-app's;
         none of the four names any file this turn touched. NEW SIGNAL, and it is boss-audit
         Finding 4 widening: the three load-only failures carry durations of **24.4 s**
         (flashcardAudio) and **41.9 s** (extensionPopup) inside the full run, i.e. past the 20 s
         default, against ~1.5 s for scraperSources alone. Finding 4 named three whole-src sweep
         cases; these are three DIFFERENT suites with the same signature, so the instrument noise
         is broader than that finding recorded. TRAP for whoever measures this next:
         `npx vitest run > log; echo $?; tail log` reports the exit code of **tail**, not vitest --
         this run looked like exit 0 until the summary was read. Read the counts, never the code.
         i18n-check exit 0 at 12,115 keys; architecture exit 0, "Nothing new", 9 pending, and the
         new appProtocolResolve.ts module added ZERO findings; eslint exit 0 on all three touched
         paths (12 pre-existing non-null-assertion warnings in main.ts, 0 errors).
         first full run showed **2** failed, and the new one was mine --
         mediaLibraryListRow.test.ts scans mediaLibrary.css as raw text from the
         `@container medialib (max-width: 420px)` block to EOF with an unbounded `[\s\S]*?`,
         so the words `display` + `none` appearing in a CSS COMMENT 350 lines below the block
         satisfied it. `6c140279` rewords the comment rather than loosening the guard. Set
         difference against the inherited baseline after that fix: zero new failures.
         (superseded numbers from 2026-09-01 81004907: 12,862 tests, 12,113 keys)
         Re-checked the blocker at the top of this turn rather than inheriting it: the 27
         components are STILL dirty-and-mid-conversion in the main tree, so the finding below
         holds unchanged.
         (superseded numbers from 2026-09-01 f8a19c4e: 994 files / 12,841 tests) -- ONE failure
         left, down from four, and it
         is named and diagnosed. i18n exit 0 at 12,113 keys. architecture exit 0,
         "Nothing new", 9 pending. eslint 0 errors on the touched .ts/.tsx.
         Three of the four previous failures are GONE, each for a checkable reason:
           novelReaderCanvas.test.tsx (10) + novelReaderProgressGuard.test.ts (1) -- fixed by
             f104600b, which added the worktree's realpath'd node_modules to Vite's
             server.fs.allow. Green here now, so the trap note below is SUPERSEDED.
           scraperSources.test.ts -- passed this run and the previous one; the ENOTEMPTY
             temp-dir race is confirmed a flake, not a regression.
         THE ONE THAT REMAINS is i18n.test.ts's hardcoded-string ratchet: 27 files with zero
         i18n adoption, 763 strings. It is NOT unowned debt and MUST NOT be picked up here --
         **another track is already converting those exact files in the main tree,
         uncommitted.** Verified before writing a line: all 27 are dirty in
         C:\Users\Arseniy\Projects\jp-study-app, and the diffs are the conversion itself
         (PerfOverlay.tsx already renders `t('perf.title')`; ScraperPage.tsx is -744 lines).
         Doing it here would duplicate that work and guarantee a merge conflict on 27 files.
         So this gate closes when that work lands in a merge, not by any files-app action.
         The scanner is coarse in a way worth knowing: it flags a file only when it has ZERO
         `t(`/`useT(`/`sx(` adoption, so ONE converted string clears a file from the list --
         the count measures "never joined the system", not coverage. -->
    <!-- superseded 2026-09-01: the trap below described the novelReader failures as permanent
         in this worktree. f104600b fixed them; both suites are green here. Kept as the record
         of why they were once red. -->
         i18n exit 0 at 12,085 keys in all four languages. architecture exit 0, "Nothing new",
         9 known findings still pending. eslint on the 5 touched lintable paths: 0 errors.
         vitest: 982 files passed / 4 failed, 12,737 tests passed / 13 failed, and this time
         the four are NAMED so the set-difference is checkable rather than asserted:
         scraperSources.test.ts, novelReaderCanvas.test.tsx, novelReaderProgressGuard.test.ts,
         i18n.test.ts. Not one is a path this turn touched. scraperSources is a temp-dir
         cleanup race (ENOTEMPTY rmdir .../scraper/logs), i.e. a flake -- a first run the
         same night reported 3 failed / 12, so the count varies by one and 4 is the stable
         reading. IDENTICAL to
         the count this worktree inherited, so files-app added zero failures -- but the gate
         says green, and it is not, so it stays OPEN. The 4: novelReaderCanvas.test.tsx and
         novelReaderProgressGuard.test.ts fail on `Denied ID .../pdfjs-dist/build/
         pdf.worker.min.mjs?url` -- Vite server.fs.allow, because this WORKTREE resolves
         node_modules to ../jp-study-app/node_modules; they are green in the main tree, so
         this is environment, not code. Plus i18n.test.ts's hardcoded-strings baseline, whose
         27 named files are all other tracks' (ScraperPage 184 strings, ArcadeGames 71, ...);
         no files-app module appears in it. This gate cannot close from the files-app side
         alone: two of the four are a worktree artifact that a .gitattributes-style
         environment fix clears, and one is shared debt with the liquid track. -->
    <!-- trap: run the suite from THIS worktree and the two novelReader suites will always be
         red. Do not "fix" them here -- they are a node_modules resolution artifact and the
         edit would be a no-op against the real defect, which is that the worktree has no
         node_modules of its own. -->

## Decisions (user, 2026-08-16)

1. **Memory and statistics MOVE OUT of Settings entirely** — the Files app is their only home,
   not a second route. This is a deliberate, user-made exception to the not-a-gatekeeper rule
   below, and the only one: it applies to memory/statistics and nothing else. Settings loses
   those rows; `settingsRegistry.ts:169` / `:1078-1137` and their search entries must be
   migrated, not merely hidden, or search will keep pointing at a page that no longer holds them.
2. **The tree is what the app owns**, plus the import/reveal bridge above. No general disk browser.
3. **Notebook is deleted.** Confirmed — the user's words: it "loses its purpose with the folder
   app". Its features are absorbed, its notes migrate.
4. **Established apps keep their surfaces.** Music is the named example: listed and openable
   from the Files app, but the music app itself is untouched.

Still unconfirmed: the "60 stars" reading (starring/favourites). Isolated — build it last.

## The not-a-gatekeeper rule, and its one exception

Every route that works today keeps working; a capability that becomes Files-app-only is a
regression. The single carve-out is decision 1 above, which the user made explicitly. When those
two pull against each other anywhere else, this rule wins and the plan is wrong.

## Progress

### 2026-08-30 — primary2, worktree `jp-wt-filesapp`, branch `wt/files-app`

**The commits are on `wt/files-app`, NOT on `feat/nyaa-subtitles`.** Six, in order:
`733fa357` catalogue model · `088a8f9a` enumerators + IPC · `00d6ca02` the surface ·
`b5c20423` section wiring · `a5247e10` three wrong store shapes · `20742a49` guard fixes.
They need a merge or cherry-pick to reach the branch.

**Architecture, decided under standing auto-approval.** The folders are views, so the
model is three layers: `shared/filesApp/catalog.ts` (pure — tree, kinds, provenance,
locations, sort, counts), `main/filesApp/` (ten enumerators + `filesapp:index` /
`filesapp:reveal`), `renderer/components/filesapp/` (the surface, on
`LiquidAppScaffold`). The one decision worth not re-deriving: **enumerators take an
injected context (`userDataPath`, an `openDictionary` thunk) instead of calling
`app.getPath` inside each reader.** userData is 8.6 GB with no restore point and cannot
be fixtured if the path is baked in — injection is what lets `buildFilesIndex` run in
vitest against a temp tree, and in plain Node against the real profile, with no Electron.
Both were needed this turn. The thunk is a function, not a value, because opening
`dict.db` runs the migration ladder and an index build must not trigger that.

**Gate 1 — CLOSED, live.** `buildFilesIndex` over the real `%APPDATA%/jp-study-app`:
library 24, media 39, transcripts 2, yt-subs 0, exports 2, dictionaries 8, models 13,
artwork 1640, profiles 28, workspaces 4. **1,760 items, 45.52 GB, 0 broken links**, all
five groups non-empty — sources 65, outputs 2, reference 1661, system 28, workspaces 4.
The 8 dictionaries independently match this plan's own 2026-08-16 count.

**The finding that run produced, which fixtures could not.** Three of ten enumerators
first read 0 against full stores, and none failed loudly — each returned `[]` and gave
its category a permanent, plausible zero. `media.json` is `{ items, ... }`, not a bare
array (39 videos read as 0). `profiles.json`'s `profiles` is a **record keyed by id**
with a `label`, not a `name` (28 read as 0). The workspace store is
`agent/workspace-v1.json` with a `conversations` record, not `agent-workspaces.json`
(the whole group read 0). Root cause: every reader was written against a fixture the
same hand invented. `collectionValues()` now accepts array-or-record in one place,
because this app genuinely persists collections both ways. **Next worker: check the real
store's shape before adding an enumerator — a wrong guess here is silent.**

**Gate 13 — CLOSED.** `files` is registered in `DESKTOP_WIN_SECTIONS`,
`AGENT_NAVIGABLE_SECTIONS`, the label-key record, `AppSection`, the command palette,
main's `POPOUT_SECTIONS` + `ARGV_OPEN_SECTIONS`, and `AGENT_NAVIGATION_INDEX`. Its terms
are **`['files']` alone** — `agentNavigationIndexMirror` refuses words the destination
does not own, correctly: "library" and "transcripts" belong to the surfaces that hold
them, and an entry matching those would outscore an established destination. Tested both
directions: file requests resolve here, "library"/"music" still resolve to their own.

**Gate 14 — CLOSED at component level.** Sorting by size/date reorders in both
directions on the real component; a `null` sorts **last in both directions** (the arrow
reverses the rows that have a value, it does not promote the ones that do not), ties fall
back to name then id. Negative control: inverting that branch broke 4 tests across two
suites. Not yet driven in live Electron.

**Gate 12 — HALF closed.** The refusal half is proven: `revealTargetFor` returns `null`
for every non-file store, the Reveal button is **absent** for a SQLite dictionary row
rather than present-and-failing, and the inspector says why. The "opens its real location
in Explorer" half needs a live click and is NOT claimed.

**Gate 37 — run, and the tree is not green, which is not new.** Baseline at `aba52483`
already fails **13 suites / 33 tests**. Measured properly, in a throwaway worktree at the
base commit, by set-difference on test NAME rather than count. Five regressions were mine
and all are fixed; the final failing-name set is **byte-identical to baseline (34 lines
each side, `diff` clean)**. i18n-check exit 0 at 11,724 keys; architecture audit reports
nothing for filesApp; ESLint clean on every touched path.

Two traps banked for whoever is next. `theme/liquid-surfaces.css` puts `padding` on
`.lq-liquid`/`.lq-work` at (0,1,0) from a sheet that loads *after* a component import, so
a slot override must win by specificity (descendant-of-shell), not order. And
`virtualListSemantics` reads the **opening tag** — a row role inside an extracted
`useCallback` is invisible to it, so render rows inline like every other call site.

**Exact next slice:** gate 8 — migrate memory/statistics out of Settings
(`settingsRegistry.ts:183` and `:1101-1144` plus their search entries) into
`system/memory` and `system/statistics`, capturing the old numbers **before** removal and
comparing after. Those two leaves are the ones still reading 0 for a real reason.

### 2026-08-31 — primary2, `wt/files-app` — gate 1 CLOSED (second attempt)

Commits: `4e7f86a2` every subtitle store · `cf58d27f` downloads + drafts · `1d102ae6` the
renderer enumerator layer · `5657bc4f` the 27 decks. Harness:
`src/.coordination/files-app/census.ts` runs the **production** `buildFilesIndex` against
the real profile outside Electron — not a replica, so a drifting reader breaks the census.

**Gate 1 — CLOSED. 1,926 items, 50.17 GB, 14 enumerators, 0 broken links, 166 ms.**
The 2026-08-30 retraction was right and understated: the census had validated the five
non-empty groups, not every populated category. Five categories read 0 against real data.

| category | was | is | what was actually there |
| --- | --- | --- | --- |
| `sources/text` | 2 | 73 | 19 `media.json` subtitle records (7 of them sidecars *outside* `subtitles/`) + 4 unclaimed fusion tracks + 48 downloaded `.vtt` |
| `sources/video` | 37 | 81 | `downloads/` held 96 files / 5.14 GB, of which **4** were in `media.json` |
| `outputs/drafts` | 0 | 24 | `anki-draft-sessions.json` |
| `outputs/decks` | 0 | 27 | `anki-intervals.json` — 87,260 entries, 155,384 notes, 28 deck queries |
| `outputs/notes` + `/highlights` | 0 | renderer | the Notebook is in renderer `localStorage`; main cannot decode it |

**Every remaining 0 is now a measured statement, not an unexamined one.**
`sources/visual-novels` — `immersion/visual-novels.json` is `{entries: [], captures: []}`.
`workspaces/queue` — `transcription-jobs.json` is `[]`. `outputs/mined` — no per-card
store exists outside the Anki mirror; the mined cards ARE those 27 decks' notes.
`system/memory` + `system/statistics` — **gate 8's deliverable**, decision 1's sanctioned
migration; they are the only two zeros with work still owed to them.

**Decisions, under standing auto-approval:**
1. **Decks, not notes.** 87,260 note rows would grow the index ~46x and serialize all of
   it over IPC on every open — the plan's performance constraint forbids it. A deck is
   also the honest unit; the notes are Anki's, not this app's.
2. **A second enumerator layer in the renderer**, joined onto main's snapshot in
   `useFilesIndex` rather than a second index. It recomputes `counts` from the joined
   list, so a group can still never disagree with its leaves.
3. **Two new flags rather than a drop.** `orphan` marks a file this app wrote that no
   record claims — 4 fusion intermediates, and 92 downloaded-but-never-imported files.
   The tree must be reconcilable against the disk; hiding the difference is what made
   the first census wrong. Provenance of an orphan is `unknown`, never guessed: a
   fabricated trust mark would travel onto a mined card.

**TRAPS — each one cost real time and each one produces a confident wrong number.**
1. **`dictionaryDir()` is `userData/dictionary` — SINGULAR.** The plural opened nothing
   and printed `dictionaries 0`, indistinguishable from an empty store.
2. **Provenance is in the record, never the folder.** Provider downloads and Whisper
   output share one `subtitles/<mediaId>/` directory. Only `source`/`machineGenerated`
   knows which is which — `subtitleRecordProvenance()`.
3. **localStorage cannot be byte-scraped for a count.** Chromium Snappy-compresses the
   blocks, so a scan can find the key, find the array start, and still never terminate
   the JSON. It did. A count scraped that way is a guess; take it from the running app.
4. **leveldb elides shared key prefixes.** Searching for `jp-grammarx-notebook-timeline-v1`
   returns nothing while `grammarx-notebook-timeline-v1` is right there — `jp-` was
   shared with the preceding key. A whole-key search reads exactly like "no notes".
5. **The census reports only what MAIN sees.** `outputs/notes` will read 0 in that output
   forever. That is correct and is not a regression.
### 2026-08-31 — codexB, Gate 21 inspector integration checkpoint

Product commits: `f42f2860` adds the reusable inspector confirmation/Undo surface;
`1e192d1b` prevents a delayed delete receipt from leaking onto a changed selection;
`5b5ec40e` keeps the destructive confirmation on an opaque Liquid Work anchor.
Focused deletion boundary: **6/6 files, 48/48 tests**; touched-path ESLint **0 errors**.
Gate 21 remains open: primary2 must wire this control into `FilesApp.tsx` after sync-down,
then a self-created file must be trashed and actually restored from the Windows Recycle Bin.

### 2026-08-31 — codexA, Gate 9/21 main-lane checkpoint map

Product commits: `00d1648a` absolute target validation; `1f33f52a` typed preload bridge;
`e5664e2d` 18 localized deletion outcomes; `fe619969` browser adapter and result mapping.
Turn-wide gates after all four: **949/1** Vitest files, **12,271/6** tests, i18n **11,812**,
architecture **Nothing new**, ESLint **0 errors**. Gates 9/21 remain open for live integration.

### 2026-08-31 — codexA, Gate 9/21 absolute-target boundary

The privileged deletion boundary now refuses relative and drive-relative paths from a malformed
authoritative snapshot before `shell.trashItem` can run. Absolute Windows drive, UNC and POSIX
controls pass; **2 of 2** relative-path controls return the named failure with **0** trash calls
and **0** cache invalidations. Focused result: **11 of 11 tests pass**. Gates 9/21 remain open
until the merged Files inspector drives the bridge and one Recycle Bin fixture is restored.

### 2026-08-31 — codexA, Gate 9/21 typed renderer bridge

Preload now invokes the shared `filesapp:delete` channel with only the versioned request; the
renderer declaration returns the same validated result union. The source guard proves both
surfaces share the contract, **31 of 31** focused deletion tests pass, and the production preload
bundle builds from **26 modules**. Gate 21 remains open pending the inspector and live restore.

### 2026-08-31 — codexA, Gate 9/21 honest deletion copy

All **18** deletion interaction/result keys now exist in EN/JA/ZH/RU. Recycle Bin, soft-delete
with Undo, computed refusal, stale selection and failure are distinct messages; no raw key needs
to become the Files inspector's error UI. `i18n-check` passes at **11,811** English keys and the
catalog/deletion guard passes **16 of 16** tests. Gate 21 remains open pending live integration.

### 2026-08-31 — codexA, Gate 9/21 browser session outcomes

The renderer session now adapts the typed preload, returns a named result for a stale bridge,
and maps trash, soft-delete, failure, restored, expired and failed-Undo receipts to **19**
localized outcome keys. Focused deletion result: **34 of 34 tests pass**. The exact remaining
Gate 21 work is production inspector wiring plus one live trash-and-restore fixture.

### 2026-08-30 — codexA, Gate 1 renderer-store census and deck contract

Gate 1 remains **OPEN**. Debug-bridge evaluation against the running main renderer measured
`jp-flashcard-deck`: **3,238 cards / 2 folders / 1,334,057 bytes**, split dictionary 3, epub
3,218, media 17; `jp-grammarx-notebook-timeline-v1`: **23 rows / 3,973 bytes**, split audio 3,
translations 20. The worktree index has no localStorage contribution, so its 1,783-row receipt
omits at least 3,261 real rows. Empty output leaves were a finding, not an honest zero.

Decision: renderer-owned stores stay renderer-owned. Files reads them through their existing
pure parser/key/event contract and merges rows with the main snapshot in memory; shipping 1.3 MB
through an IPC round trip or adding a main-process LevelDB reader would create a second owner.
This checkpoint exports `FLASHCARD_DECK_STORAGE_KEY`, `FLASHCARD_DECK_EVENT`, the persisted
shape, and the exact over-encoding-aware parser used by the deck itself. Focused regression:
**28/28 passed** across the live-store draft and write suites. Next: after `wt/files-app` merges,
add the renderer contribution for deck cards and Notebook rows, then repeat the live receipt.

### 2026-08-30 — codexA, Gate 1 highlight-store contract

The renderer-store census also found **15** real highlights across 3 per-book keys (12 + 2 +
1); the main snapshot's `outputs/highlights` leaf is empty. The existing annotation owner now
exports its prefix, key builder, and legacy-compatible pure parser, and uses that parser for both
single-book and all-book reads. **12/12 focused tests passed**, including malformed-row and
unrelated-key negative controls. Gate 1 remains open pending the renderer/main snapshot merge.

### 2026-08-30 — codexA, Gate 1 scraper-history contract

The live main store has **10** authoritative scraper job summaries and **15** result files;
the production snapshot has 0 `workspaces/queue` rows. Scraper History now exports its index and
results locations plus one legacy-preserving parser used by both History and future Files reads.
A valid JSON document with the wrong shape now returns 0 instead of throwing. **11/11 focused
tests passed**. Gate 1 remains open until the 10 indexed jobs join the production snapshot; the
5 unindexed result files stay named as orphans rather than being falsely promoted to jobs.

### 2026-08-30 — codexA, Gate 1 Reading Lens history contract

The live `reading-lens-history.json` contains **42** validated capture rows (35 screen, 7
clipboard, 2 pinned) and is absent from the production Files snapshot. Its main-process owner
already exposes the validated synchronous list; this checkpoint exports the established file
location so Files can retain the honest JSON pointer instead of guessing a second filename.
The existing Reading Lens IPC/history suite is the regression gate. Gate 1 remains open.

### 2026-08-31 — primary2, `wt/files-app` — gate 1 CLOSED (third attempt, 5,263 items)

Commits: `c2f349f2` merge of codexA's store contracts · `709b9d14` the four missing
enumerators · `4cc87a08` the transcription queue + `rendererCensus.ts`.

**Gate 1 — CLOSED. 5,263 items, 20 enumerators (17 main + 3 renderer), 0 broken links.**
Both retractions were correct and both are now resolved. The second one — codexA's — found
four populated stores with **no reader at all**; the index had been measured only on the
side that happened to have one.

| store | rows | side | who could see it |
| --- | --- | --- | --- |
| `jp-flashcard-deck` | 3,238 cards + 2 folders, 1,334,057 B | renderer | localStorage; main never |
| `jp-grammarx-notebook-timeline-v1` | 23 | renderer | localStorage; main never |
| `jp-annotations:*` (3 book keys) | 15 | renderer | localStorage; main never |
| `scraper/history.json` + `results/` | 15 = 10 jobs + 5 orphan results | main | had no reader |
| `reading-lens-history.json` | 42 | main | had no reader |
| `transcription-jobs.json` | 0 | main | had no reader; store really is `[]` |

Every renderer figure was re-measured **through the production enumerators** and matches
codexA's independent bridge measurement exactly — different instrument, same numbers.

**The zero that had been explained rather than checked.** `outputs/mined` read 0 with the
justification "no per-card store exists outside the Anki mirror; the mined cards ARE those
27 decks' notes". That was wrong. `jp-flashcard-deck` *is* the per-card store — 3,238 rows
— and it is renderer-owned, so the main-only census could never have contradicted it. A
justified zero is only as good as the store it was checked against.

**The four remaining zeros, each measured this turn:**
- `sources/visual-novels` — `immersion/visual-novels.json` is `{version, entries: 0, captures: 0}`.
- `workspaces/acquisitions` — **a finding.** No acquisition store exists anywhere in `main/`
  or `shared/`; the pipeline is in-memory only, so an in-flight acquisition survives nothing.
  Structural, not an unread store. Gate 25 will need this.
- `system/memory` + `system/statistics` — gate 8's deliverable, decision 1's sanctioned
  migration. The only two zeros with work still owed.

**Decisions, under standing auto-approval:**
1. **Deck cards go to `outputs/mined`, deck folders to `outputs/decks`** — the store holds
   both and they are different things. This does not disturb the earlier "decks, not notes"
   decision, which was about the *Anki* mirror's 87,260 note rows and still holds.
2. **Two constants moved `main/` → `shared/`** (`SCRAPER_HISTORY_INDEX_FILE` and siblings →
   `shared/scraperHistoryStore.ts`; `READING_LENS_HISTORY_FILE` → `shared/readingLensHistory.ts`),
   both re-exported so no importer changed. Forced: their owners import `electron`, and the
   index is bundled and run *outside* Electron by the census. The alternative — a second copy
   of each filename in the enumerator — is the drift these contracts exist to prevent.
3. **Provenance is mapped, never inferred.** The deck says `transcript` where the catalogue
   says `whisper-transcript`; an **absent** value becomes `unknown`, not `book-text`, because
   the field is additive and thousands of cards predate it. OCR captures are `auto-captions`
   (a machine read them and can have misread); clipboard captures claim nothing.

**TRAPS.**
1. **`export { X } from '…'` does NOT bind `X` locally.** `clearScraperHistory` uses the
   constant in the same file that re-exports it; 15 tests failed on a `ReferenceError` that
   looks nothing like a missing import. Import *and* re-export.
2. **The bridge `/eval` body key is `js`, not `expression`.** A wrong key returns
   `{"ok":false,"error":"missing js"}` with HTTP **400** — not 200-with-null, so it is
   catchable, but the message names the field you omitted rather than the one you sent.
3. **`countByCategory` returns `own`/`total`, never `count`.** `c.count` is `undefined`, and
   `expect(undefined).toBe(0)` is the only thing that catches it.
4. **A fresh SRS state carries `lastReviewedAt: 0`**, which is a real epoch. Read literally,
   every never-reviewed card sorts as 1970 instead of with the nulls.
5. **`rendererCensus.ts` needs the raw store STRING**, not a parsed object — it feeds
   `parseFlashcardDeckStore`, which unwraps the legacy over-encoding. Parsing first would
   silently skip that repair and drop cards.

### 2026-08-31 — primary2, `wt/files-app` — gate 2 CLOSED, and the turn's gate 37

`86e9cb41` — gate 2's *search* half, which `a37d4c5e` correctly declined to claim.

**Gate 2 — CLOSED.** `matchesQuery` folded with `toLowerCase()` alone, a Latin rule that
does nothing to a Japanese title. The real transcript on this profile
(`…【オノマトペ3】#286`) was not found by a user typing `２８６` from a Japanese IME, nor
by anyone typing the reading in hiragana. Both fixed with NFKC + `kataToHira` on both
sides, reusing `kanaEquals`'s fold (`langs.ts:132`) rather than inventing a second one.
Negative control **on the fix**: restoring `toLowerCase()` fails exactly the width/kana
test, 1 of 25. Negative control **on the search**: a word the title lacks, a wrong kind
and a wrong provenance all miss.

**Gate status tags added**, so the count stops being re-derived from prose every turn.
Format matches the liquid plan's: `<!-- status: closed|open; evidence: … -->` under the
gate's own text. Count with `grep -o "status: [a-z]*" src/FILES_APP_PLAN.md | sort | uniq -c`.
**Now 4 closed (1, 2, 13, 14) / 1 open (12, half) / 32 untagged.** A stray-marker trap:
`^\d+\. ` also matches the Decisions and Traps lists, and inserted 5 markers outside the
Gates section on the first run — anchor on the Gates section, not on the numbering.

**Gate 37 — the four full gates, run once after the last slice.**
- `npx vitest run`: **13 suites / 33 tests failed, 11,931 passed, 6 skipped.** Identical in
  shape to the recorded `aba52483` baseline, and proven by NAME, not count: every one of the
  33 is a liquid/L6/L8/NovelReader/Settings/Statistics/Media-Center or tooling test.
  **Zero contain `filesApp`** — checked mechanically, not by eye.
- `node tools/i18n-check.cjs` — exit 0, **11,724** keys complete. This turn added no UI string.
- `node tools/architecture-audit.cjs` — exit 0. Its two unclassified findings
  (`readingDiscoveryActions.ts` orphan, `TourOverlay.tsx` test-only) are both other tracks'
  modules. `shared/scraperHistoryStore.ts` is imported by two modules, so it is not an orphan.
- `npx eslint` on all 11 touched paths — **0 errors, 0 warnings.**

## 2026-08-31 (third) — Gate 3 closes: one-click mine, on the real corpus

**Gate 3 CLOSED, `d17d138b`.** Three layers, one writer each: main reads bytes
(`main/filesApp/mineSource.ts`), `shared/filesApp/mining.ts` turns passages into drafts,
the renderer writes the deck. Main returns **passages, never cards** — the deck is renderer
localStorage, so a main-side "mine" handler would have nowhere to write.

Measured on the user's own files, not a fixture. Numbers, per kind:

| kind | file | read | cards | prov | scene |
| --- | --- | --- | --- | --- | --- |
| transcript | `B73sEyA0wbs.json` | 85 | 85 | `transcript` | `03:46` |
| transcript | `T-5_dUq-oyo.json` | 86 | 86 | `transcript` | `00:05` |
| subtitle | Podcast #38 `.ja.vtt` | 210 | 200 (+10 over cap) | `human-subs` | `00:05` |
| subtitle | Podcast #28 `.ja.vtt` | 177 | 176 (1 dup) | `human-subs` | `00:05` |
| subtitle | Podcast #24 `.ja.vtt` | 204 | 200 (1 dup, 3 cap) | `human-subs` | `00:05` |
| book | 悪の教典 下 | 6,603 | 200 (23 notJa, 8 dup) | `book-text` | ABSENT |
| book | 魍魎の匣 | 16,787 | 200 (1 notJa, 20 dup) | `book-text` | ABSENT |
| book | ゴールデンスランバー | 9,517 | 200 (5 notJa) | `book-text` | ABSENT |

`drafts + notJa + dup + overCap == read` is asserted, so no passage disappears unaccounted.
`scene=ABSENT` on books is the point, not a gap: an epub sentence has no timing and must not
be given a fabricated zero. **Negative controls, real files that must refuse:** two MP4s
(61.1 MB / 137.0 MB) as subtitle → `tooLarge`; the same MP4 as book → `notEpub`.

**A defect this gate exposed in the ANALYZER, fixed here.** `splitSentences` split on
`(?<=[。！？!?.])\s+` — whitespace REQUIRED after the terminator. Japanese writes none, so
Japanese prose never split at all, and since `sampleSentence` is whatever chunk a token was
found in (three call sites in `mining.ts`), **every card mined from a Japanese book carried a
whole paragraph as its example sentence.** On the same three real books: **3,195 → 6,603 /
6,665 → 16,787 / 3,068 → 9,517** (2.1× – 3.1×). ASCII `.!?` still require the space, which is
what keeps `example.com` and `3.5` intact — that asymmetry is the fix, and it has its own
negative-control test.

TRAPS, both cost time this turn:
1. **`extractEpubSections` puts the section HEADING in `section.text`.** The first sentence of
   every chapter is `第一章 吾輩は…`, not `吾輩は…`. The title is *also* on `section.title`.
   A test asserting the bare sentence fails and looks like a splitter bug.
2. **A state updater is not a place for a deck write.** React double-invokes updaters in
   StrictMode; undo must read `mineState` outside `setMineState`.
3. Vitest's config **suppresses `console.log`** — `--silent=false` does not restore it. Write
   measurements to a file.

**Gate tags now: 5 closed (1, 2, 3, 13, 14) / 1 open (12, half) / 31 untagged.**

## 2026-08-31 (fourth) — Gates 4 and 5: derived state, and the way in

**Gate 4 CLOSED, `940cbbab`.** Placement was already derived; *state* was not. A transcript
row knew what it was and the video it belongs to knew nothing, because `yt-transcripts/` and
`downloads/` are read by two enumerators that never see each other's output.
`deriveCrossStoreFlags` runs once over the assembled index — inside an enumerator it would
make that enumerator a second reader of a store it does not own, and the two would drift.

Live, on the real profile: **1,977 main-side items, 83 media rows, 49 with a derivable
YouTube id, 2 transcripts → exactly 2 videos marked**, and they are the two the transcripts
name. **Negative control: the same derivation with the transcript rows removed marks 0.**

**The first control was WRONG and is recorded so nobody rebuilds it.** It re-ran the
derivation over `buildFilesIndex`'s *already-derived* output — which preserves the very flag
it was meant to test — and reported 2, a pass that proved nothing. The real control strips
the flag back off first. This is the `receipt-must-not-requery` shape in a new place.

A video with no derivable id is left **ABSENT, not false**: "we could not tell" and "not
transcribed" are different answers, and only one of them justifies a Transcribe button.
`youtubeIdFromFileName` takes the LAST bracketed 11-char group, so a title's own `[4K]` or
`[ENG SUB]` cannot be mistaken for an id.

**Gate 5 CLOSED, `504f7863`.** The reader's Study menu opens the Files app on the book it is
showing. Two things were decided here and both are load-bearing:

1. **The scope travels BESIDE `os:open`, not inside it.** `detail` is a bare section string
   and four hosts listen — DesktopShell, MiniShell, the `?popout=` window, Blanc. A richer
   detail needs all four changed in lockstep or is silently dropped by the ones that were
   not, which is the failure that reads as *"the button does nothing on Blanc"*.
2. **Two delivery routes, because there are two states.** A closed window mounts and reads
   the parked scope; an already-open window re-renders nothing, so a `filesapp:scope` event
   carries it. Without the second, the gesture works once and looks dead every time after.

Scope shows the WHOLE folder and merely highlights the focused row — a filter, not a mode —
and is consumed on read, or the next plain open silently inherits the last caller's filter.
An unrecognised category is REFUSED rather than opened unscoped.

TRAPS:
1. **`peekPendingFilesScope` must be pure.** React double-invokes lazy initialisers in
   StrictMode; a consuming read there hands the second call `null` and loses the scope.
2. **The reader toolbar is at 11 of a bar of 12** (rubric category 5). New reader controls go
   in the `<details>` Study menu — which, being plain HTML, renders under every material set
   where the AppChrome menu bar does not.

**Gate 37 — the four full gates, run after the last slice.**
- `npx vitest run`: **13 suites / 33 tests failed, 11,990 passed, 6 skipped.** Same shape as
  the `b5da8f76` baseline (13 / 33). Proven by NAME: **zero contain `filesApp`**. The 11
  `novelReaderCanvas` / `novelReaderProgressGuard` failures are the one real risk, because
  this turn edited `NovelReader.tsx` — so they were re-run against **`940cbbab`, the commit
  before that edit, and fail identically (11 of 11).** Cause is environmental:
  `Denied ID …/pdfjs-dist/build/pdf.worker.min.mjs?url` and `AudioContext is not defined`.
- `node tools/i18n-check.cjs` — exit 0, **11,748** keys. 32 new strings in all four languages.
- `node tools/architecture-audit.cjs` — exit 0. **Six** unclassified findings now, up from
  two: `AeroViewport`, `blancMasterSources`, `captureKindKeys`, `companionAssignments`,
  `readingDiscoveryActions` (orphans) and `TourOverlay` (test-only). **All six are other
  tracks' modules; none is a files-app path.** Whoever owns aero/blanc should baseline them.
- `npx eslint` on all 13 touched paths — **0 errors.** The 9 warnings are pre-existing
  non-null assertions in `NovelReader.tsx` at lines 1655–2166, far from this edit.

**Gate tags now: 7 closed (1, 2, 3, 4, 5, 13, 14) / 1 open (12, half) / 29 untagged.**

## 2026-08-31 (fifth) — Gate 6 closes: nothing became Files-app-only

**Gate 6 CLOSED.** `src/shared/filesApp/routeParity.ts` — **29 rows, 22 `preserved` / 7 `new` /
0 `migrated`** — plus `shared/__tests__/filesAppRouteParity.test.ts`, 11 tests, which re-derives
every row from a file the table does not own rather than restating it.

**The regression half, measured backwards.** The branch is `93b85109..f0b883de`, 8,288 insertions
and **111 deletions**. Every deletion was read:
- `preload.ts` 49 — a reorder. The 13 removed `api` keys were extracted mechanically and **all 13
  still exist at HEAD**; a fabricated key correctly reported MISSING (control).
- `scraper/history.ts` 37 — moved to `shared/scraperHistoryStore.ts` (54 added) and re-exported
  from `history.ts:30-40`.
- the remaining 8 — two `ARGV/POPOUT` list lines reflowed to append `'files'` (nothing dropped,
  the diff is `+ 'files'`), three path constants moved to shared modules, `READING_LENS_HISTORY_FILE`
  moved, and `splitSentences`'s signature + regex (the analyzer fix).
**Zero routes removed.** The Files app has so far been purely additive.

**The forward half, route by route.** 20 stores = 17 main + 3 renderer enumerators, scanned from
both registries so a new enumerator without a parity row fails the test. 19 of 20 are `preserved`
with a section that `AppSection.tsx` actually routes and a symbol the named file actually contains.

**The one FINDING, and it is favourable.** `transcripts` is `new`, not preserved — and the reason
is a real defect in the pre-Files app: **`yt-transcripts/<id>.json` was WRITE-ONLY.**
`ytPlaylists.ts` uses `transcriptPath` exactly three times — the definition (:62), an `existsSync`
that sets `transcribed: true` (:256), and the write in `yt:markTranscribed` (:772). **No handler
ever reads the cues back**, and `grep -rn markTranscribed src` finds one renderer call site
(`MediaContent.tsx:893`) which writes from in-memory cues at the end of a Whisper run. So in-session
the cues are live in `MediaContent` state and mineable through the player panel; **after a restart
they were unreachable.** The Files app is the first reader of that store. That is an added
capability, not a moved one — it cannot fail gate 6, and the row says so in words.

**The permitted exception, named as the gate requires: memory/statistics (decision 1) IS NOT IN
USE.** Gate 8 has not landed, both still render in Settings, and `notebook` is still `preserved`
at the Notebook section. The test asserts `migrated` is currently **empty** and that
`FILES_PERMITTED_MIGRATIONS` is exactly `['memory','statistics']` — so gates 7 and 8 cannot land
their removals without flipping those rows, and cannot flip a row for anything else.

**Six negative controls, each run through the same `checkRow` the real rows use:** a missing
module, a symbol absent from the named module, a section `AppSection` does not route, a `new` row
smuggling in a section, a `migrated` capability outside the whitelist, and dropping one row from
the coverage set. The honest control row passes; all six falsifications fail.

TRAP for gate 7: `notebook`'s parity row is the one that must change, and changing it to
`migrated` will FAIL the whitelist check on purpose — `notebook` is not `memory` or `statistics`.
Gate 7 absorbs Notebook's features rather than moving a capability into Files-only, so those
features stay `preserved` and point at their new homes; if any of them genuinely cannot, that is
the gate-7 finding and it must be reported, not whitelisted.

## 2026-08-31 (sixth) — Gate 7a: the five Notebook streams Files could not see

Gate 7 has two halves. This turn landed the ABSORPTION half; the DELETION half is surveyed
below and is what the next turn opens on.

**What was missing, counted.** `notebook/aggregate.ts` merges **twelve** streams into one
timeline. Seven already had a Files reader — `flashcards`/`mining` via `local-deck`, `anki` via
the main `decks` and `drafts` enumerators, `highlights` via `highlights`, and
`ocr`/`audio`/`extension`/`media` via the timeline store `notebook` reads. **Five had none at
all**: saved words, dictionary lookups, translations, known words, the clipboard. Deleting the
Notebook section without them would have removed a capability, not absorbed one.

`2b67e679` — five renderer enumerators. **17 main + 8 renderer = 25 sources**, up from 17 + 3.
Each uses the owner's own loader and the owner's own key; `LOOKUP_HISTORY_STORAGE_KEY` and
`TRANSLATION_HISTORY_STORAGE_KEY` are newly exported for that, on codexA's expose-the-contract
pattern — two literals drift, one does not.

Three decisions, each recorded where the next worker hits it:
1. **`createdAt` is never synthesised.** `aggregate.ts` gives a known word
   `Date.now() - level * 1000` purely so the timeline can sort it. That number means nothing and
   a Date column showing it would be showing an invented value. It stays `null`; gate 14 already
   sorts nulls last in both directions.
2. **Every absorbed row is `app-generated`.** Provenance in this catalogue is a claim about how
   *text* was produced, and none of these records is mined text. Stamping `book-text` on a lookup
   because its context sentence came from a book would put a trust mark on a row making no claim.
3. **Clipboard `pinned`/`favorite` are NOT mapped.** There is no `starred` in `FilesItemFlags`
   and gate 18 owns Favorites; borrowing `referenced` or `enabled` would put a wrong word in a
   column that means something else.

**A module that could not be imported at all.** `knownWords.ts` registered a `storage` listener
and an `onStudyLangChanged` subscription at module scope, both reaching `window`. Outside a DOM
that is not a failing assertion, it is an import-time `ReferenceError`. Guarded; in a renderer
`window` always exists so behaviour is identical.

**10 new tests, two of them controls.** Malformed rows drop rather than render blank — AND the
same readers still produce rows for well-formed input, so the drop assertions cannot pass on a
reader that returns `[]` unconditionally.

**The parity table is currently test-only, and that is recorded as debt, not hidden.**
`architecture-audit` correctly flagged `shared/filesApp/routeParity.ts` as reachable only from
its test. It is baselined **`pending`**, not `accepted`: the natural app consumer is the per-item
"also reachable in \<section\>" affordance that gates 10 and 12 both want, and when that lands
the entry comes out rather than being re-justified. Only that one entry was added by hand — the
other **15** unclassified findings are media/aero/blanc/scraper orphans and were left alone.

### Gate 7b — the deletion half, surveyed so the next turn can start editing

`'notebook'` as a **section id** appears at **24 non-test call sites**, in five groups:
- **section registries** — `shared/desktop.ts:29`, `shared/agentNavigation.ts:64`,
  `shared/agentNavigationIndex.ts:108`, `main.ts:132` and `:1335` (ARGV / POPOUT),
  `main/extensionServer.ts:161`, `main/osHotkeyHelper.ts:76`;
- **the renderer switch** — `AppSection.tsx:118` and its `NotebookView` lazy import;
- **entry points** — `CommandPalette.tsx:63`, `DesktopShell.tsx:123`/`:206`/`:430`,
  `desktopIconPresets.ts:39`/`:62`, `extensionBridgeUi.ts:113`/`:134`,
  `settingsRegistry.ts:629`;
- **hand-offs INTO it** — `TranslateView.tsx:168`, `TranslateContent.tsx:306`,
  `MediaCenterView.tsx:155`, `media/StudyBlocks.tsx:32`, `notebook/aggregate.ts:182` (`href`);
- **Blanc's own tool**, which is a SEPARATE surface — `BlancShell.tsx:852`/`:921`/`:1131`,
  `BlancStudyPanels.tsx:629`/`:695`. Deleting the Study OS section does not delete Blanc's
  `notebook` tool, and conflating them would break Blanc.

Plus all four i18n catalogs (`notebook.*`, `palette.section.notebook`).

**The one feature with no home yet: `LiveCaptionsPanel`.** `NotebookView.tsx:63` is its only
mount. It is a *capture* control, not a file, so it does not become a Files row — it needs a real
destination or its deletion is a regression. Decide and record that before touching the registries.

**The parity table is the guard.** `notebook`'s row is `preserved` at the Notebook section and
the test re-derives that from `AppSection.tsx`'s own `case 'notebook':`. Deleting the case fails
the test until the row is changed — and changing it to `migrated` fails the whitelist too, since
`notebook` is not `memory` or `statistics`. That is deliberate: gate 7 absorbs features rather
than moving a capability into Files-only, so each one must point at its new home, and anything
that genuinely cannot is the gate-7 FINDING and gets reported.

**Gate 37 — the four full gates, run after the last slice.**
- `npx vitest run`: **13 suites / 33 tests failed, 12,009 passed, 6 skipped.** Byte-identical
  shape to the `f0b883de` baseline (13 / 33). **Zero contain `filesApp`.** Several are this
  worktree's CRLF: `statisticsLiquidRegions` fails `expected '/*\r\n…' to contain '…\n…'` — the
  CSS-parsing guards were written in the LF main tree.
- `node tools/i18n-check.cjs` — **exit 0, 11,748 keys.** No new strings this turn: enumerators
  produce row names from the store's own data, which is study content and is not translated.
- `node tools/architecture-audit.cjs` — **exit 1, 15 unclassified**, all
  media/aero/blanc/scraper orphans. Mine was the 16th and is now baselined; the CLI no longer
  names `routeParity`. Correcting the previous entry: it reported "exit 0, 6 unclassified" —
  the real figure at that commit was 15, and the test has been failing on them for several turns.
- `npx eslint` on all 7 touched paths — **exit 0, 0 errors, 0 warnings.**

**Gate tags now: 8 closed (1, 2, 3, 4, 5, 6, 13, 14) / 1 open (12, half) / 28 untagged.**

## 2026-08-31 (seventh) — Gate 7 CLOSES: the Notebook is deleted, its streams accounted for

`92bd3e06` Live Captions rehomed · `63a83468` the section deleted · this entry + the
absorption ledger.

**Gate 7 — CLOSED.** Notebook is gone from 20 call sites in 14 modules; `NotebookView.tsx`
is deleted; `node tools/i18n-check.cjs` exits **0 at 11,747 keys**.

**The count gate 7 asks for, measured live through the bridge on the running app**
(`aggregateNotebook(await loadNotebookSources())`, PID 2040, read-only, probe global deleted
after): **3,349 entries across 13 populated streams.**

| stream | live n | Files enumerator | still shown by |
| --- | --- | --- | --- |
| mining | 3,218 | `local-deck` | flashcards |
| translations | 40 | `translations` | translate |
| lookups | 36 | `lookups` | dictionary (desktop widget) |
| flashcards | 17 | `local-deck` | flashcards |
| highlights | 15 | `highlights` | novels |
| plan | 6 | **none** | novels |
| clipboard | 6 | `clipboard` | library (global panel) |
| ocr | 4 | `library` | library |
| audio | 3 | `local-deck` | flashcards |
| extension | 3 | `library` | library |
| saved-words | 1 | `saved-words` | flashcards |
| anki | 0 | `local-deck` | anki |
| known | 0 | `known-words` | stats |
| transcript | 0 | **none** | reading |
| media | — | `media` | player |

`flashcards + anki + mining + audio = 3,238`, which is exactly gate 1's measured
`jp-flashcard-deck` row count. Different instrument, same number.

**Two index gaps, named rather than rounded away.** `plan` (6 rows, the Jiten "plan to read"
store) has no Files enumerator at all — its own `href` always pointed at Novels, which still
owns it, so no route was lost and this is an index gap for a later enumerator. `transcript`
is main-process live-caption state; gate 7b/1 moved its panel to Reading rather than into
Files, deliberately.

**A 15th stream nobody had counted.** `NotebookStream`'s union carries `'media'`, which is
absent from `NotebookContent`'s `STREAM_KEYS` — so no view ever asked for it and no
aggregator ever emitted one. Auditing against `STREAM_KEYS` would have missed it; the
ledger's vocabulary check reads the **type**, which is how it surfaced.

**Decisions, standing auto-approval.**
1. **`LiveCaptionsPanel` → `ReadingCapturesView`**, as a second `ReadingCanvas` tool. NOT the
   Files app: that would have made the app's one capture-arming control Files-app-only, which
   gate 6 forbids. i18n namespace followed it (19 keys × 4 catalogs, `notebook.liveCaptions.*`
   → `reading.liveCaptions.*`).
2. **The `notebook` parity row flips to `migrated`** and joins `FILES_PERMITTED_MIGRATIONS`.
   The rule that forced it is now written into `routeParity.ts`: **a route counts as
   `preserved` only in the DEFAULT shell.** Blanc is opt-in, so scoring it `preserved` on
   Blanc's untouched `notebook` tool would have let the whole deletion go unrecorded.
3. **Every legacy `notebook` id is aliased, never rejected** — `LEGACY_WIN_SECTION_ALIASES`
   for persisted layouts, `--open=`/`--popout=`, the OS hotkey config, the browser extension
   target, and an Agent search term on the `files` entry.
4. **`files` was added to `DesktopShell`** (`APPS`, the Start study group, both icon presets)
   and to `osHotkeyHelper`'s `OPEN_SECTIONS`. It had shipped reachable only from the command
   palette and the Agent; removing Notebook without it would have left the desktop no way in.

**TRAPS.**
1. **The parity test's first assertion pins capabilities 1:1 to enumerator `source` ids**, so
   the `notebook` row cannot be decomposed into `notebook.timeline` etc. The finer question
   belongs in `shared/filesApp/notebookAbsorption.ts`, which is what it is for.
2. **`perl -0pi -e` silently no-ops on this worktree's CRLF files.** It reported success and
   changed nothing; the edit only landed once the pattern was CRLF-aware. Check the file after.
3. **`notebookLiquidRegions.test.ts` still fails 3 CRLF assertions here** and passes in the
   LF main tree. Pre-existing (known memory), not from this gate.

**Gate 37 — the four full gates, after the last slice.** See the closing paragraph below.

**Gate tags now: 9 closed (1–7, 13, 14) / 1 open (12) / 27 untagged.**

### 2026-08-31 (eighth) — Gate 8's "before" capture, taken while it can still be taken

Gate 8 requires the memory/statistics numbers "captured **before** removal and compared
after". Once `settingsRegistry` loses `pageId: 'memory'` there is nothing left to compare
against, so the capture is the FIRST slice of gate 8, not the last. It is now committed at
`src/.coordination/files-app/gate8-before.json`.

Measured through the running app's bridge, read-only, **without navigating it** — that app
is the liquid track's live instrument and its handoff records an exact restored state. Every
value comes from the same call the page itself makes (`navigator.storage.estimate()`,
`window.api.systemGetMetrics()`, `listSettingsDomains()`, `getSummary()`,
`listKnownEntries()`), not from reading rendered DOM. Both probe globals deleted after.

**Memory** — 8 cards, 9 registry entries at `pageId: 'memory'`, 1 nav page.
totalmem **31,982,632,960** · freemem 7,030,161,408 · win32 · storage used 5,026,721,050 of
quota 58,303,462,682 · settings inventory **24 of 30 domains present, 6,054,776 B**, top six
`flashcards 5,202,929 / clipboard 522,238 / study-progress 151,544 / media-study 100,413 /
profiles 50,712 / lookups 9,307`.

**Statistics** — totalSeconds 21,364.698 · totalChars 42,748 · totalWatchSeconds 1,844.45 ·
recent **14** days · knownWords **0**.

**The trap this file exists to stop.** Four of these are live machine state and will NOT
reproduce: `freemem`, `used`, `quota` and every `stats.*` counter move on their own. Compare
`totalmem`, `platform`, `domainsAll`, `domainsPresent`, `recentDays` and the inventory ids
EXACTLY; compare the volatile ones for shape only — same source, same units, same ordering,
non-null. A Files panel reporting a different `freemem` is correct; one reporting null, or
bytes where the page showed a percentage, is not.

**A cross-check that already paid off.** `listKnownEntries()` returns **0**, and the
Notebook's own `known` stream measured **0** in the same session (gate 7's table). Two
independent readers, same empty store — so the zero is measured, not a missing reader.

**Gate 8's remaining work, in order, for the next turn:** (1) build the Files-app memory and
statistics panels against `system/memory` and `system/statistics`, which gate 1 measured as
the only two leaves still reading 0 with work owed; (2) remove the 9 registry entries and the
nav page; (3) repoint every search entry that pointed at `pageId: 'memory'` — the gate is
explicit that a search hit landing on a page that no longer holds the row is a FAIL;
(4) flip the `memory` and `statistics` parity rows to `migrated` (both are already on
`FILES_PERMITTED_MIGRATIONS`) and re-run the comparison against this file.

### 2026-08-31 (ninth) — Gate 8's two surfaces are built and Settings no longer carries them

`f26e9932` (build) + `d9bec5be` (removal). Gate 8 remains **OPEN**: three of its four
clauses are landed, the fourth (the "compared after" reading, on a live app) is not.

**The panels.** `system/memory` and `system/statistics` were the two leaves gate 1
measured as still reading 0 with work owed. They are now PANELS, not item lists, and
`FILES_PANEL_CATEGORY_IDS` in `catalog.ts` says so — the rail shows no count for them,
because they hold no enumerable rows and a 0 there is an honest number answering a
question nobody asked.

**The readers are the OLD page's readers, and that is the gate, not a convenience.** Gate 8
is "the same numbers the old Settings page produced"; a second implementation is the only
way to produce a different number. Statistics composes `StatsContent`'s exported blocks —
the THIRD host of that module after Study OS and Blanc. Memory calls the same five
sources `MemoryPage` called (`listSettingsDomains`, `navigator.storage.estimate`,
`window.api.systemGetMetrics`, `loadLocalAgentMemory`, `getAgentOperationHistorySnapshot`)
and formats through the same `formatBytes`. A test asserts each by name.

**Four traps this turn paid for, in order of what they cost:**

1. **`SettingsCard` cannot cross.** It calls `useSettings()`, which THROWS outside
   `SettingsProvider`. `FilesPanelCard` replaces it in `--lq-*` tokens only, and carries
   `data-panel-card-id` so gate 8's search half has an anchor.
2. **`lazy()` is load-bearing, not an optimisation.** `StatsContent` reaches `ankiSync`,
   which calls `window.api.onAnkiIntervalsChanged` AT MODULE SCOPE. A static import killed
   `filesApp.test.tsx` outright. `studyLedgerHarness.tsx` documents the same hazard.
3. **The nine registry entries must NOT be deleted.** Deleting them costs a user who
   types "factory reset" the ability to find it at all — capability lost, not moved. They
   carry `movedTo: 'files'`; `pageId` stays `'memory'` as the historical coordinate the
   agent index and stale deep links still speak.
4. **The redirect belongs in `SettingsApp.navigate`, not the search box.** Four callers
   reach it — search, nav rail, agent guided navigation, recent pages — and a redirect in
   one leaves the other three dead-ending on a page that renders nothing.

**And one that will bite the next turn.** A bash heredoc writing a `\b` into a regex
emitted a REAL backspace byte (0x08); ESLint's `no-control-regex` was the only thing that
caught it, and only PowerShell repaired it. Same family as memory
`write-tool-emits-raw-nul`. Scan touched files for `[\x00-\x08\x0B\x0C\x0E-\x1F]`
before committing.

**Three routing tests were repointed, each stricter than before:**
`settingsSearchReachability` now scans `filesapp/panels/` for `<FilesPanelCard id>` /
`focusCardId ===` anchors and requires every `movedTo: 'files'` entry to anchor there,
with a vacuity guard; `agentNavigationIndexMirror` exempts only pages named in the new
`SETTINGS_PAGES_MOVED_TO_FILES` and builds their allowed words from the cards that still
name them; `agentHistorySettingsRouting` follows the card to `FilesMemoryPanel.tsx`.

**Gates:** `npx vitest run` **13 suites / 33 tests failed, 12,035 passed, 6 skipped** —
the SAME 13 suites and 33 tests as the `56a421ec` baseline, checked by set and not by
count; none names a path this turn touched. i18n **exit 0, 11,780 keys**. Architecture
**exit 0, 15 findings**, identical set. ESLint **0 errors** on every touched path.

#### Gate 8's remaining work, and the blocker the next turn must not re-derive

(a) **The parity rows cannot be plain rows.** `filesAppRouteParity.test.ts` pins every
non-`action:` capability 1:1 to an enumerator `source` id, and `memory`/`statistics` are
not enumerator sources — adding them bare breaks that equality and its own control. The
slot that fits is `action:memory` / `action:statistics`, which the equality excludes; that
means `FILES_PERMITTED_MIGRATIONS` needs the `action:`-prefixed ids too (line 408 checks
`row.capability` against that list). Decide the spelling once and write it down.

(b) **The "compared after" reading needs a live app started from THIS worktree.** The
main-tree app (PID 2040, bridge 39273) is the liquid track's instrument AND runs different
code; it cannot answer for these panels. Start a dev app here, open Files →
System → Memory, and compare against `src/.coordination/files-app/gate8-before.json`:
`totalmem` **31,982,632,960**, `platform` **win32**, `domainsAll` **30**,
`domainsPresent` **24**, the six inventory ids in order, `recentDays` **14**,
`knownWords` **0** — EXACTLY. `freemem`, `used`, `quota` and every `stats.*` counter are
live machine state; compare those for shape only (same source, same units, non-null).
A panel reporting a different `freemem` is CORRECT; one reporting null is not.
Then search Settings for "factory reset" and prove the hit lands on the factory-reset
CARD in the Files app, not merely on the app — that is the gate's own FAIL condition.

### 2026-08-31 (tenth) — gate 8's parity blocker, and gates 10 and 11 land

`cd9ae66d` (gate 8 parity rows) · `c8fac9ea` + `e3816480` (gate 10) · `8bc72866` (gate 11).

**Blocker (a) resolved by a THIRD capability shape.** `filesAppRouteParity.test.ts` pins
every non-`action:` capability 1:1 against the 25 enumerator `source` ids, so a bare
`memory` row broke the equality. The spelling, decided and written down: `panel:<categoryId>`,
and `isEnumeratorCapability` (exported, so table and test cannot drift) filters on the colon.

**And the half the previous turn assumed: only ONE of the pair migrated.** Decision 1 names
"memory and statistics", but statistics never had a Settings page to lose — its home is the
top-level `stats` section and `AppSection.tsx` still routes `case 'stats'` to
`StatisticsView`. So `panel:system/statistics` is **preserved**, and
`FILES_PERMITTED_MIGRATIONS` carries `panel:system/memory` alone. Listing statistics would
have licensed a future removal of the Statistics section nobody decided. Three assertions in
the draft were backwards; the sharpest was `pageId: 'memory'` asserted ABSENT when it is
deliberately present on all nine entries, and is now pinned at 9.

**Gate 10 CLOSED.** Opening routes through `planForPath`. `shared/filesApp/openPlan.ts` maps
a `DropTargetId` to the section `DropRouter` itself opens and **calls no importer** — an
indexed row is already imported, and re-running that switch would create a second library
entry for the book on screen. A test asserts the seven importer names are DropRouter's and
absent from FilesApp. Three decisions recorded: the ranked-list trigger is a **count**, not
`needsTriage` (an `.apkg`'s two homes rank `likely` then `ambiguous`, so a confidence read
would have opened one silently); 12 of 15 targets own an app and the other three refuse with
their **own** keys; a failed router call refuses rather than falling back to the kind table.
Single click selects, double click opens, both through one `openItem(item)` — which takes the
item because in the double-click gesture `selected` has not committed and reading it opens the
PREVIOUS row. 18 tests on real `.zip`/`.json` fixtures through the real `planForPath`, both
sniffers, 4 controls; `filesApp.test.tsx` 39 → 46.

**Gate 11 CLOSED.** Routing already worked (DropRouter listens on `window`); two halves did
not. (1) The tree never learned an import happened — `renderer/filesIndexBus.ts` is the one
name for it, raised after `runPlans` resolves and after an undo, and the reload is
**`force: true`** because `getFilesIndex` serves a cached build inside its TTL and a
non-forced reload returns the pre-import snapshot while looking like it reloaded. (2) Two
returns in the drop handler rendered NOTHING for real files — now `noPath` (warn, Electron
could not resolve a virtual item) and `notClassified` (err, our fault), distinct sentences and
severities. An empty drop still stays silent; a control asserts it. First tests DropRouter
has ever had.

**Trap, i18n:** the drop listener depended on `t`. `t`'s identity is stable by design, so the
closure kept whichever language it registered with — it now depends on `lang`.

**Gate 8 (b) is STILL BLOCKED and the reason changed.** Not "needs a dev app" — it needs an
**exclusive** one. The main-tree app (PID 2040) holds bridge port 39273, which is a hardcoded
const, and shares the 8.6 GB userData whose leveldb takes a single-writer lock, so a second
instance from this worktree would read `domainsPresent: 0` and the comparison would be
meaningless. Killing PID 2040 would destroy the liquid track's deliberately-arranged
instrument. The clean route: `ClaudeRelayMergeback` has REFUSED four passes in a row
(07:10–07:55, "a main-tree dispatch is running"); once `wt/files-app` merges, the panels are
live in that same app and any worker can take the reading through the bridge it already has.
Do not start a second Electron here to force it.

**Gate 9 is CODEX's lane, not this worker's.** `feat/nyaa-subtitles` carries seven files-app
deletion commits not on this branch (`64d66b86` … `2c27c144`), including
`filesDeletionSession.ts`. Building gate 9 here would duplicate them and conflict at the
merge. This worker took 10 and 11 instead.

### 2026-08-31 (eleventh) — gate 12 CLOSES, and the second wrong folder it was hiding

`fbc52a83`. The refusal half was already proven from the renderer (button absent for a
SQLite row). Checking the HANDLER — which nobody had — found a second wrong folder the
renderer cannot see: **a `brokenLink` row IS file-backed**, so `revealTargetFor` hands back a
path, and `shell.showItemInFolder` on a path that no longer exists opens the nearest
surviving ANCESTOR, silently, reported as `ok: true`. That is the exact shape gate 12
forbids, and it survived because the renderer only ever asked whether the action should be
offered. Fixed with an `fs.existsSync` check and `filesApp.reveal.missing`; the filesystem
decides, not the index flag, because the index is cached for 15 s and the file can go in
between.

**Every assertion is on the SPY, not the return value.** "Refuses honestly" means Explorer
was not asked; a handler could answer `ok: false` having already asked. 7 tests: exact path
for a real file, refused-without-asking for `sqlite`/`json`/`localStorage`/`derived`, a
missing file, a live delete flipping the answer mid-session, four malformed locations
including a bare string path, and a `{ store: 'zzz', path: <real> }` that cannot smuggle a
path through.

**The boundary, stated so an auditor can disagree with it.** Every line of THIS APP's code on
the reveal path is now exercised: the renderer test proves the click calls
`filesReveal(<the real location>)`, and this one proves the handler calls
`showItemInFolder(<exactly that path>)`. The only unobserved step is Electron's own shell
API opening a window, which is not this app's code and which no headless agent can watch.
Gate 12 is closed on that basis rather than on a click nobody can record.

### 2026-08-31 (twelfth) — gate 15 CLOSES on a finding gate 10 produced

`3895f458`. Gate 15 is "a track opens the existing music app, and that app's behaviour is
unchanged before and after". Checking the first half against gate 10's own table found it
FAILING: `classifyByExtension` puts `AUDIO_EXT` and `VIDEO_EXT` in one `media` bucket —
correctly, because both IMPORT to the same media library through `addMediaPaths` — and
`media` maps to `player`. So a track in the Files app would have opened the media Player.

**Ownership is not one bucket, and the index already knows which row this is**
(`enumerators.ts` sets `kind: 'audio'` from the media row's own `kind`/extension). The fix is
one explicit PAIR, `{ target: 'media', kind: 'audio' } -> 'music'`, not "kind wins": a general
override would defeat the sniffers, whose entire point is that the index's kind for a `.zip`
(`package`) is the COARSER answer. A control asserts exactly that — the sniffed dictionary
zip still lands on `dictionary` while `sectionForKind('package')` is null. The kind travels
on the picked-from-the-list route too, or the refinement would vanish whenever the ranked
list was involved.

Second half, "unchanged before and after", is an ABSENCE, so it is asserted against the
sources: the Files app names the SECTION and lets the shell mount `MediaCenterView
initialTab="music"` through the shared `openSectionSurface`; it imports no music module
(`musicPlayer`, `MediaCenterView`, `audioEngine`, `musicLibrary` all absent from
`FilesApp.tsx`). 22 tests in `filesAppOpenPlan.test.ts`, up from 18.

### 2026-08-31 (thirteenth) — gate 16's model, half the gate, committable on its own

`f2313736`. The pure collections model; the renderer store and the folder UI are the next
slice. **A collection holds ITEM IDS, never items**, which is what makes the gate's "deleting
the collection leaves every item in place" true by construction rather than by care — a test
asserts it structurally, not only by outcome.

**Deleting PROMOTES children to the parent.** Recursive delete would take containers the user
never named, and a container has no soft-delete window (the plan's undo window is for index
rows). The same rule runs on read: a parent that did not survive parsing promotes its children
rather than orphaning them into an invisible branch.

Decisions, each pinned: names unique among SIBLINGS not globally ("Season 1" under two shows
is the ordinary case); a cycle guard on nesting, and `ancestorsOf` terminates on a document
that already contains one — unreachable through the API, but a corrupt store can carry it and
this runs during the first render; a stale item id is COUNTED by `resolveCollection`, never
dropped; an unknown FUTURE version reads as EMPTY rather than being reinterpreted, because
reading a newer shape with today's rules is how a downgrade eats the user's folders. Adding
twice is idempotent; everything else refuses with a named key. 18 tests, the gate's own
sentence walked end to end with the reopen as a real JSON round trip.

`collections.ts` is classified `pending` in `tools/architecture-baseline.json` — the shape
that file's readme already names for three other entries, "a pure layer that is built and
tested but has no consumer yet". Remove the entry when `FilesApp` imports it.

### 2026-08-31 (fourteenth) — gates 16 and 17 CLOSE, and two wiring findings

`64abd9d8` the store, `733ce361` the UI. Gate 16 is a **restart** gate, so every survival
claim in the 20 new UI tests is asserted after a real unmount/remount against the same
`localStorage` with the store's in-memory fallback cleared. A React-state assertion cannot
tell "persisted" from "still mounted", and that is the whole gate.

**`persisted` is the store's load-bearing field.** `localStorage.setItem` throws on quota, so
a folder created in memory and never written passes every in-session check and is silently
gone at the next launch. `saveFailed` is a DIFFERENT i18n key from the model's refusals — a
refusal is fixable by retyping, a failed save is not — and the change event does not fire on
a write that did not happen. Control: removing `setItem` turns **12 of 20** UI tests red.

**Gate 17's design decision, pinned.** Rename / delete / move stay PRESENT on a derived
folder so they have somewhere to refuse, each naming the folder. A control that vanishes
cannot say why it is not there, and the gate's words are "refused with a named message; it
does not silently no-op". The *other* half is the opposite shape: a derived node deliberately
does **not** call `preventDefault` on `dragover`, so the browser never fires `drop` on it —
the test asserts `event.defaultPrevented === false`, the mechanism, not the cursor. The
user's own folder is the control at `true`. The inspector's Add menu lists only the user's
own folders, so a derived category is never on it to begin with.

Two findings the wiring produced, both fixed in `733ce361`:

1. **A gate-5 scoped-open set `scope` without clearing `collectionScope`** — a caller's
   category would have been intersected with whatever folder happened to be open. Two
   filters, one of which nobody asked for.
2. **A collection scope had no entry in the "you are narrowed" toolbar line**, so the only
   route out of a folder would have been the rail. Both narrowings now share one label.

`--fa-depth` renders nesting from the same walk the model computes, so screen and model
cannot disagree; anything the walk does not reach is appended at depth 0 rather than dropped,
because an invisible folder cannot be deleted. A missing item id is COUNTED under the list.

Trap, and it cost a false lint reading: the tracked directory is
`src/renderer/components/**filesapp**/` (lowercase), while Windows lets `filesApp` resolve.
Passing the capital-A path to eslint produces five bogus `import/no-unresolved` "casing does
not match" errors on imports you never touched. Lint the lowercase path. `collections.ts`'s
`pending` entry is removed from `tools/architecture-baseline.json` — FilesApp imports it now;
audit still 15 unclassified, the identical pre-existing set.

### 2026-08-31 (fifteenth) — interrupted-work recovery closes gates 18 and 19

`5827f201` (gate 18, recovered as already committed) + `9286bf90` (gate 19, recovered from
12 unstaged files left at the session-limit boundary). Gate 18 closes on **14 UI + 18 model
tests**: item and location pins survive a real unmount/remount with store memory cleared;
unpinning then re-finds the unchanged item/folder. Stale targets remain counted and removable.

Gate 19 closes on the gate's exact numbers in the production component: **Untranscribed
videos 2 -> 1**, **Transcribed videos 0 -> 1** after a transcript arrives and a forced index
refresh; the open folder's rows change from 2 -> 1 too. **Broken links stays unchanged** as the
negative control. The store persists only criteria, never members or counts, so every render
re-asks the live index. A saved search also survives remount; preset deletion and an unfiltered
save both refuse by name.

Recovery finding: the unfinished `toggleFavorite` rename was load-bearing. Reverting it made
architecture report a new duplicate-export against `clipboardHistory.ts`; the final unique
`toggleFilesFavorite` name returns the audit to the same 15 pre-existing unclassified modules.
Focused verification: **4 files / 56 tests**, i18n **11,868 keys**, ESLint **0 warnings/errors**.

### 2026-08-31 (sixteenth) — gate 20 CLOSES with failure isolation and one recovery path

`88913972`. Three checked rows feed one action and one receipt. The measured adverse run is
**3 selected / 3 attempted / 2 succeeded / 1 failed / 2 cards added**: item 2 throws while
reading, item 3 is nevertheless called and adds its card. The receipt names all three items
and their own outcomes; aggregate numbers cannot hide which source failed.

Mining is sequential deliberately: each source re-reads the renderer-owned deck after the
previous write, so identical cues in two selected files cannot race into duplicates. The batch
stores exact added ids; Undo measures the deck **2 -> 0** and touches no pre-existing id. The
selection clears when the batch settles so a second click cannot overwrite the first action's
only recovery path. Focused production-component gate: **47/47 tests**, including the existing
single-item mine and sort/a11y regressions. i18n **11,879 keys**, ESLint **0**, architecture
the same 15 branch-divergence findings and no Gate-20 identity.

Turn-wide gates after the last slice: full Vitest **926 passed / 1 skipped / 13 failed suites,
12,191 passed / 6 skipped / 33 failed tests**. The failing suite/test set is the recorded
worktree branch-divergence baseline (13/33 before this turn): missing post-branch Liquid CSS and
consumers, CRLF-sensitive guards, and existing reader/canvas harness failures; none names a
Gate-19/20 path. i18n **exit 0 / 11,879 keys**. Architecture reports the same **15** unclassified
post-branch modules and no files-app identity. ESLint on the touched TS/TSX/catalog paths **exit
0 / 0 warnings**; CSS is excluded because this ESLint configuration parses it as JavaScript.

### 2026-08-31 (seventeenth) — gate 22 CLOSES: view state is remembered per FOLDER

`0ef89ef0`. Sort column, direction and view mode moved out of component state into
`shared/filesApp/viewState.ts` + `renderer/filesViewStateStore.ts`, on the same
`filesDocStore` shape gates 16/18/19 use — so a write that did not land reports itself
rather than passing and being gone at the next launch.

**Per folder is the gate, and it is asserted from the neighbour.** One global sort would
survive a restart too and would be a different feature, so every "remembered" claim is
paired with a second folder that must NOT have moved. Measured on the real component:
Video at size/desc reads `alpha, gamma, beta` after the restart while Text is still
name/asc at `one, two` and Everything is still name — and the persisted document carries
`category:sources/video -> size` and `category:sources/text -> modified/desc` as two rows.

**The restart is a real unmount plus `resetViewStateMemoryForTests()`.** The store keeps a
`memoryDoc` so a session survives a throwing `setItem`; a test that only remounted would
read that copy back and pass with nothing ever reaching `localStorage`. That is the trap
this gate is built to catch, so the suite also runs it in the negative: with `setItem`
throwing, the mode is live, the notice says "restarts", and the restart really does show
`details` again.

**Adverse control.** Collapsing `folderViewKey` to a single global key turns **6 of 26**
red — 3 of them restart tests on the production component — and restoring is
byte-identical (md5 `5833e59f…` before and after).

Decision, reversible: view modes are `details` (the column table) and `compact` (name +
kind, 24px row), not Explorer's four. `VirtualList` windows on a fixed `itemHeight`, so a
tile grid is a second windowing mode rather than a class name; a third value can join
`FILES_VIEW_MODES` later without touching the persistence contract. Compact genuinely
drops the three columns from the DOM (`.fa-cell-size` count 0, not `display:none`), and
the row height moves with it or the windowing scrolls wrong.

Finding, recorded not fixed: **a folder can be sorted by a column its own view mode has
dropped**, so compact renders no `aria-sort` anywhere. The toolbar select still names the
column and the order is correct — Explorer's List view is the same — so it is honest
rather than hidden. Pinned as an assertion, not left to be rediscovered.

Trap for the next worker: three `--lq-*` tokens I first reached for do not exist anywhere
in the tree (`--lq-liquid-bg-active`, `--lq-status-danger`, `--lq-font-sm`). An undefined
custom property makes the declaration invalid at computed-value time, so it inherits and
the rule looks landed while painting nothing. This stylesheet says "on" and "wrong" with
weight and `currentcolor`, never a hue token — `--lq-liquid-highlight` is `transparent` on
at least one theme.

Focused gates: **26/26** across the two new suites, ESLint **exit 0 / 0 warnings** on all
10 touched TS/TSX paths, i18n **exit 0 at 11,885 keys**, architecture the same **15**
pre-existing branch-divergence findings and no gate-22 identity among them.

### 2026-08-31 (eighteenth) — gates 23 and 26 CLOSE; 24 and 31 land one half each

`8fca0963` (scan) and `f12f54de` (completeness). The two are one feature: ingest is the drop
router's classifier plus volume, plus the two things a single drop never has to decide —
what to skip, and when to stop.

**Gate 23, measured on real files through the production `planForPath`.** Nine files in a
mixed folder: **found 8 / placed 7 / ambiguous 0 / unplaced 1 / skipped 1**. Per destination:
`subtitle` 3, `media` 2, `library-book` 1, `dictionary-yomitan` 1, `unknown` 1. The
dictionary row is a REAL Yomitan zip carrying `index.json` with `format: 3`, so the archive
sniffer actually runs and reports `sniffed: true` — a hand-named empty file would have
exercised the extension table and left the gate's hardest row untested. `scanReportBalances`
is asserted, not assumed: placed + ambiguous + unplaced === found, so a file the report lost
cannot pass as a clean run. Adverse control: removing the incomplete-file skip turns **4 of
12** red.

`unplaced` is deliberately not folded into `ambiguous`. Two valid homes needs a choice; no
home at all cannot be reviewed into anywhere, and a report saying "12 to review" when 11 are
unreviewable is the kind of number this plan exists to prevent.

**Gate 26, watched mid-write, because the gate's own sentence forbids the cheap version.**
Real bytes to real disk with the scan running BETWEEN chunks and only the clock injected:
chunk 1 -> `firstSighting`; chunk 2 at +1 s -> `stillGrowing`; chunk 3 at +2 s -> still
refused (**a naive "seen twice" rule would have imported a half-written video here**); the
write stops -> `tooSoon`; +3 s unchanged -> **found 1 at sizeBytes 7168**, every byte that was
written. Eight incomplete extensions each skipped by name, with one finished `.srt` in the
same folder as the control so a report of zero could not pass as "it skips everything".
Adverse control: making a size change NOT restart the clock turns **3 of 14** red.

**Gate 24's scan half is closed inside gate 23's own run** — size, mtime and full bytes of
every fixture file captured before and compared after three scans including the zip-reading
path, all identical, nothing created or removed. Read-only is also structural: the module
uses `readdirSync`/`statSync`/`lstatSync` only, takes no injectable `fs`, and does not descend
symlinks (a junction at `C:\` would otherwise turn a Downloads scan into a whole-drive walk).
The import half stays open until there is an import.

**Gate 31's honoured half is closed too**, at two settings: refused at +29,999 ms and accepted
at +30,000 ms with a 30 s window; and at a 0 ms window still refused until a second reading
holds, because the empty and first-sighting refusals run BEFORE the window is consulted. That
is control flow, not a clamp someone can lower next year. What 31 still needs is the folder
setting that makes it adjustable.

Traps for the next worker: (1) the file ceiling **stops the walk** and records itself once —
an earlier draft pushed one skip row per remaining file, which on a media drive costs more
memory than the scan it refused to do. (2) A one-shot scan has **no** previous reading, so it
cannot judge completeness and deliberately does not pretend to; the caller must carry a
`StabilityLedger` across passes. That limitation is pinned as its own test so it cannot be
mistaken for the feature working.

Focused gates: **26/26** across the two new main suites, ESLint **exit 0** on every touched
TS path, i18n **exit 0 at 11,894 keys**.

### 2026-08-31 (nineteenth) — gates 27 and 24 CLOSE; 36 lands its routing half

Commits `30b13bfb` (ingest model), `2e332b86` (review sheet + the one importer),
`38d26b93` (gate 24's import half).

**The finding gate 27 turns on: `placed` is not "safe to import unattended".** Gate 23's
`settlementOf` calls a single `likely` candidate `placed` — and `fileRouting.ts` defines
`likely` as "best guess, route but say what was assumed". A `.csv` is therefore `placed`
AND, in gate 27's exact word, a guess. Reusing the settlement as the auto-import test would
have put every guess straight into the library. So `shared/filesApp/ingest.ts` decides from
the router's **confidence** instead: `exact` with one candidate may auto-import; `likely` is
a guess and waits; `ambiguous` waits with its choices attached; target `unknown` is refused,
because there is nowhere to review it INTO — the same reason gate 23 keeps `unplaced` apart
from `ambiguous`.

Both of gate 27's paths, on real files through the production `scanRoots` + `planForPath`:
`ep01.srt` exact -> **auto**; `vocab.csv` likely, settlement asserted as `placed` -> **review**;
`page001.png` -> **review** carrying both real candidates in the router's own order; a real
Yomitan `.zip` sniffed to exact -> **auto** (the hardest auto row — bypass the sniffer and it
sits in review); `notes.xyz` -> **refused**. Six files, three piles, `ingestPlanBalances` true.

**One importer.** `DropRouter`'s dispatch table moved verbatim to
`renderer/fileImportExecute.ts`; the review sheet calls it. A second importer would be the
same defect as a second classifier, one step later — a file could land through a path the
drop router never takes, with its own undo. Its one behaviour change is an improvement: an
empty-folder import was a silent `null` and now refuses by name.

**Gate 24 CLOSES.** The real `media:addPaths` and `library:importPaths` handlers, captured
off a mocked `ipcMain`, over a 4 KB `.mkv` and a real 3-page `.cbz` living outside userData.
Every source byte-identical and still at its own path, twice; and — the assertion that
matters as much — `media.path === VIDEO` and `library.sourcePath === MANGA`, because
byte-identity alone would pass an importer that copied and then referenced the copy.
`pageCount` 3 proves the archive was actually opened. Instrument control: a same-length
rewrite, a move and a deletion each detected.

Gate 36's routing half is measured on one walk: `{subtitle:'auto', media:'review'}` puts the
`.srt` in auto and the `.mkv` in review, with a control that removes the overrides and moves
the video back. Its settings surface is what remains.

Traps: (1) the review sheet re-fetches candidates through `filedrop:classify` because the
scan report stores a candidate **count**, not the list — a 5,000-file report has to stay
small; the refetch is capped at that handler's own 200 paths. (2) Component assertions are
made on the importer spies, never on the DOM: a row that renders in the right list and
imports anyway would pass a DOM-only test and fail the gate. (3) `MAX_STABILITY_MS` is new in
`stability.ts`; there is deliberately no matching floor, because the lower bound is
`stabilityVerdict`'s clause order rather than a number.

Focused gates: **34/34** across the four new suites (18 model + 8 real-file + 8 component +
4 import read-only), plus 72/72 across the touched renderer suites. ESLint exit 0 on every
touched TS/TSX path. i18n exit 0 at **11,926 keys**.

**Gate 29 closes in the same window.** Two halves, and only one of them is the importers'.
"Imports nothing the second time" is theirs and is measured against the real handlers: called
twice with the same paths, `media:addPaths` and `library:importPaths` return the same row
counts and exactly one row per source. **"And says so" is new** — without it a second scan
re-offers every file, the user confirms, the importers silently swallow the lot, and the
report claims N imported when nothing happened. `shared/filesApp/importLedger.ts` plus a
fourth `known` pile in `planIngest` is that half: the production component scans, imports,
scans again, and reports the three that landed under **Already brought in** with the auto pile
**empty**, while the refused `.csv` stays offerable and the second confirm calls **no**
importer and reports **0 of 1**. Undo forgets, so a reversed import is offered again.

Two decisions worth not re-deriving: identity is **path + size**, never path alone, so a file
replaced in place is a different file and is offered again (mtime is excluded — some copy
tools change it while the bytes are identical); and `known` runs BEFORE the refusal, so a file
whose classification changed since is answered by history rather than re-judged into an import
that would be swallowed.

Trap: `localStorage.clear()` does **not** isolate a test of the ledger store. It keeps an
in-module `memory` fallback so a quota error degrades to "forgotten on restart" rather than to
"gate 29 stops working", and that fallback survives a cleared localStorage — two component
tests failed on exactly that leak before `clearImportLedger()` was added to `beforeEach`.


### 2026-08-31 (twentieth) — gates 31 and 36 CLOSE: the settings become settable

Commits `3589c6fa` (the handler), `41a678c0` (the document), `8ef06751` (the controls).

**What the slice found first, and it is the reason both gates were still open.** The
production handler was `scanRoots(list)` — no ledger, no window. Every stability clause was
dead on the one path a user can reach, so a settings control built against it would have
adjusted nothing at all, and both gates would have "closed" on a control wired to a dead
parameter.

**A one-shot scan is not blind after all: the filesystem holds the earlier reading.**
`mtimeMs` seeds `changedAt`, which is what lets a first scan of a settled folder classify
anything — without it the user has to scan twice before a folder shows a single file. The
lower bound survives because the hint is only trusted once it is `MIN_CHANGE_EVIDENCE_MS`
(1 s) old: a timestamp from the instant we looked is exactly the file a torrent client is
writing right now. **That floor is on the EVIDENCE, not on the window** — `stabilityMs`
stays settable to zero, and a mid-write file is still refused there.

Gate 31, on the real handler with real files and the real clock, ages set with `utimesSync`:
a 10 s-old file **refused as `tooSoon` at 30,000 ms and taken at 3,000**; refused and taken
either side of its own boundary at 20 s; a mid-write file **refused at 0, 1, 3,000 and
30,000**; `-5,000` clamped to 0 and still refused; an empty file refused at a zero window;
no settings at all meaning the default rather than off. **8 tests, 22/22 with the existing
suite.**

Gate 36, on the production sheet's own selects: the same folder puts `ep01.srt` and
`ep01.mkv` in **one** pile before the overrides and in **two** after; the video moved to
review and skipped **never reaches `addMediaPaths`**, which it did on the identical run
before; `auto` on `deck-csv` still cannot promote a guessed `.csv` past gate 27. Both
overrides survive a restart and still route the scan. **9 component tests, 66/66 across the
touched renderer suites.**

**The parser clamps, the writer refuses**, and the pair is deliberate:
`normalizeIngestSettings` has to turn a corrupted document into a usable app, but a user who
types 9,999,999 and is silently given 600,000 has been told a setting landed when a different
one did. The field snaps back to what is stored, and an emptied field restores the stored
window rather than storing the most permissive one there is.

Traps: (1) **React's `onBlur` is `focusout`** — a dispatched `blur` commits nothing and the
first run of these tests reported the whole feature dead. (2) `localStorage.clear()` does not
isolate the settings store either; call `resetIngestSettingsMemoryForTests()`. (3) The
committed window is re-normalised in MAIN, so a corrupted renderer document cannot turn the
completeness check off from over there.

Adverse controls: dropping the evidence floor to 0 turns **2 of 22** red; pinning the sent
window to a literal turns **4 of 9** red; dropping `byTarget` turns **3 of 9** red.

Focused gates: **37** store/model tests + **9** component + **8** handler; i18n exit 0 at
**11,942 keys**; ESLint exit 0 on all nine touched TS/TSX paths.


### 2026-08-31 (twenty-first) — gate 25 CLOSES: watched folders, and what they say

Commits `8c0796df` (main), `59e72c27` (renderer).

**Recognition is `scanRoots` with a ledger carried across sweeps** — the same walk and the
same classifier as gate 23. A watcher with its own opinion about what a file is would be the
second classifier gate 23 spent itself avoiding, one route later.

Three things the tests forced rather than the design predicting:

1. **An event is a hint to look, never an answer.** The last `fs.watch` event for a file
   arrives while it is still unstable, and nothing further ever fires — so a watcher that
   only re-checked on events would miss precisely the moment it exists to catch. A sweep arms
   its own re-check while anything is pending, and **nothing at all when idle**, which is what
   makes a permanently watched Downloads affordable.
2. **The baseline was silent only in intention.** Every pre-existing file is a first sighting,
   so it was skipped and then announced as an "arrival" one sweep later — adding Downloads
   would have reported nine hundred arrivals, none of which arrived. Gate 31's mtime rule is
   what makes it silent in fact. A file genuinely mid-write at baseline still has a fresh
   mtime and is announced for real when it finishes, which is the case worth keeping.
3. **Elapsed is measured from `firstSeenAt`, which never moves.** From `changedAt` a download
   that stalled a minute would report the 3 s window as its duration; pinned as its own test
   at **63,000 ms** against a 60 s stall.

Numbers: 4,096 bytes announced at **elapsedMs 4,000** after being refused twice while growing;
a `.crdownload` never announced even after settling for a minute, with its finished twin in
the same folder announced in the same sweep as the control; a file announced **exactly once**
across six further sweeps.

**"Without a manual refresh" is measured where it cannot be faked.** Calling `sweep()` IS the
manual refresh, so main's half is driven through the session's own scheduler with no sweep
call, and the renderer's half by pushing main's broadcast into the production `FilesApp` —
which then forces an index rebuild nothing asked for and renders **"ep99.mkv arrived after
4.2 s"**. The hook reports what MAIN says it is watching, not what was asked: a root main
refused must not appear as covered.

The list is edited in the scan sheet from the folder already typed there. A duplicate is
refused by name rather than deduplicated, and `C:\dl\` and `c:\dl` are one folder — without
the fold the same directory could be watched twice and every arrival announced twice.

Traps: (1) a bash heredoc **collapses a doubled backslash into a single one**, which silently
halved every escaped path in two appended test blocks — a Windows path meant as two
characters arrived as one, so a string comparison that looked right compared the wrong thing
— and turned a `[backslash-or-slash]` regex class into one matching only the forward slash.
ESLint's `no-useless-escape` caught the tests; **nothing would have caught the regex**, and
this very paragraph was eaten by the same trap on its first write. Use the Edit tool for any
line carrying a backslash. (2) `refresh` is held in a ref, not a dependency: a subscription rebuilt on every
render drops the arrival that lands between the two.

Focused gates: **8** main + **7** hook + **3** on the production FilesApp + **4** on the
sheet's list = 22 new; 57/57 and 47/47 across the touched renderer suites; i18n exit 0 at
**11,952 keys**; ESLint exit 0 on all touched TS/TSX.

## 2026-09-01 (twenty-second) — The forward merge is ONE conflict hunk, not a structural wall

`wt/files-app` is 150 commits ahead of `feat/nyaa-subtitles` and **still not on the branch**.
Say that plainly in every handoff until it is. But the reason it has not landed was recorded
as "STRUCTURAL ... it will not clear on its own", and that reading was too pessimistic. It was
never measured; this turn measured it.

`relay-mergeback.ps1` refuses because 12 incoming paths are uncommitted in the main tree, and
a fast-forward checkout cannot overwrite a locally modified file. **That refusal is correct and
must stay.** What is new is the size of what it is refusing.

Method — no writes to the shared tree at all. `git diff HEAD -- <the 12 paths>` in the main
tree captures the other tracks' uncommitted work; a throwaway `git worktree add --detach` at
this branch's HEAD receives it via `git apply --3way --cached`.

    11 of 12 apply CLEANLY. Three conflict hunks total, and two were mine.

- `preload.ts` x2, both avoidable from this side and both removed by `66849d0a`. The Files-app
  type imports shared an anchor line with another track's in-flight `SubtitleSyncEstimate`
  import; moved below `FILES_DELETE_CHANNEL`, which already exists on the base. And the base
  ends the file with a stray lone-CR line (`^M$`) that this branch normalised to an empty line
  while the other track deleted it — two sides editing one byte. Deleted here too, matching them.
- `src/renderer/App.tsx` x1, GENUINE and it stays. This branch's entire App.tsx change is
  deleting `notebook: 'Notebook',`; the other track is rewriting that whole object into
  `POPOUT_LABEL_KEYS` holding `palette.section.*` keys. Resolve by taking THEIRS and dropping
  its `notebook` line — required, not cosmetic: `desktop.ts` removed `notebook` from
  `DESKTOP_WIN_SECTIONS` and made it a legacy alias (`notebook: 'files'`), so the key no longer
  type-checks in a `Partial<Record<DesktopWinSection, string>>`.

Re-probed after `66849d0a`: 11/12 clean, `App.tsx` the only unmerged path.

`~\.claude-runs\land-files-app.ps1` performs the whole thing, guarded — refuses unless the main
tree is quiet, re-verifies the fast-forward (and syncs the worktree down first, since the liquid
worker commits continuously and this branch falls behind between turns), copies the 12 files
plus a patch to a timestamped backup, lands, re-applies, unstages, and then verifies that every
OTHER dirty path is still dirty. Its dry run is read-only and works while the tree is busy.
`relay-mergeback.ps1`'s refusal text now carries this forecast instead of the old wording.

**Not landed this turn, and the reason is scheduling, not merge difficulty.** `primary` and
`primary2` are dispatched concurrently and each runs ~70 minutes, so the main tree was busy for
every minute of this turn; one dispatch ended at 10:55 and the next began the same minute. The
window is real but brief. Whoever holds one runs the script.
