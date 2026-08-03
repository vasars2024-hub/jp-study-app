# §21 — Architecture Streamline & Optimization Audit (state report)

Tracks `docs/MASTER_PLAN.md` §21. Built 2026-07-25 on `grammarx/phase-1-5`, after §2
and §20 in the same run.

**Run status: completed. The audit exists, and the backlog it found has been worked
down from 58 findings to 18 — 14 of them classified as intentional and 4 genuinely
open.** Everything structural is gone: **0** import cycles in `src/shared`, **0** layer
violations, **0** dead/phantom/duplicate IPC channels, **0** unintentional orphans, and
every storage key and duplicated export that had two owners now has one.

> An earlier draft of this report said the 45 pending findings were deliberately left
> for a later session. They were then fixed in the same run; the sections below are
> written as of that work.

## The shape this phase had to take

§21 is the one section that says *"the objective is **not to add features**"*. It asks
for a review: find duplicate systems, unused code, redundant databases, repeated
settings, conflicting workflows, and broken module boundaries.

A prose audit would have been the wrong deliverable. This repo already has several —
`EXTENSION_AUDIT_REPORT.md`, `PHASE_3_AUDIT.md`, `PHASE_6_5_AUDIT.md`,
`TOOLBOX_COMPLETION_AUDIT.md` — and every one of them was true on the day it was
written. The tree gained 223 untracked files since the last of them.

So §21 shipped the way `i18n-check` and `blanc-drift` did: **a checker plus a committed
classification**, so the audit re-runs itself and only *new* problems are loud.

## What shipped

| File | Role |
| --- | --- |
| `tools/architecture-audit.cjs` | Plain node, no build step, `--json` / `--update-baseline`, exit 1 on anything unclassified |
| `tools/architecture-baseline.json` | 58 findings, each `accepted` or `pending` with a written reason |
| `src/shared/__tests__/architectureBaseline.test.ts` | Puts the checker on the vitest suite, with a hard ratchet on the three boundary rules |
| `src/renderer/storeIds.ts` | `nowIso` / `nextLocalId`, extracted after the checker flagged the second copy |
| *(deleted)* `src/shared/guessCountry.ts` | Orphaned module whose only export was already duplicated in `stats.ts` |

The nine checks, and the §21 ask each serves:

| Check | §21 ask |
| --- | --- |
| `orphan-module` | "unused features", "unused code" |
| `test-only-module` | shipped code reachable only from its own test |
| `layer-violation` | "module boundaries" — shared ↛ main/renderer, main ↛ renderer |
| `shared-cycle` | "duplicate systems" — import cycles inside `src/shared` |
| `dead-ipc` | "API communication" — a handler or push nothing consumes |
| `phantom-ipc` | a caller with no handler — a runtime failure waiting |
| `duplicate-ipc` | one channel registered twice; Electron keeps the last silently |
| `duplicate-storage` | "redundant databases" — one key written by two modules |
| `duplicate-export` | "duplicate functionality" — one name from two modules |

## Verification

Full suite **2,173/2,173**. `node tools/architecture-audit.cjs` exit 0 —
**18 findings, 14 accepted, 4 pending**. `node tools/i18n-check.cjs` exit 0. ESLint
clean on every touched file. `vite build` clean. `tsc --noEmit` **243 errors, down from
256** at the start of the session; none in anything touched here.

**Verified in the running app**, which matters for a refactor this wide: it boots with
**zero renderer errors** after ~25 files changed, and the biggest single change was
proved end-to-end. Seeding the store with a deliberately malformed `"  EN  "` and
reloading, the Translate view still resolves it to English — before the refactor only
the two readers normalised, so the five consumers of that key disagreed with each other.

## Getting the checker to a point where its output was worth reading

The first run produced 153 findings. **35 of them were false**, and the interesting part
of this phase was finding that out rather than publishing the number.

