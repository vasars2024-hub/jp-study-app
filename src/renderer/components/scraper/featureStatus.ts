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
  // 2026-08-12 live acceptance matched the rendered page to direct IPC:
  // capabilities, sources, jobs/results, downloads and system stats. The Live
  // data badge, hero/tiles, recent jobs, source health and runtime all agreed;
  // five quick routes landed on their owning pages at 900x640 with no errors.
  'page.dashboard': 'ready',
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
  // Live-accepted 2026-08-12: cards, activation, duplicate/create/delete,
  // comparison, identity editing, overrides, revisions and JSON transfer all
  // persisted through the shared settings document; runtime consumers are
  // covered by the focused settings-model suite.
  'page.profiles': 'ready',
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
  // 2026-08-12: lines written through the running app. Seven real jobs were
  // started over `scraper:startScrape` with the active profile's document and
  // only its Logging group varied; each used `contentType: 'manga'`, which
  // throws in `engine.ts:726` after the scope is built and before any network
  // call, so a whole job scope is exercised without a single request. Both the
  // in-app stream (`scraper:logs:subscribe`) and the file under
  // `<userData>/scraper/logs` were read after every job:
  //   level     — a `silent` job's own error line reached neither; the info line
  //               queued under the previous job's policy still did.
  //   channels  — two jobs identical but for `channels`: `['engine']` recorded
  //               the engine line, `['http']` recorded nothing. Empty is "all".
  //   persist   — `persistToDisk: false` put the line in the stream and added
  //               zero bytes to the file; the next job put it back on disk.
  //   redaction — a `?token=…` in the job's target reached both the stream and
  //               the file as `token=‹redacted›`, so the read-only 'note' row's
  //               guarantee holds live, not just in the unit test.
  // The scope note at the top of logBus.ts is confirmed rather than assumed: a
  // policy set by one job governed the *next* job's pre-scope line every time.
  //
  // Two fields stay test-only, deliberately, and the dot does not claim them:
  // `maxFileSizeMb` rotation cannot be provoked with less than 1 MB of synthetic
  // lines (`appendToDisk` floors at `Math.max(1, …) * 1024 * 1024`), and
  // `retentionDays` only deletes when a file is older than the window — 14 days
  // here, with nothing on disk older than 7. `pruneOldLogs` did run live on the
  // persist toggle and correctly removed nothing; all seven older files stayed
  // byte-identical. Both paths are covered by scraperLogBus.test.ts and neither
  // can be driven further without writing into or deleting from the userData
  // tree, which is not a trade this check is allowed to make.
  'set.logging': 'ready',
  'set.export': 'untested',
  'set.developer': 'ready',
  'set.profiles': 'ready',
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
  //
  // 2026-08-12: driven through the running app against a local origin, so the
  // policy was measured where it lands — at the server — and not at the call
  // site. A site rule wins over the catalogue for its own host
  // (`engine.ts:720`), so a rule for 127.0.0.1 whose `episodeSelector` matches
  // nothing makes `runWithSiteRule` issue exactly one `scraperRequest` inside a
  // real runtime scope and then fail, which is why no run reached AniList, nyaa
  // or the job history. Fourteen jobs over `scraper:startScrape`, each sent the
  // active profile's own document with only the Network group varied and the
  // Safety group pinned neutral so nothing else could explain a difference:
  //   userAgent/headers/cookieHeader — a named agent, `X-Netprobe` and `np=n1`
  //     arrived verbatim; with the three fields empty the same request carried
  //     a session-pool fingerprint instead, which is session.ts's documented
  //     "the pool only ever fills a gap".
  //   requestTimeoutMs — 1000 against a 2500ms responder failed at 1059ms with
  //     `Timed out after 1000ms`; 5000 against the same responder got its page.
  //   followRedirects — one 302 fetched two paths with it on, one with it off.
  //   retryAttempts/retryDelayMs — a permanent 503 was requested once at 0 and
  //     three times at 2, spaced 708ms and 710ms for a 700ms delay.
  //   proxyUrl/proxyRotation — the request arrived at the proxy in absolute
  //     form; with a rotation entry added, attempt 0 went through the first
  //     proxy and the retry through the second.
  //   randomDelayMinMs/MaxMs — 2ms from `startScrape` to the socket at 0, and
  //     1508ms at 1500.
  //   verifySsl — the field the note above called unproven. Against a
  //     self-signed HTTPS origin, `true` failed with `self signed certificate`
  //     and the server logged no request at all; `false` on the same URL got a
  //     200 through. The handshake, not the response, is what the flag decides.
  //
  // `concurrentRequests` stays test-only and the dot does not claim it: the
  // gate is per job scope, and the only vehicle into a scope that needs no real
  // network makes exactly one gated request, so a limit of 1 and a limit of 4
  // are indistinguishable from here. scraperNetworkPolicy.test.ts asserts the
  // semaphore's high-water mark directly.
  'set.network': 'ready',
  // Reads and writes a real response cache keyed per kind, with the lifetime,
  // the per-kind switches, the size ceiling and "Offline — never refetch" all
  // acting. maxSizeMb is a memory ceiling: the cache does not survive a restart.
  //
  // 2026-08-12: driven live on the same vehicle as `set.network` above — a site
  // rule for 127.0.0.1 whose selector matches nothing, so each job makes exactly
  // one `scraperRequest` and then fails before `onFinished`. The witness is the
  // local server's request log, which is the only one that can tell a cache hit
  // from a fast fetch: a hit means **no socket was opened at all**.
  //   htmlEnabled/metadataEnabled/thumbnailsEnabled — each switch was driven as
  //     a triple (store, hit, then the same URL with only that switch off, which
  //     went back to the network). The metadata and thumbnail triples ran with
  //     `htmlEnabled: false` throughout, so they prove `cacheKindFor` routing
  //     and not merely "the cache is on".
  //   mode — `offline` against a URL never fetched threw `Offline cache mode: …
  //     is not in the cache` with the server logging **zero** requests, so the
  //     socket really is not opened; `offline` against a URL already stored
  //     served it, also with zero requests.
  //   lifetimeMinutes — driven by real elapsed time, not by a clock seam: stored
  //     at `lifetimeMinutes: 1`, an immediate repeat was a hit, and the same URL
  //     under the same settings 66s later went back to the network.
  //   metadata.cacheHours — the override in `cachePolicyFrom` is load-bearing
  //     and was separated three ways at `lifetimeMinutes: 0`: a metadata URL
  //     with `cacheHours: 168` cached, an html URL did not, and a metadata URL
  //     with `cacheHours: 0` did not either.
  //   maxSizeMb — five 3.4 MB bodies against a 16 MB budget. Capacity is four,
  //     and every subsequent request predicted which entry the next store would
  //     evict; nine rows agreed. One predicted hit came back a miss, and the
  //     reason is the property the module comment claims: a *hit* re-inserts, so
  //     it moves its entry off the front of the eviction order. This is the LRU
  //     it says it is, and the order is observable from outside the process.
  // Not driven: "does not survive a restart", which is structural — `store` is a
  // module-level `Map` (httpCache.ts:149) with no disk path to test.
  'set.cache': 'ready',
  // maxParallelJobs gates job admission; batchSize sets the progress cadence.
  // 2026-08-12 live acceptance used two simultaneous three-attempt jobs: at 1,
  // every socket for A opened before B; at 2, A and B interleaved. A three-row
  // site-rule run emitted progress 1/2/3 at batchSize 1 and only 3 at 50 while
  // emitting all three row events in both cases. Inert, with no consumer to
  // wire them to: maxParallelDownloads, memoryBudgetMb, cpuThrottlePercent,
  // reuseBrowserContext, prefetchNextPage. The status does not claim those five.
  'set.performance': 'ready',
  // cleanText, decodeHtmlEntities, ignoreHiddenElements, normalizeEpisodeNumbering,
  // detectSeasonNumbers, detectSpecials and removeDuplicateEpisodes all act on
  // rows; siteRules already did. Inert: cssSelectors, xpathSelectors,
  // regexPattern, regexFlags, attribute — they configure a generic extractor
  // this backend does not have.
  // 2026-08-12 live acceptance compared the same four-row site-rule page with
  // all seven switches off and on. The enabled run skipped a hidden template,
  // decoded entities, removed zero-width text, normalized episode titles,
  // detected seasons 2/3 and OVA/Special kinds, and removed the repeated S2E1.
  // The five generic-extractor fields above remain explicitly inert.
  'set.extraction': 'ready',
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
  //
  // 2026-08-12: driven live on the same vehicle as `set.network` and `set.cache`
  // above, with one change that is the whole reason this group could be measured.
  // Pacing needs several requests inside ONE runtime scope and a site rule makes
  // exactly one — so the vehicle is the **retry ladder**: a route answering a
  // permanent 503 turns one job into `retryAttempts + 1` requests on one host,
  // because `waitForTurn` is called per attempt (http.ts:637). The witness is a
  // local server's request log, read only as "when did a socket open here".
  //   crawlDelayMs — five requests 0/2/3/4ms apart at 0, and 809/806/799/787ms
  //     apart at 800. Same URL, same profile, nothing else varied.
  //   maxRequestsPerMinute — at a limit of 2 the third request arrived 60004ms
  //     after the first, which is `window[0] + WINDOW_MS` to the millisecond.
  //   pauseAfterFailures/pauseDurationMs — separated three ways against the
  //     permanent 503: threshold 3 / 5s paused 5011ms after the third failure,
  //     threshold 3 / 15s paused 15004ms, and threshold 2 / 5s moved the gap to
  //     after the second *and* re-armed once more (5016ms, then 5009ms) — which
  //     is `noteFailure` resetting the streak when it trips rather than leaving
  //     it at the threshold. The disk log's own "Pausing requests to …" lines
  //     agree with the request log on every trip.
  //   domainRateLimits — no drawer control, driven anyway at a global limit of 2:
  //     key `127.0.0.1` and key `.0.0.1` each raised it to 600 and the job ran
  //     unthrottled, while key `localhost` against that same host did not match
  //     and the third request waited 60022ms. An override that *raises* a limit
  //     wins, which is the half a clamp would have quietly broken.
  //   respectRobotsTxt — on, against `Disallow: /`, the server logged the
  //     `/robots.txt` fetch and **never the page**, and the job failed
  //     `robots.txt disallows …`; off, the same origin fetched the page and never
  //     asked for robots at all. `Allow: /public/` beat `Disallow: /` on a longer
  //     path, and an origin whose robots.txt 404s got its page — failure is open,
  //     as the module says. Rules are cached per origin for the process's life
  //     and `resetRobotsCache` has no production caller, so one origin can only
  //     ever be measured against one robots.txt per app run.
  //   consistentFingerprint — five requests carried one pool identity with it on
  //     (a Safari string, so demonstrably not the hard-coded fallback) and four
  //     distinct pool identities with it off. A named `network.userAgent` was
  //     never overridden either way.
  //   persistAuthenticatedSession — with it on, the first request carried no
  //     cookie and every later one carried the `sid` the server had set; with it
  //     off, none ever did. A profile `cookieHeader` won the name collision, and
  //     a `Max-Age=0` response left the jar empty rather than replaying a cookie
  //     the server had just deleted.
  //
  // Two things this dot deliberately does not claim.
  //
  // `session.sessionLabel` is **inert** — the one control here that does nothing.
  // `sessionStateFrom` copies it to `ScraperSessionState.label` and nothing reads
  // that field; session.ts calling it "only for the log line" describes a log
  // line that does not exist.
  //
  // Pacing does not reach redirect hops, and that is measured rather than
  // inferred: a four-hop 302 chain ran 1-2ms apart under `crawlDelayMs: 2000`.
  // `waitForTurn` sits in `scraperRequest` while the redirect recursion is inside
  // `performRequest` (http.ts:387), so a chain is one governed request and N
  // sockets. http.ts:24 justifies that split for the concurrency gate — a hop
  // must not need a second slot, or a limit of 1 deadlocks — but the same
  // structure silently exempts hops from crawl delay and the per-minute window
  // too. Whether that is right is a product call about what "one request" means
  // to a rate limit, not something to settle inside an acceptance pass.
  'set.antibot': 'ready',
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
