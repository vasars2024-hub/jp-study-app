// Build-status registry for the Scraper app.
//
// Every page, result tab and settings group registers a maturity here and
// renders a StatusDot from it; the Dashboard's Build Status panel is the
// roll-up. The point is that the interface never claims more than it does.
//
//   shell    (red)    — the surface exists and is populated with sample data,
//                       but nothing behind it is implemented.
//   untested (yellow) — implemented and believed to work; not yet exercised
//                       end to end against the real thing.
//   ready    (green)  — implemented AND verified end to end.
//
// Rule for future sessions: promote an entry only after actually exercising it.
// Anything unlisted reads as 'shell', so forgetting to register is safe.
//
// ---------------------------------------------------------------------------
// 2026-07-27: a real backend landed under `src/main/scraper`, so this file was
// re-derived from scratch rather than edited. Before that pass every entry read
// 'ready' while every screen was drawing sample data — the registry was the
// least honest thing in the app. What follows is what was actually run:
//
//   * verified live, against the real services (Jikan/AniList, nyaa.si,
//     the local file system, Electron's safeStorage) through the running app;
//   * or verified by the vitest suites in `src/main/__tests__/scraper*.test.ts`
//     against a local stand-in server, where the real service is something a
//     developer machine does not have (a running qBittorrent) or something that
//     needs a native dialog click (writing an export);
//   * or still drawing sample data, and marked 'shell' for exactly that reason.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2026-07-29: Phase 4's acceptance gate — "every `ready` entry is still `ready`
// on the new backend, re-verified live" — was run end to end through the
// running app, with main's log bus as the witness that each check reached the
// real backend rather than the sample-data fallback. 28 of 28 entries hold.
// One defect was found and fixed rather than papered over (`page.results`).
// The recorded runs are in docs/migration/proof/phase4-reverify-20260729/.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2026-08-02: the last three 'shell' entries were resolved, and two of them by
// deletion rather than promotion. A dot is a claim about a feature; when the
// feature is not going to exist in the form the surface drew, the honest fix is
// to remove the surface, not to keep a red dot over it forever.
//
//   * 'set.browser' — nine headless-browser controls (engine, viewport,
//     JavaScript wait, scroll passes, pre-extraction script) with no browser
//     automation anywhere in this project and none planned. Category and fields
//     deleted from settings/fields.ts. `ScraperSettings.browser` itself is
//     still in shared/scraperSettings.ts, because shared/connectionProfiles.ts
//     and the main Settings app's Scraper page both reference it — retiring the
//     model group means retiring the 'browser-assisted' connection preset with
//     it, which is a different feature's call to make.
//   * 'set.ui' — kept, and the earlier note on it was wrong. "Zero fields in
//     SCRAPER_FIELDS" was read as "nothing to read"; in fact the drawer renders
//     that category by hand and its six controls all act. Promoted, not
//     deleted. Details on its entry below.
//   * 'page.script-console' — built, read-only, see its entry below.
//
// One entry fewer, and one fewer red dot for a reason other than deletion. That
// is the point: this file counts features, not intentions.
// ---------------------------------------------------------------------------

export type FeatureStatus = 'shell' | 'untested' | 'ready';