| Wrong finding | Cause | Fix |
| --- | --- | --- |
| 34 × `phantom-ipc` on live `ai:*` and `city:*` channels | `main/mining.ts` registers ~90 channels through a local `bind(channel, handler)` wrapper; `main/city/ipc/handlers.ts` uses imported constants. Only literal `ipcMain.handle('x')` was recognised. | Detection is now **precise at the call site, tolerant at the other end**: a finding is raised only from an explicit literal call, and only when the name appears *nowhere* on the other side. |
| 1 × `duplicate-ipc` on `extension:ui-open` | `webContents.send` was counted as a registration. Two senders of one event is normal. | Only `ipcMain.handle` counts; a second handler is a real defect because Electron drops the first. |
| 2 × `orphan-module` on `whisperWorker.ts`, `csvParse.worker.ts` | Vite takes worker entries as `new Worker(new URL('./x.ts', import.meta.url))`, which is not an import statement. Five call sites were spawning them. | That form is now an edge in the graph. |
| 55 × `duplicate-storage` | `settingsCatalog.ts`, `storage.ts` and `storageMigrationBoundary.ts` exist to enumerate every key. Counting them as owners flagged all 69 keys — the same as flagging none. | Registry modules excluded; only *writers* count, and `…-changed` event names are skipped. |

That is 153 → 58, and the survivors were spot-checked by hand. **A checker that cries
wolf gets muted, and a muted checker is worse than none** — the precision work was the
phase, not an aside.

## The findings that matter

**Verified by hand, all real:**

- **`src/main/city/` contains four React components.** `NoctisWorkspace.tsx` imports the
  renderer's UI kit, and `renderer/components/AppSection.tsx:9` lazy-imports it back
  *out* of the main tree. The main process never touches them. This is renderer code
  filed under `main/`.
- **`src/renderer/views/BookReader.tsx` is unreachable** — zero references anywhere. It
  is also **modified in the working tree**: someone has been editing a file the app
  cannot open. Two of the `duplicate-storage` findings are duplication *with this dead
  file*.
- **`dict:updated` is sent and never heard.** `main/dictionary/yomitan.ts` pushes it;
  nothing listens. The comment at `main.ts:1242` states that "a `dict:updated` event
  refreshes the UI" — it does not.
- **`buddyScheduler:testFire` and `library:updateOcrMeta`** are registered handlers with
  no caller.
- **`epubDeck.ts` and `epubEnrichment.ts` export three identically-named helpers**
  (`candidateLookupKey`, `glossFromEntry`, `pickDictEntry`) — the strongest
  duplicate-system signal in the set.
- **`jp-study-translate-target` is written by six modules.** The widest ownership gap in
  the app.
- **`src/shared/types.ts` is not a leaf.** It imports `mediaHub`, which imports back;
  cutting that one edge clears three of the ten cycles.

**Judged intentional (13 entries, each with a written reason):** `catalogs/all.ts` being
test-only is mandated by CLAUDE.md; `THEMES`, `translate` and `LANG_LABELS` are
same-name/different-domain pairs the project keeps deliberately separate; `jp-user-css`
matches the key convention by coincidence and is a DOM element id.

## Working the backlog down: 58 → 18

### Dead IPC (3 → 0)

`buddyScheduler:testFire` and `library:updateOcrMeta` were handlers with no caller —
deleted. `dict:updated` was a push nothing listened for; the send is gone and the
comment at `main.ts:1242` that claimed it "refreshes the UI" now says what actually
happens (every consumer awaits `initYomitan()`, so none needs telling).

### Orphaned modules (11 → 1)

Two were false — Vite takes worker entries as `new Worker(new URL(…))`, which the
scanner now follows. Seven were genuinely unreachable and were removed:
`views/BookReader.tsx` (1,134 lines, superseded by `NovelReader`, and *modified in the
working tree* — someone was editing a file the app cannot open), `views/ComingSoon.tsx`
with its dead partner `components/Sidebar.tsx`, `theme/ThemeContext.tsx` ("adoption is
optional", never adopted), `MiningVariablePalette.tsx` (`FieldMappingEditor` has the
same palette inline), `csv-editor/HighlightText.tsx` (never adopted), and
`city/ipc/events.ts` — a file whose entire content was a comment explaining that it was
empty, folded into `channels.ts`. `shared/guessCountry.ts` went too: orphaned *and* its
sole export already existed in `stats.ts`.

