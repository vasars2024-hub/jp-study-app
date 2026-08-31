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
   <!-- status: open; evidence: 2026-08-30 census omitted 19 live subtitles/<mediaId> files -->
   **2026-08-30 retraction:** the 1,760-item census proved five non-empty groups, but its Text
   readers omit the populated `subtitles/<mediaId>/` store, scan nested `yt-subs` as flat, and
   omit the distinct `subs-cache` flow. Gate 1 remains open until those readers and the live
   count are corrected; empty YouTube cache roots today are not a valid negative control.
2. A video transcribed earlier is findable in the Files app **without navigating to that video**.
3. One-click mine from the list works end to end for one item of each mineable kind.
4. Categorisation is derived: a newly transcribed video appears in the right place with no
   manual step.
5. Context entry from an epub page opens the Files app scoped to epubs with that book focused,
   and clearing the scope reveals the full tree in the same window.
6. Every action offered in the Files app is still reachable by its original route — enumerated
   route by route. A capability that became Files-app-only is a FAIL. The one permitted
   exception is memory/statistics (decision 1), which must be named explicitly in the report.
7. Notebook is deleted with its features absorbed: notes survive the migration with a stated
   count, and `DesktopWinSection`, the palette, agent navigation and all four i18n catalogs are
   consistent afterwards (`node tools/i18n-check.cjs` exit 0).
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
13. **The assistant can reach it.** A natural-language request resolves to a scoped Files view
   through `AGENT_NAVIGATION_INDEX`, not a bespoke path.
14. **Sorting is real.** Sorting by date created and by size reorders correctly on a set with
   known values, in both directions, including items whose store supplies no such value — those
   must sort predictably rather than landing arbitrarily.
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