export const FEATURE_STATUS: Record<string, FeatureStatus> = {
  // ---- Shell chrome ----
  'shell.nav': 'ready',
  'shell.search': 'ready',
  'shell.statusbar': 'ready',
  'shell.persistence': 'ready',

  // ---- Pages ----
  // The hero counts are live (sources, indexed episodes, subtitle tracks); the
  // panels below them — storage, learning, the activity strip — are not.
  'page.dashboard': 'untested',
  // The one surface that already had a backend: discovery:search|browse|detail.
  'page.discover': 'ready',
  // Verified live: a run against a title and against a URL, both producing real
  // episode rows, with cancellation and failure paths covered by tests.
  'page.new-scrape': 'ready',
  // Verified live: a job survived a restart and came back from disk.
  'page.history': 'ready',
  // Verified live: real probes of the catalogue, index and subtitle hosts.
  'page.sources': 'ready',
  // Phase 4, verified live 2026-07-28 and re-verified 2026-07-29: the inventory
  // card listed the sidecar's installed extensions through the real
  // renderer → IPC → main → Seanime path, with the onlinestream/torrent/manga
  // kinds distinguished. It reads the sidecar only and seeds nothing into the
  // user's editable web-source list.
  'page.sources.providers': 'ready',
  // Verified live: 68 real releases from nyaa.si, parsed and filtered.
  'page.torrents': 'ready',
  // Phase 4: the Seanime torrent-client / debrid / auto-downloader snapshot is
  // implemented and unit-tested (including the secret-stripping assertions), but
  // this machine has no configured torrent client or debrid account to read from,
  // so the populated states have never been seen. Deliberately not promoted.
  'page.torrents.acquisition': 'untested',
  // Profiles edit the settings document and nothing else reads them yet.
  'page.profiles': 'untested',
  // Verified live: a real cron computed in main, "Run now" starting a job that
  // ran to completion, the run record surviving a restart, and an edited cron
  // recomputing instead of keeping a stale next-run time.
  'page.scheduled': 'ready',
  // Verified live: a rule validated against a real page (28 episodes matched,
  // titled, linked and numbered) and consumed by the engine, which is covered
  // end to end against a local server in scraperEngineSiteRule.test.ts.
  'page.site-rules': 'ready',
  // Verified live: manifests read off disk, including a deliberately broken one.
  'page.plugins': 'ready',
  // Verified live: the library lists stored job results. Re-verified 2026-07-29
  // at the Phase 4 gate, which is where the per-job id bug surfaced — repeat
  // runs of one series read "500% catalogue coverage · 140 / 28". Fixed in
  // resultLibrary.ts (buildResultLibrary), covered by a regression test, and
  // re-checked live: 8 entries, each 100%.
  'page.results': 'ready',
  // Implemented against qBittorrent's transfer list and unit-tested; not run
  // against a live client.
  'page.downloads': 'untested',
  // The writer is tested against real files; the save dialog was not clicked in
  // an automated pass.
  'page.exports': 'untested',
  // Genuinely evaluates CSS and XPath in the renderer — no backend needed.
  'page.selector-tester': 'ready',
  'page.regex-tester': 'ready',
  // Verified live: real requests with real DNS/TLS/TTFB timings.
  'page.http-inspector': 'ready',
  // 2026-08-02: built as the page's own subtitle already described it — a fixed
  // allow-list of read-only inspection commands, not an evaluator. The list and
  // the resolver are `shared/scraperConsole.ts`; the consumer is
  // ScriptConsolePage in pages/ToolPages.tsx, which adapts the live ScraperPort
  // (backendCapabilities, systemStats, listJobs, listSources, listPlugins,
  // listExports) plus the renderer's own settings document and log tail. Ten
  // commands, each marked live or sample-data from main's capability list, so a
  // fixture can never pass for a reading. `developer.allowScriptConsole` gates
  // it and is what makes that toggle mean something.
  // Nothing here is inert. Nothing here executes user input, by design.
  // Re-verified live 2026-08-12: the locked state disabled the input and all
  // ten palette buttons; after an in-memory unlock, all ten commands returned
  // live readings through the running Electron app. No persisted setting was
  // changed by the acceptance pass.
  'page.script-console': 'ready',

  // ---- Result tabs ----
  // Rows, metadata and logs come from the job that produced them.
  'result.episodes': 'ready',
  'result.details': 'ready',
  'result.metadata': 'ready',
  'result.logs': 'ready',
  // Populated when the run searched an index.
  'result.torrents': 'ready',
  // Phase 4 live proof, 2026-07-28: job-ms54dwl9-1 resolved the installed
  // phase4-local-proof provider, retained its required header and Japanese VTT,
  // played the MP4 through VideoCore's authenticated proxy, and populated the
  // enabled mining draft from cue 2 (2500–5000 ms).
  'result.streams': 'ready',
  // Only the poster the catalogue publishes; no per-image inspection.
  'result.images': 'untested',

  // ---- Advanced Settings drawer groups ----
  // Every group edits and persists a validated settings document. What differs
  // is whether anything consumes the values yet.
  'set.sources': 'ready',
  'set.torrent': 'ready',
  'set.episodes': 'ready',
  'set.validation': 'ready',
  // The client and the credential vault are implemented and tested; a live
  // qBittorrent was not available to run against.
  'set.qbittorrent': 'untested',
  'set.logging': 'untested',
  'set.export': 'untested',
  'set.developer': 'ready',
  'set.profiles': 'untested',
  // 2026-08-02: five of these groups gained a consumer in src/main/scraper and
  // moved to 'untested'. Each is implemented and covered by vitest against a
  // local server; none has been driven through the running app, which is the
  // only thing that would make one 'ready'. Where a group has a field that is
  // still inert, the comment says which — the honest unit is the field, and a
  // group-level dot cannot express that on its own.
  //
  // Every request a run makes now resolves its user agent, headers, cookie,
  // timeout, redirect policy, retries, proxy (incl. rotation on retry),
  // concurrency limit and inter-request pause from the profile.
  // Unproven: verifySsl off, which needs a bad certificate to observe.
  'set.network': 'untested',
  // Reads and writes a real response cache keyed per kind, with the lifetime,
  // the per-kind switches, the size ceiling and "Offline — never refetch" all
  // acting. maxSizeMb is a memory ceiling: the cache does not survive a restart.
  'set.cache': 'untested',
  // maxParallelJobs gates job admission; batchSize sets the progress cadence.
  // Inert, with no consumer to wire them to: maxParallelDownloads,
  // memoryBudgetMb, cpuThrottlePercent, reuseBrowserContext, prefetchNextPage.
  'set.performance': 'untested',
  // cleanText, decodeHtmlEntities, ignoreHiddenElements, normalizeEpisodeNumbering,
  // detectSeasonNumbers, detectSpecials and removeDuplicateEpisodes all act on
  // rows; siteRules already did. Inert: cssSelectors, xpathSelectors,
  // regexPattern, regexFlags, attribute — they configure a generic extractor
  // this backend does not have.
  'set.extraction': 'untested',
  // providerOrder picks which catalogue is asked first; titleLanguage,
  // alsoStoreNativeTitle, fetchSynopsis/Genres/Ratings/AirDates shape the result;
  // cacheHours is the metadata cache's own lifetime. Inert: mergeStrategy (only
  // one provider ever answers) and fetchStaff (nothing here fetches staff).
  'set.metadata': 'untested',
  // safety.* is enforced per host in `main/scraper/safetyPolicy.ts` (crawl delay,
  // the per-minute window, domainRateLimits, and a failure circuit breaker),
  // respectRobotsTxt in `robots.ts` — for crawls, deliberately not for the app's
  // own catalogue and index endpoints — and session.* in `session.ts`, which is
  // where "Random (Recommended)" stopped being the option that did nothing.
  // The cookie jar is in memory, per job, never written to disk or logged.
  'set.antibot': 'untested',
  // The three Download switches decide whether the run collects that image at
  // all, which is what causes the only fetch there is; maxPerEntry caps the list
  // and preferredFormat picks among published variants. Inert, and named as such
  // in `imageSet.ts`: minWidth/minHeight (a catalogue publishes a URL, not a
  // pixel size), skipDuplicatesByHash (there are no bytes to hash) and
  // namingTemplate (it names files nothing writes).
  'set.images': 'untested',
  // quietHours, maxConcurrentScheduled, skipIfRunning, missedRunPolicy and
  // requireExternalPower are all read by `main/scraper/scheduler.ts`. Cron
  // arithmetic moved to `shared/scraperCron.ts` so main and the Scheduled Tasks
  // screen cannot disagree about what "next run" means.
  'set.scheduler': 'untested',
  // Five events a run can genuinely observe — complete, error, new-episode
  // (compared by episode id, not by count), schedule-run and study-ready (a real
  // subtitle track, not what a torrent index advertises). The decision half is
  // `shared/scraperNotices.ts` and testable without Electron.
  'set.notifications': 'untested',
  // Not empty after all, and the previous note here was wrong: 'ui' has no
  // entries in SCRAPER_FIELDS because its controls do not live in the settings
  // document. ScraperSettingsDrawer.tsx renders them by hand — compact window,
  // collapsed rail, advanced controls, result density, rows per page, default
  // result tab. 'Recent destinations' in that panel is a readout, not a setting.
  //
  // Five of the six write ScraperShellState through the controller, which
  // `shared/scraperShell.ts` validates and `shell.persistence` (ready) stores.
  // The sixth does not: 'Advanced controls' is renderer-local state with its own
  // key, `jp-scraper-advanced-v1` (ScraperApp.tsx's writeAdvancedMode). An
  // earlier version of this note claimed all six went through the shell
  // document; they do not, and the two are restored separately.
  //
  // Driven live 2026-08-12 through the running scraper pop-out at 900x640, each
  // with a witness that a no-op control could not produce: compact window
  // (`.scr-compact-tabs` 0 -> 4 buttons), collapsed rail (52px vs 205px with the
  // drawer closed, labels `display:none`), advanced controls (the Network group
  // loses its one `advanced: true` field, 13 -> 12), and density / rows-per-page
  // / default-tab (the persisted value and this panel's own readout follow).
  // Both storage keys were restored and asserted byte-identical afterwards.
  //
  // Two traps for whoever measures here next. `.scr-body` transitions
  // `grid-template-columns`, so a single round-trip after a click reads a
  // mid-transition width; and `@container scr-shell (max-width: 1100px)`
  // (scraper.css) pins the rail to 52px whenever the drawer is open, so rail
  // width only discriminates with the drawer closed.
  'set.ui': 'ready',
  // 'set.browser' used to sit here. The category was deleted from
  // settings/fields.ts rather than promoted — see the dated note above.
};

/** Unregistered ids read as unbuilt, which is the safe direction to be wrong in. */
export function statusOf(id: string): FeatureStatus {
  return FEATURE_STATUS[id] ?? 'shell';
}

const RANK: Record<FeatureStatus, number> = { shell: 0, untested: 1, ready: 2 };

/** Worst-of, for a rail group or a page that owns several sub-features. */
export function rollupStatus(ids: string[]): FeatureStatus {
  if (!ids.length) return 'shell';
  let worst: FeatureStatus = 'ready';
  for (const id of ids) {
    const s = statusOf(id);
    if (RANK[s] < RANK[worst]) worst = s;
  }
  return worst;
}

export interface FeatureStatusCounts {
  shell: number;
  untested: number;
  ready: number;
  total: number;
}

export function countFeatureStatuses(): FeatureStatusCounts {
  const counts: FeatureStatusCounts = { shell: 0, untested: 0, ready: 0, total: 0 };
  for (const status of Object.values(FEATURE_STATUS)) {
    counts[status] += 1;
    counts.total += 1;
  }
  return counts;
}

export function featureStatusEntries(): { id: string; status: FeatureStatus }[] {
  return Object.entries(FEATURE_STATUS).map(([id, status]) => ({ id, status }));
}