Copies of all seven are in the session scratchpad under `removed-orphans/`, because
`BookReader.tsx` carried uncommitted edits that `git checkout` could not restore.

**`theme/tokens.ts` was not deleted**, though it was an orphan. Two plan documents say
to keep it in sync with `tokens.css` by hand, and nothing read it — so nothing noticed
drift. `renderer/__tests__/themeTokenMirror.test.ts` now checks every mirrored token
against the CSS, every helper's `var()` reference, and that the reference doc's source
has no undocumented or duplicated entries. A stale mirror became a checked contract.

### Import cycles in `src/shared` (10 → 0)

All three clusters had the same shape: **a module that owns types while also acting as
a barrel over the modules that import those types back.**

- `types.ts` → `mediaHub` → `mediaCategories`/`mediaFileIdentity` → `types.ts` (3
  cycles). `mediaCategory()` reads four fields, so it now asks for those four
  structurally instead of importing `MediaItem`. `mediaCategories.ts` imports nothing.
- `profiles.ts` ⇄ `seedProfiles.ts` (3 cycles). `profiles.ts` owns the types;
  `seedProfiles.ts` owns the catalog. The `SeedProfileId` alias and a
  "backward compat" re-export block pointing back at the catalog were the cycle — three
  consumers now import from the catalog directly.
- `mining.ts` ⇄ `epubDeck`/`epubEnrichment`/`fieldRouter`/`aiLanguageLayouts` (4
  cycles). The 383 lines of definitions moved to a new leaf, `miningTypes.ts`; `mining.ts`
  stays a barrel that re-exports it, so **no consumer changed**. This is the same move
  §10 made with `mediaCategories.ts`.

### Duplicate exports (9 pending → 0)

Where the implementations agreed, they converged: `DEFAULT_PROFILE_ID`, `formatBytes`
(the tested `assetRegistry` one, which also handles TB), `schemeForLang`, and
`pickDictEntry`/`glossFromEntry` in `epubDeck` (the enrichment versions are equivalent
for `'en'`/`'ja'` and strictly more correct on mixed-script entries).

Where they *differed*, the collision itself was the hazard, so the narrower one was
renamed rather than silently merged: `dayLabel` → `weekdayInitial` (one takes an ISO
date, the other an offset), `buildCardTemplates` → `buildAnkiCardTemplates` (different
return shapes for different targets).

`hasKanji` had **three** implementations with three different character ranges — two
exported, one local in `SubtitleCueLine`. `shared/furigana` is now the single
definition, widened to the union of all three (the full CJK block, extension A, 々, and
the 〆ヵヶ marks).

The worst of the set: `epubDeck` and `epubEnrichment` both exported
`candidateLookupKey` with **different signatures and different implementations**, and
`mining.ts` re-exported one while `epubDeck` used the other.

### Duplicate storage keys (11 pending → 0)

Every key with two writers got one owner.

- **`jp-study-translate-target` had five**, each with its own constant and its own
  normalisation — the two readers trimmed and lower-cased, the others did not, so a
  value written by one was not the value another read back. New `translateTarget.ts`
  normalises on write as well as read, so a store written by an older build heals.
- The five `jp-pending-*` view-to-view handoffs became `pendingHandoff.ts`, with the
  storage declared **per key**: the mining handoffs stay `localStorage` (the target view
  can be several navigations away), the media ones stay `sessionStorage` (a handoff must
  not outlive the window). Both behaviours were already in the call sites. `takeHandoff`
  reads and clears in one step so a view that mounts twice cannot act on one twice.
