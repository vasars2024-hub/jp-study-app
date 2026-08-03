# §2 — Connection Profiles (state report)

Tracks `docs/MASTER_PLAN.md` §2. Built 2026-07-25 on `grammarx/phase-1-5`, same
incremental, untracked-files house style as §6 (Unified Search), §7 (Global Media
Provider System), §8 (Subtitle Provider System) and §10 (Media Hub).

**Run status: completed.**

## Why this slice

§2 was the last section of Part I with **no implementation at all** — nothing in the
tree matched `connectionProfile` before this run. It was easy to mistake for done,
because §1 (`shared/scraperSettings.ts`, 1,152 lines) already ships profiles, three
presets, per-site overrides, version history and import/export, and §2's spec re-lists
most of the same network/browser/header/cache/safety fields.

The parts §2 asks for that §1 genuinely does not have:

- **Rule inheritance** — "one profile inherits from another and overrides only a few
  settings". §1 profiles each carry a full settings snapshot; nothing composes.
- **The six named presets** — Fast, Balanced, Conservative, Metadata Only, Browser
  Assisted, Low Bandwidth. §1 has three (fast/balanced/thorough).
- **Monitoring** — response time, success rate, failure rate, last successful scrape,
  error categories, request history, per-profile performance statistics.
- **Logging** — network / browser / parsing / error channels, debug mode, export,
  performance timeline.
- **Profile comparison**, **icon + tags**, **clone**.
- **A diagnostics page** summarizing connection quality, parsing success, cache
  efficiency.
