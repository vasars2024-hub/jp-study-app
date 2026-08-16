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

## Deletion, and why it gets its own section

There is no userData restore point. `downloads`, `models`, `wallpapers`, `library` and
`artwork` have no copy anywhere, and this app's own skill documentation refuses operations that
delete media for exactly that reason. A file manager whose whole idiom is "select and delete"
sitting on top of unbacked media is the single most dangerous thing in this plan.

Rules: deletion states what will be removed and its size before acting; media deletion is
guarded separately from index deletion; removing a *derived* item (a transcript, a CSV export)
is distinguished in the UI from removing an *irreplaceable* one (a downloaded video); and
nothing cascades silently.

## Gates

Numbers, never adjectives. An empty result is a FINDING — say so and stop.

1. The index enumerates real items across all five groups, reporting a count per category that
   matches what is on disk / in the tables. A category reading 0 while items exist is a FINDING.
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
16. Full gates: `npx vitest run`, `node tools/i18n-check.cjs`,
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

_(none yet — opened 2026-08-16)_