- `jp-os-reduce-motion` is a *mirror* of `displayPrefs.animationLevel`. Three modules
  wrote it directly, leaving the mirror and the preference disagreeing until the next
  `applyDisplayPrefs` overwrote them. They now go through `getReduceMotion` /
  `setReduceMotion`.

### The layer violation (1 → 0), by fixing the rule

`src/main/city/` is not "the main process" — it is a **188-file self-contained
subsystem** (its own docs, assets, engine, service, ipc, rendering and ui) that happens
to live there. Its `ui/` and `rendering/*.tsx` are React, are documented as such by
their own READMEs, and are imported only by the renderer. Moving six files out would
scatter a coherent unit to satisfy a path convention.

So the zone is *declared* rather than moved — narrowly (the `ui/` folder plus `.tsx`
under `src/main/`), with the hazard that actually matters checked instead: a new
`main-imports-renderer-zone` finding fires if real main-process code imports one, which
is what would pull React into the main bundle. Declaring all of `rendering/` was too
broad on the first attempt and immediately flagged `rendering/manifest.ts`, which is
plain data the main-side asset validator legitimately reads.

### Two pre-existing bugs surfaced on the way

`main/mining.ts` imported `DEFAULT_TRADITIONAL_MINING_CONFIG` in **both** an
`import type` block and a value block — TypeScript erases the first, so the value import
was the only reason it worked. Removing the type-block entry cleared ten `tsc` errors
and revealed the second: **`buildEpubDeckExport` is called in `main/mining.ts` and was
never imported**, a latent `ReferenceError` on the EPUB deck-export path, present at
`HEAD`. Now imported from the defining module.

## What is left, and why

Four `test-only-module` findings, all the same honest shape: `shared/csvPaste.ts`,
`shared/episodeProcessing.ts` (§1), `shared/mediaProviderSyncJournal.ts` (§7) and
`shared/subtitleMatching.ts` (§8) are pure layers that are built and tested but have no
consumer yet. Three of the four are boundaries their own phase reports already state
deliberately — there is no connector to apply them to. Wiring them is feature work, not
cleanup, so they stay classified `pending` with the reason written down.

## Roadmap coverage

| §21 roadmap piece | Status | Where / note |
| --- | --- | --- |
| Feature audit: duplicate functionality, unused features, redundant databases, repeated settings | **Finished (detection)** | Five of the nine checks; 45 open items classified |
| System architecture review: module boundaries, import graph, API communication | **Finished (detection)** | `layer-violation`, `shared-cycle`, the three IPC checks |
| Remove duplicate/unused code | **Started** | 3 removed; 45 catalogued with owners and notes |
| Final Quality Check ("no duplicate systems", "no unnecessary modules", …) | **Answered honestly** | The checklist now has a command behind it instead of a claim |
| Core platform layer / unified data model / unified pipelines | **Not started** | Genuine architecture work, not detectable by a linter; needs the backlog above resolved first |
| Search consolidation, Japanese language engine consolidation, settings consolidation | **Not started** | §6 and §14 built the shared engines; *retiring* the older paths is the open half |
| Performance, security review, testing, developer experience | **Not started** | §22's territory for the testing half |

## Next milestone for §21

The detection half and the cleanup half are both done; what is left of §21 is the part a
linter cannot find. In rough order of value:

1. **Retire the older paths §6 and §14 replaced.** Those phases built the shared search
   and language engines; nothing has yet deleted what they superseded, and a duplicate
   system that still compiles is invisible to every check in this tool.
2. **The Core platform layer / unified data model** §21 describes — one settings
   service, one media pipeline. That is genuine architecture, and it wants the backlog
   above cleared first, which it now is.
3. **Wire the four pending pure layers** (`csvPaste`, `episodeProcessing`,
   `mediaProviderSyncJournal`, `subtitleMatching`) as their phases reach the point of
   having something to connect them to.

The ratchet in `architectureBaseline.test.ts` is now **zero** for layer violations,
renderer-zone imports, shared cycles, and all three IPC checks, so none of that can come
back quietly.