- **Scheduled health checks** (per profile — §3's are per site).
- **Batch scraping queues** with pause/resume and priority.

## What shipped

| File | Role |
| --- | --- |
| `src/shared/connectionProfiles.ts` | The whole pure layer: profiles, inheritance, presets, monitoring, diagnostics, comparison, logging, health checks, queue, portability |
| `src/shared/__tests__/connectionProfiles.test.ts` | 51 tests |
| `src/renderer/connectionProfilesStore.ts` | The impure boundary — clock, ids, localStorage, change events |
| `src/renderer/components/settings/pages/ConnectionProfilesPanel.tsx` | Eight settings cards covering every §2 surface |
| `src/renderer/__tests__/connectionProfilesPanel.test.ts` | 3 render/registration tests |
| `src/renderer/components/settings/pages/ScraperPage.tsx` | Mounts the panel first, with its own search terms |
| `src/renderer/components/settings/settingsRegistry.ts` | `connection-profiles` search entry (page `scraper`, group Media, advanced) |
| `src/shared/i18n/catalogs/{en,ja,zh,ru}.ts` | 148 `connection.*` keys in all four languages |

**Verification:** full suite 2,159/2,159 (was 2,054 passing + 1 failing).
`node tools/i18n-check.cjs` exit 0. ESLint clean on every touched file.
`tsc --noEmit` reports zero errors in them.

`connectionProfiles.ts` is pure and deterministic: no I/O, no `Date.now()`, no
`Math.random()`. Every function that needs a timestamp or a new id takes one.

## The decision that shaped everything else

**§2 is a layer over §1, not a second copy of it.** A `ConnectionProfile` holds a
*sparse override* (`ConnectionOverrides`, the same patch shape `patchScraperProfile`
takes) plus an `inheritsFrom` edge; `resolveConnectionSettings` walks the chain
root-first and merges each level with §1's own `mergeScraperSettings`. The settings
shape, its validator and its defaults stay in §1 and are never redeclared here.

That is what makes the six presets one-liners: `conservative` says only that
concurrency is 1 and robots.txt is respected, and everything else keeps coming from the
shared base. `balanced` is literally `{}`.

## Design decisions worth remembering

- **`authentication` is deliberately not overridable.** It holds account labels and
  opaque credential references; silently inheriting one profile's account into another
  is the kind of surprise §2's own Safety section exists to prevent.
- **Cycles are cut once, at normalization, and reported.** A hand-edited or merged
  export can describe `a → b → a`; `setConnectionProfileParent` refuses to create one,
  and `connectionInheritanceChain` is cycle- and depth-guarded anyway because callers
  can build a document by hand.
- **Deleting a profile re-points its children at its own parent**, so removing a middle
  profile does not silently flatten a whole branch back to the base.
- **Parsing is only counted where parsing happened.** A cache hit and a transport
  failure never reached the parser. Counting them as parse failures would make the
  "parsing success" figure track network health instead of selector health — and
  selector drift is exactly the thing that number exists to catch.
- **A profile with no parse attempts reports 100%, not 0%.** "Not measured" is not
  "failing"; a hard zero would drag a cache-only or metadata-only profile's score down
  for doing its job.
- **Log entries carry a stable `code`, never an English sentence** — the renderer is the
  only place that calls `t()` on it. Same contract as `AssetError` in the download
  manager. So are diagnostic notes (`low-success`, `parse-drift`, …).
- **Queue ordering is total**: priority, then `enqueuedAt`, then id. Two jobs enqueued
  in the same millisecond must still have a defined winner or the queue is
  non-deterministic across reloads.
- **Export carries configuration only.** Stats, request history, logs and the queue are
  this machine's operational record; shipping them to another install would import
  someone else's health scores as if they were yours. Import likewise replaces
  configuration and keeps local history, dropping only the history of profiles the
  import removed.

## Roadmap coverage

| §2 roadmap piece | Status | Where / note |
| --- | --- | --- |
| Profile name, description, icon, tags, default/custom | **Finished** | `ConnectionProfile` |
| Import/export, clone, version history, rollback | **Finished** | `exportConnectionProfiles`, `cloneConnectionProfile` (plain or inheriting), `rollbackConnectionProfile` |
| Network / Browser / Headers / Cache / Safety fields | **Finished (via §1)** | Overridden through `ConnectionOverrides`; the fields live in `scraperSettings.ts` |
| Authentication | **Finished (via §1), not inheritable** | Deliberate — see above |
| Site overrides | **Finished** | `siteAssignments` maps a host to a profile; §1 keeps its own per-site settings snapshots |
| Monitoring: response time, success/failure rate, last successful scrape, error categories, request history, profile statistics | **Finished** | `recordConnectionAttempt` + `profilePerformance` |
| Logging: network/browser/parsing/error, export, debug mode, performance timeline | **Finished** | `appendConnectionLog`, `exportConnectionLogs`, `connectionTimeline` |
| Six built-in presets | **Finished** | `CONNECTION_PRESET_OVERRIDES` |
| UI: search, live validation, profile comparison, one-click switching, import/export | **Finished** | Panel + `compareConnectionProfiles`; search terms via ScraperPage's existing filter |
| Rule inheritance | **Finished** | `inheritsFrom` + `resolveConnectionSettings` |
| Diagnostics page (connection quality, parsing success, cache efficiency) | **Finished** | `diagnoseConnectionProfile` |
| Scheduled health checks | **Finished (scheduling)** | `dueHealthChecks` / `markHealthChecked` — *what* a check does needs a connector |
| Batch queues with pause/resume and priority | **Finished (model)** | `nextConnectionJobs` decides what runs; nothing here runs it |
| Bandwidth limits, HTTP/2, DNS cache, keep-alive, compression | **Not started** | Transport knobs with no transport to apply them to; would be dead settings |
| Visual selector editor, layout-change detection, scrape simulator | **Not started** | Needs a live connector — §2's "additional ideas", not its core |
| Plugin SDK for site connectors | **Not started** | Cross-cutting; §21's territory |

## The honest boundary

Nothing in this phase opens a socket. §2 is configuration and record-keeping: the
profiles describe how a connector *should* behave, the monitoring records what one
*did*, and the queue says what *should* run next. A connector that honours any of it
does not exist yet — the same boundary §8 drew for subtitle providers. Every number in
the diagnostics panel is zero until something calls `recordConnectionAttempt`, and the
panel says so ("No requests recorded for this profile yet") rather than rendering a
confident 0%.

## Next milestone for §2

Wire `getConnectionSettings(site)` into the one place that already makes real requests —
`main/readingFetch.ts` and the `net:*` handlers in `main/library.ts` — and have it call
`recordConnectionAttempt` on the way out. That turns the whole monitoring/diagnostics
half from a model into live data without adding a connector framework, and it is the
smallest change that makes the numbers real.
