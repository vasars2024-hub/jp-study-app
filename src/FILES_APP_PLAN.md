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
9. Deleting a derived item removes exactly it; the guard for irreplaceable media refuses without
   an explicit confirmation, proven by a refusal that actually fires.
10. **Opening routes through `planForPath`.** Clicking an item of each handled type opens the
   app that owns it, and a type with more than one candidate offers the ranked list rather than
   silently choosing. Proven with a file whose extension is ambiguous and whose handler is
   settled by content sniffing (`sniffZip`/`sniffJson`), so the sniffing path is exercised.
11. **Import from the real filesystem.** A file dragged in from Explorer is routed, lands in the
   correct category, and appears in the tree without a manual refresh. A file the router cannot
   place gets a named refusal, not a silent drop.
12. **Reveal out.** An item opens its real location in Explorer, for at least one file-backed
   and one non-file-backed kind — the latter must refuse honestly rather than open the wrong
   folder.
   <!-- status: open; evidence: 2026-08-30 refusal half proven (revealTargetFor null, Reveal absent for a SQLite row); the Explorer half needs a live click -->
13. **The assistant can reach it.** A natural-language request resolves to a scoped Files view
   through `AGENT_NAVIGATION_INDEX`, not a bespoke path.
   <!-- status: closed; evidence: 2026-08-30 'files' in DESKTOP_WIN_SECTIONS/AGENT_NAVIGABLE_SECTIONS/palette/POPOUT_SECTIONS/AGENT_NAVIGATION_INDEX; both directions tested -->
14. **Sorting is real.** Sorting by date created and by size reorders correctly on a set with
   known values, in both directions, including items whose store supplies no such value — those
   must sort predictably rather than landing arbitrarily.
   <!-- status: closed; evidence: 2026-08-30 sortItems by size+date, both directions, nulls last in both; negative control broke 4 tests across 2 suites -->
15. **Music is untouched.** A track opens the existing music app, and that app's behaviour is
   unchanged before and after.
16. **Collections are real folders.** Create a folder, add items of two different kinds to it,
   nest it, reopen the app and it survives. Deleting the collection leaves every item in place —
   proven by re-finding one of them afterwards.
17. **Derived folders refuse honestly.** Renaming or deleting a derived folder is refused with a
   named message; it does not silently no-op. Adding an item to one by hand is not offered.
18. **Favorites.** Pin an item and a location; both appear under Favorites and survive a
   restart. Unpinning removes them and deletes nothing.
19. **Smart folders stay live.** A saved search such as *Untranscribed videos* changes its
   membership after a video is transcribed, with the count before and after both reported.
20. **Bulk actions.** Select several items and mine them in one action; the result names the
   per-item outcome, and one failure does not silently abort the rest.
21. **Deletion is recoverable.** Deleting a file-backed item places it in the Windows Recycle
   Bin (`shell.trashItem`) and it is restorable from there — verified by actually restoring one.
   An index-only row is soft-deleted with a working undo. Where neither applies, the confirm
   says so in different words from a recoverable delete.
22. **View state persists.** Sort column, direction and view mode are remembered per folder
   across a restart.
23. **Scan finds things in bulk.** Point it at a folder holding a mixed set — subtitles, an
   epub, a dictionary zip, a video — and it reports a count per destination. Report the number
   found, the number placed and the number left ambiguous; "scanned successfully" with no
   numbers is not a pass.
24. **Scan is read-only.** After a scan and an import, every original file is byte-identical and
   still in its original path — verified, not assumed.
25. **Watch picks up a live download.** A file appearing in a watched folder is recognised
   without a manual refresh, and the elapsed time is reported.
26. **A partial download is never ingested.** A `.crdownload`/`.part`/`.!qB` file, and a file
   still growing, are both ignored until complete — proven by watching one arrive mid-write,
   not by asserting the extension list exists.
27. **Ambiguity goes to review, not into the library.** A file the router settles only by
   guessing lands in the review queue; a high-confidence match may auto-import. Both paths
   demonstrated with a real file each.
28. **Paste a folder sorts all of it.** A pasted folder is walked recursively, archives are
   expanded far enough to classify their contents, and the report names placed / skipped /
   ambiguous with reasons.
29. **Re-scan is idempotent.** Running the same scan twice imports nothing the second time and
   says so — a duplicate library entry is a FAIL.
30. **Referenced items behave.** Removing a referenced item from the library leaves the user's
   original file on disk; moving the original produces a reported broken link rather than a
   crash or a silent disappearance.
31. **The stability window is honoured and adjustable.** Setting it higher delays ingest of a
   file still growing by that amount; setting it lower does not bypass the completeness check
   entirely. Proven against a file arriving mid-write at two different settings.
32. **Cleanup dry-runs before it acts.** Every cleanup class reports its count and reclaimable
   size first, and the report matches exactly what is removed when confirmed — item for item,
   not just in total.
33. **Cleanup never touches irreplaceable material.** Point it at a library containing a
   downloaded video and every junk class; the video survives every class, including a scheduled
   run. A cleanup that can reach it is a FAIL regardless of settings.
34. **Orphan detection is real.** Delete a video's file behind the app's back; the broken-link
   class finds exactly that record, names it, and the chosen policy (mark / prompt / relocate)
   does what it says.
35. **Cleanup is logged.** After a run, a log names each removed item and its destination, and
   Recycle-Bin-destined items are actually restorable from there.
36. **Per-category ingest overrides work.** With subtitles set to auto-import and video set to
   review, a folder containing both routes each one differently in a single scan.
37. Full gates: `npx vitest run`, `node tools/i18n-check.cjs`,
    `node tools/architecture-audit.cjs`, `npx eslint <touched paths>`. `tsc --noEmit` is NOT a
    gate — 327 pre-existing errors; prove "no new" by set-difference.

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
