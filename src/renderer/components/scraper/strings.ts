// Scraper app — all user-facing text, in one place.
//
// DEFERRED i18n. The rest of this app translates through shared/i18n/catalogs;
// the Scraper deliberately does not yet, because ~400 strings x 4 languages is
// not worth paying while these surfaces are still shells. Adding English-only
// keys to catalogs/en.ts is not an option either — the catalog-hygiene test in
// shared/__tests__/i18n.test.ts fails on any en key without a ja/zh/ru pair.
//
// So everything lives here instead, which keeps the eventual sweep mechanical:
// move this map into catalogs/{en,ja,zh,ru}.ts and swap sx() for useT()'s t().
//
// THE ONE RULE: never put a literal string in JSX, or in a status/error message
// built inside an event handler. If it can be read by a user, it belongs here.
// Count-bearing strings are functions so plural forms have somewhere to land.
//
// Study *content* is exempt and stays literal — series names, episode titles,
// release groups (CLAUDE.md i18n rule 4). Only chrome goes through this file.

import { catalogFor, en as SHARED_EN } from '../../../shared/i18n/catalogs';
import { translate, type TVars } from '../../../shared/i18n/core';
import { getUiLang } from '../../i18n';

const TEXT = {
  // ---- App chrome ----
  'app.title': 'Anime Scraper',
  'app.newScrape': 'New Scrape',
  'app.profiles': 'Profiles',
  'app.history': 'Scrape history',
  'app.settings': 'Advanced settings',
  'app.toggleRail': 'Toggle navigation',
  'app.search': 'Search the scraper',
  'app.searchPlaceholder': 'Search pages and settings…',
  'app.searchEmpty': 'No matches.',
  'app.searchShortcut': 'Focus search',
  'app.searchRecent': 'Recent searches',
  'app.searchClear': 'Clear',
  'app.searchQuick': 'Quick destinations',
  'app.searchHint': 'Type to search every page, tool and setting',
  'app.compactOn': 'Switch to compact window',
  'app.compactOff': 'Switch to full layout',
  'app.advanced': 'Advanced',
  'app.advancedOn': 'Advanced controls shown',
  'app.advancedOff': 'Advanced controls hidden',
  'app.menu.file': 'File',
  'app.menu.view': 'View',
  'app.menu.tools': 'Tools',

  // ---- Rail groups ----
  'nav.group.scraper': 'Scraper',
  'nav.group.data': 'Data',
  'nav.group.tools': 'Tools',
  'nav.ariaCategories': 'Scraper sections',
  'nav.status': 'Status',
  'nav.statusIdle': 'Idle',
  'nav.statusRunning': 'Running',
  'nav.noActiveTasks': 'No active tasks',
  'nav.activeTasks': (n: number) => `${n} active task${n === 1 ? '' : 's'}`,
  'nav.memory': (mb: number) => `Memory: ${mb} MB`,
  'nav.cpu': (pct: number) => `CPU: ${pct}%`,

  // ---- Rail pages ----
  'nav.dashboard': 'Dashboard',
  'nav.dashboard.desc': 'Overview of jobs, sources and build progress',
  'nav.newScrape': 'New Scrape',
  'nav.newScrape.desc': 'Start a scrape from an anime site URL',
  'nav.discover': 'Discover',
  'nav.discover.desc': 'Find anime worth studying from public catalogues',
  'nav.history': 'History',
  'nav.history.desc': 'Past scrape jobs and their outcomes',
  'nav.sources': 'Source Manager',
  'nav.sources.desc': 'Which sites to search, in what order, with what fallbacks',
  'nav.torrents': 'Torrent Manager',
  'nav.torrents.desc': 'Torrent indexers and the qBittorrent mirror',
  'nav.profiles': 'Profiles',
  'nav.profiles.desc': 'Saved scraper configurations and presets',
  'nav.scheduled': 'Scheduled Tasks',
  'nav.scheduled.desc': 'Recurring scrapes and update checks',
  'nav.siteRules': 'Site Rules',
  'nav.siteRules.desc': 'Per-site extraction rules and overrides',
  'nav.plugins': 'Plugins',
  'nav.plugins.desc': 'Provider adapters and their permissions',
  'nav.results': 'Results',
  'nav.results.desc': 'Everything scraped so far, grouped by series',
  'nav.downloads': 'Downloads',
  'nav.downloads.desc': 'The managed download queue',
  'nav.exports': 'Exports',
  'nav.exports.desc': 'Export results to files or a database',
  'nav.selectorTester': 'Selector Tester',
  'nav.selectorTester.desc': 'Try CSS and XPath selectors against a page',
  'nav.regexTester': 'Regex Tester',
  'nav.regexTester.desc': 'Try patterns against sample text',
  'nav.httpInspector': 'HTTP Inspector',
  'nav.httpInspector.desc': 'Inspect and replay captured requests',
  'nav.scriptConsole': 'Script Console',
  'nav.scriptConsole.desc': 'Read live scraper state with allow-listed commands',

  // ---- Status bar ----
  'status.idle': 'Idle',
  'status.running': 'Scraping',
  'status.lastScrape': (when: string) => `Last scrape: ${when}`,
  'status.never': 'Never',
  'status.nextScheduled': (when: string) => `Next scheduled: ${when}`,
  'status.disabled': 'Disabled',
  'status.selected': (n: number) => `${n} selected`,
  'status.openActive': 'Open the active scrape',
  'status.openSelection': 'Open selected results',
  'status.openHistory': 'Open scrape history',
  'status.openSchedule': 'Open scheduled tasks',

  // ---- Build-status system ----
  'build.title': 'Build status',
  'build.desc': 'Most of this app is a UI shell over mock data. This is what is actually implemented.',
  'build.shell': 'Shell only',
  'build.untested': 'Built, untested',
  'build.ready': 'Tested and working',
  'build.shellHint': 'The screen exists and is populated with sample data. Nothing behind it works yet.',
  'build.untestedHint': 'Implemented, but not yet verified end to end.',
  'build.readyHint': 'Implemented and verified.',
  'build.legend': 'Legend',
  'build.filterAll': 'All',
  'build.count': (done: number, total: number) => `${done} of ${total} features`,
  'build.sampleData': 'Sample data',
  'build.sampleDataHint': 'Figures on this screen are illustrative, not real results.',

  // ---- Dashboard ----
  'page.dashboard.title': 'Dashboard',
  'page.dashboard.subtitle': 'Jobs, sources and what is actually built.',
  'dash.stat.series': 'Series',
  'dash.stat.episodes': 'Episodes indexed',
  'dash.stat.queued': 'Queued downloads',
  'dash.stat.failed': 'Failed',
  'dash.stat.downloaded': 'Downloaded',
  'dash.loading': 'Reading from the backend…',
  // The header chip. Which of the two shows is decided by whether the port
  // reported any backend capabilities, not by a hard-coded assumption.
  'dash.liveData': 'Live data',
  'dash.liveDataHint': 'Every figure on this page was read from the running backend.',
  'dash.activeJobs': 'Active jobs',
  'dash.noActiveJobs': 'Nothing running. Start a scrape to see progress here.',
  'dash.jobStage': (stage: string) => `Stage: ${stage}`,
  'dash.cancel': 'Cancel',
  'dash.cancelled': 'The dashboard job was cancelled. Its completed rows were kept.',
  'dash.startAnother': 'Start another scrape',
  'dash.recent': 'Recent scrapes',
  'dash.recentEmpty': 'No scrapes yet.',
  'dash.viewAll': 'View all',
  'dash.sourceHealth': 'Source health',
  'dash.sourceHealthDesc': 'Success rate over the last 30 checks.',
  'dash.series.empty': 'No series indexed yet. Run a scrape and it will appear here.',
  'dash.sources.empty': 'No sources configured.',
  // Replaces the page-cache / images / logs breakdown, which had no measurement
  // behind it — nothing in the app reports directory sizes.
  'dash.runtime': 'Runtime',
  'dash.runtime.memory': 'Memory (MB)',
  'dash.runtime.cpu': 'CPU',
  'dash.runtime.jobs': 'Active jobs',
  'dash.runtime.downloaded': (bytes: string) => `${bytes} downloaded across all jobs.`,
  'dash.nextScheduled': 'Next scheduled',
  'dash.nextScheduledNone': 'No schedules enabled.',
  'dash.noScheduleHint': 'Add one in Scheduled Tasks.',
  'dash.learning': 'Study handoff',
  'dash.learningDesc': 'Japanese subtitles ready for vocabulary and grammar mining.',
  'dash.learning.subs': 'Japanese subtitle tracks',
  'dash.learning.episodes': 'Episodes indexed',
  'dash.openMining': 'Open mining',

  // ---- Discover ----
  'page.discover.title': 'Discover',
  // The console searches both catalogues, and the media-type switch decides
  // which. A subtitle that says "anime" while Manga is selected is wrong half
  // the time, so the noun is chosen at render.
  'page.discover.subtitle.anime': 'Find anime worth studying, then hand it to a scrape.',
  'page.discover.subtitle.manga': 'Find manga worth reading, then hand it to a scrape.',
  'discover.planToWatch': 'Plan to watch',
  'discover.removeFromPlan': 'Remove from plan',
  'discover.findSources': 'Find sources',
  'discover.queueScrape': 'Queue scrape',
  'discover.added': (title: string) => `${title} added to the study shortlist.`,
  'discover.removed': (title: string) => `${title} removed from the study shortlist.`,

  // The shelf above the results. It used to render three hard-coded series and
  // fabricated counts ("1,122 episodes · 2,234 mirrors") from data/fixtures,
  // which is the one thing this app's build-status registry exists to prevent.
  // It now shows what the user actually shortlisted, which is also the funnel
  // this page is for: pick here, scrape next.
  'mediaType.anime': 'Anime',
  'mediaType.manga': 'Manga',
  'discover.shelf.title': 'Ready to scrape',
  'discover.shelf.sub': 'Titles you shortlisted, ready to hand to a scrape.',
  'discover.shelf.empty': 'Nothing shortlisted yet. Pick a title below and choose Plan to watch — it will wait here until you scrape it.',
  'discover.shelf.viewAll': (n: number) => (n === 1 ? '1 planned' : `${n} planned`),
  'discover.shelf.scrape': 'Scrape',
  'discover.shelf.remove': 'Remove',
  'discover.shelf.episodes': (n: number) => (n === 1 ? '1 episode' : `${n.toLocaleString()} episodes`),
  'discover.shelf.chapters': (n: number) => (n === 1 ? '1 chapter' : `${n.toLocaleString()} chapters`),

  // ---- New Scrape ----
  'page.newScrape.title': 'New Scrape',
  'page.newScrape.subtitle': 'Enter an anime website URL to start scraping episodes and information.',
  'scrape.targetUrl': 'Target URL',
  'scrape.targetPlaceholder': 'https://example-anime-site.com/anime/one-piece',
  'scrape.profile': 'Profile',
  'scrape.userAgent': 'User Agent',
  'scrape.proxy': 'Proxy',
  'scrape.noProxy': 'No Proxy',
  'scrape.start': 'Start Scraping',
  'scrape.cancel': 'Cancel',
  'scrape.startOptions': 'More start options',
  'scrape.startPaused': 'Start paused',
  'scrape.previewOnly': 'Preview only',
  'scrape.queue': 'Add to queue',
  'scrape.advanced': 'Advanced Settings',
  'scrape.preflight': 'Preflight',
  'scrape.preflightUrl': 'URL',
  'scrape.preflightProvider': 'Provider',
  'scrape.preflightProfile': 'Profile',
  'scrape.preflightSpace': 'Free space',
  'scrape.preflightStatus': 'Provider status',
  'scrape.urlValid': 'Looks like a series URL',
  'scrape.urlSearch': 'Will be treated as a search term',
  'scrape.urlEmpty': 'Enter a URL or a title',
  'scrape.detected': 'Detected',
  'scrape.progress': 'Progress',
  'scrape.stat.detected': 'Detected episodes',
  'scrape.stat.fetched': 'Fetched episodes',
  'scrape.stat.failed': 'Failed',
  'scrape.stat.eta': 'Estimated time',

  // ---- Result surface ----
  'result.tab.episodes': 'Episodes',
  'result.tab.details': 'Details',
  'result.tab.streams': 'Streams',
  'result.tab.torrents': 'Torrents',
  'result.tab.images': 'Images',
  'result.tab.metadata': 'Metadata',
  'result.tab.logs': 'Logs',
  'result.filter': 'Filter',
  'result.filterMissingSubs': 'Missing my subtitle language',
  'result.filterFailed': 'Failed or unavailable',
  'result.filterResolution': 'Resolution',
  'result.clearFilters': 'Clear filters',
  'result.any': 'Any',
  'result.sort': 'Sort',
  'result.group': 'Group',
  'result.columns': 'Columns',
  'result.columnsLocked': 'Number, title and link always stay visible.',
  'result.search': 'Search episodes',
  'result.searchPlaceholder': 'Search episodes…',
  'result.selectAll': 'Select All',
  'result.clearSelection': 'Clear Selection',
  'result.preview': 'Preview',
  'result.export': 'Export',
  'result.exportJson': 'Export JSON',
  'result.selectPage': 'Select page',
  'result.batchActions': 'Episode actions',
  'result.previewReady': (n: number) => `Previewing the first of ${n} episode${n === 1 ? '' : 's'}`,
  'result.exported': (n: number) => `Exported ${n} episode${n === 1 ? '' : 's'}`,
  'result.currentProfile': 'Current profile',
  'result.concurrent': 'Concurrent',
  'result.retries': 'Retries',
  'result.timeout': 'Timeout',
  'result.proxyState': 'Proxy',
  'result.enabled': 'Enabled',
  'result.disabled': 'Disabled',
  'result.selected': (n: number) => `${n} selected`,
  'result.showing': 'Showing',
  'result.perPage': 'per page',
  // Playing a mirror hands off to the adopted media workspace, which is not
  // mounted in every window and not present on every machine. Two facts, so two
  // sentences — see renderer/mediaWorkspaceBridge.ts: the caller owns the wording
  // because "nothing to resume into" and "cannot play this mirror" are the same
  // fact about different intentions.
  'result.play.refresh': 'Run this scrape again to refresh the provider URL before playback.',
  'result.play.opening': (n: number) => `Opening episode ${n} in VideoCore.`,
  'result.play.noPlayerHere': 'No player in this window — open this result from the main window to play the mirror.',
  'result.play.serverOff': 'The media server is off, so this mirror cannot be played.',
  'result.emptyEpisodes': 'No episodes yet. Start a scrape to fill this table.',
  'result.emptyStreams': 'No mirrors found for these episodes.',
  'result.emptyTorrents': 'No torrents matched.',
  'result.emptyImages': 'No artwork was collected.',
  'result.emptyLogs': 'No log output yet.',
  'result.batch': 'Batch',
  'result.single': 'Single episode',
  'result.col.source': 'Source',
  'result.col.resolution': 'Resolution',
  'result.col.codec': 'Codec',
  'result.col.container': 'Container',
  'result.col.bitrate': 'Bitrate',
  'result.col.latency': 'Latency',
  'result.col.health': 'Health',
  'result.col.expires': 'Expires',
  'result.col.name': 'Name',
  'result.col.group': 'Release group',
  'result.col.seeders': 'Seeders',
  'result.col.leechers': 'Leechers',
  'result.col.size': 'Size',
  'result.col.age': 'Age',
  'result.col.subs': 'Subs',
  'result.col.tracker': 'Tracker',
  'result.detail.found': 'Episodes found',
  'result.detail.expected': 'Expected',
  'result.detail.japaneseSubs': 'With Japanese subs',
  'result.detail.failed': 'Failed',
  'result.detail.totalSize': 'Total size',
  'result.detail.runtime': 'Total runtime',
  'result.detail.studios': 'Studios',
  'result.detail.genres': 'Genres',
  'result.detail.opening': 'Opening',
  'result.detail.ending': 'Ending',
  'result.detail.rating': 'Rating',
  'result.detail.site': 'Official site',
  'result.meta.field': 'Field',
  'result.meta.value': 'Value',
  'result.meta.source': 'Source',
  'result.meta.provenanceNote': 'Every value records which provider supplied it, so a disagreement between sources is explainable rather than mysterious.',
  'result.meta.titleEn': 'English title',
  'result.meta.titleJa': 'Japanese title',
  'result.meta.titleRomaji': 'Romaji title',
  'result.meta.format': 'Format',
  'result.meta.status': 'Status',
  'result.meta.season': 'Season',
  'result.meta.episodes': 'Episode count',
  'result.meta.duration': 'Average duration',
  'result.meta.genres': 'Genres',
  'result.meta.studios': 'Studios',
  'result.meta.rating': 'Community rating',
  'result.meta.mal': 'MyAnimeList ID',
  'result.meta.anilist': 'AniList ID',

  // ---- Source Manager ----
  'page.sources.title': 'Source Manager',
  'page.sources.subtitle': 'Which sites the scraper tries, in what order, and what it falls back to.',
  'sources.settings': 'Source settings',
  'sources.mode': 'Source mode',
  'sources.modeDesc': 'Whether episodes come from streaming mirrors, torrents, or both.',
  'sources.modeStreaming': 'Streaming',
  'sources.modeTorrent': 'Torrent',
  'sources.modeBoth': 'Both',
  'sources.modeStreamingHint': 'Only streaming mirrors are searched. The Torrents tab stays empty.',
  'sources.modeTorrentHint': 'Only torrent indexers are searched. Streams are not resolved.',
  'sources.modeBothHint': 'Both are searched; streaming is preferred unless a torrent scores higher.',
  'sources.providers': 'Seanime provider extensions',
  'sources.providersDesc': 'Installed providers available to the shared acquisition backend. This inventory is read-only here.',
  'sources.providerCount': (n: number) => `${n} provider${n === 1 ? '' : 's'}`,
  'sources.providersEmpty': 'No provider extensions are currently available.',
  'sources.providerState.ready': 'ready',
  'sources.providerState.disabled': 'disabled',
  'sources.providerState.offline': 'offline',
  'sources.providerState.error': 'error',
  'sources.providerKind.online-stream': 'online stream',
  'sources.providerKind.torrent': 'torrent',
  'sources.providerKind.manga-source': 'manga',
  'sources.providerKind.catalogue': 'catalogue',
  'sources.providerKind.debrid': 'debrid',
  'sources.providerKind.local': 'local',
  'sources.providerCapability.search': 'search',
  'sources.providerCapability.episodes': 'episodes',
  'sources.providerCapability.streams': 'streams',
  'sources.providerCapability.download': 'download',
  'sources.providerDub': 'dub',
  'sources.providerServers': (n: number) => `${n} server${n === 1 ? '' : 's'}`,
  'sources.chain': 'Priority chain',
  'sources.chainDesc': 'Tried top to bottom. Position is the priority — there is no separate rank to keep in sync.',
  'sources.activeCount': (n: number) => `${n} enabled`,
  'sources.test': 'Test',
  'sources.testing': 'Testing…',
  'sources.subsYes': 'subs',
  'sources.subsNo': 'no subs',
  'sources.auth': 'sign-in',
  'sources.fallbackHint': 'If this source fails, try these next — in the order you pick them.',
  'sources.fallbackOrder': 'Fallback order',
  'sources.noFallbackCandidates': 'No other source of this kind to fall back to.',
  'sources.empty': 'No sources of this kind yet.',
  'sources.reorderAllOnly': 'Switch to All to reorder — priority is one list, not one per kind.',

  // ---- Torrent Manager ----
  'page.torrents.title': 'Torrent Manager',
  'page.torrents.subtitle': 'Search indexers, and watch what qBittorrent is doing with more detail than it shows itself.',
  // The end of the acquisition pipeline. Every other action here talks to the
  // torrent client; this one is the only one that hands the finished files to
  // the rest of the app, so its outcomes are spelled out rather than collapsed
  // into one "done" — see `MediaAcquiredImport`.
  'torrent.addToLibrary': 'Add to library',
  'torrent.addToLibraryBusy': 'Adding…',
  'torrent.addToLibraryIncomplete': 'This transfer has not finished downloading yet.',
  'torrent.addedToLibrary': (added: number, found: number) =>
    `Added ${added} of ${found} media file${found === 1 ? '' : 's'} to the library.`,
  'torrent.alreadyInLibrary': (found: number) =>
    `Already in the library — all ${found} media file${found === 1 ? '' : 's'} were there.`,
  'torrent.addNoMedia': 'Nothing was added: no playable media file is at the save location.',
  'torrent.addMissing': 'Nothing was added: the save location no longer exists on disk.',
  'torrent.addFailed': (reason: string) => `Could not add to the library: ${reason}`,
  'torrent.settings': 'Torrent settings',
  'torrent.qbitSettings': 'qBittorrent settings',
  'torrent.connection': 'qBittorrent connection',
  'torrent.connectionDesc': 'Where the client lives, and whether the scraper can reach it.',
  'torrent.test': 'Test Connection',
  'torrent.testing': 'Testing…',
  // Four states, not two. A `*Ref` is a handle into OS storage, so a non-empty
  // ref proves only that one was named — "orphaned" is the case where the ref
  // survived and the secret did not, which used to render as "stored".
  'torrent.credChecking': 'checking password…',
  'torrent.credStored': 'password stored',
  'torrent.credMissing': 'no password',
  'torrent.credOrphaned': 'password missing from OS storage',
  'torrent.credOrphanedHint': 'Settings name a password, but nothing is stored under it. Open qBittorrent settings and enter it again.',
  'torrent.credUnknown': 'password unverified',
  'torrent.keyChecking': 'checking API key…',
  'torrent.keyStored': 'API key stored',
  'torrent.keyMissing': 'no API key',
  'torrent.keyOrphaned': 'API key missing from OS storage',
  'torrent.keyOrphanedHint': 'Settings name an API key, but nothing is stored under it. Open qBittorrent settings and enter it again.',
  'torrent.keyUnknown': 'API key unverified',
  'torrent.credUnknownHint': 'The secret store could not be reached, so whether a credential exists is unknown.',
  // Which credential the test actually used. Shown on failures too: with both a
  // password and a key stored, "unauthorized" alone sends the user to change the
  // one that was never consulted.
  'torrent.authVia': (mode: string) =>
    (mode === 'apiKey' ? 'via API key' : 'via username and password'),
  'torrent.search': 'Indexer search',
  'torrent.searchDesc': 'Results across every enabled torrent source.',
  'torrent.searchPlaceholder': 'Search releases…',
  'torrent.minSeeders': 'Min seeders',
  'torrent.matches': (n: number) => `${n} matching release${n === 1 ? '' : 's'}`,
  'torrent.send': (n: number) => `Send ${n} to qBittorrent`,
  'torrent.mirror': 'qBittorrent mirror',
  'torrent.mirrorDesc': 'Every transfer, with the peer, availability and piece detail the client’s own list leaves out.',
  'torrent.activeTransfers': (n: number) => `${n} active`,
  'torrent.noTransfers': 'qBittorrent has no transfers.',
  'torrent.pieces': 'Piece progress',

  // ---- Scheduler hold reasons ----
  // Why the runner is not firing anything right now. One per `heldBy` value in
  // shared/scraperCron.ts; 'nothing-due' reads as Armed because from the user's
  // side an armed scheduler with no slot due is not being held by anything.
  'set.inert': 'Not wired',
  'set.inertHint': 'This setting is saved, but nothing reads it yet — changing it will not change how the scraper behaves.',
  'sched.held.armed': 'Armed',
  'sched.held.disabled': 'Scheduler off',
  'sched.held.quietHours': 'Held — quiet hours',
  'sched.held.onBattery': 'Held — running on battery',
  'sched.held.concurrency': 'Held — a job is already running',

  // Phase 4 — the supervised Seanime sidecar's acquisition engines. Read-only
  // state plus the four deliberate actions; nothing here replaces the Study OS
  // scheduler, Site Rules or the qBittorrent handoff above.
  'acq.title': 'Seanime acquisition engines',
  'acq.desc': 'Torrent client, debrid, and auto-downloader state from the supervised sidecar.',
  'acq.refresh': 'Refresh',
  'acq.sidecar': 'Sidecar',
  'acq.loading': 'loading',
  'acq.torrentClient': 'Torrent client',
  'acq.debrid': 'Debrid',
  'acq.autoDownloader': 'Auto-downloader',
  'acq.off': 'Off',
  'acq.transfers': (n: number) => `${n} active`,
  'acq.debridItems': (n: number) => `${n} item${n === 1 ? '' : 's'}`,
  'acq.rules': (n: number) => `${n} rule${n === 1 ? '' : 's'}`,
  'acq.queued': (n: number) => `${n} queued`,
  'acq.destinationPlaceholder': 'Seanime destination (optional)',
  'acq.destinationLabel': 'Seanime download destination',
  'acq.sendTorrentClient': 'Send selected to Seanime',
  'acq.sendDebrid': 'Send selected to debrid',
  'acq.runAutoDownloader': 'Run auto-downloader',
  'acq.simulateRules': 'Simulate enabled rules',
  'acq.queueTitle': 'Auto-downloader queue',
  'acq.episode': (n: number) => `episode ${n}`,
  'acq.download': 'Download',
  'acq.score': (n: number) => `score ${n}`,

  // ---- Why a control is disabled ----
  // A disabled control is honest only when the surface says what would re-enable
  // it. Every condition on the Torrent Manager is compound (busy OR nothing
  // selected OR the engine is down), so the reason is derived from the FIRST
  // failing clause at the call site rather than written once per button — a
  // single generic hint would name the wrong cause most of the time.
  'why.busy': 'An acquisition action is still running. Wait for it to finish.',
  'why.testing': 'The connection test is still running.',
  'why.noneSelected': 'Nothing is selected. Tick at least one torrent row first.',
  'why.noSidecar': 'The Seanime sidecar has not answered yet. Use Refresh to ask it again.',
  'why.subsystem': (engine: string, detail: string) =>
    `${engine} is not ready — ${detail}. Fix it in Seanime, then Refresh.`,
  'why.noRules': 'There are no auto-downloader rules to simulate yet.',
  'why.alreadyDownloaded': 'This queued episode has already been downloaded.',
  'why.delayed': 'This queued episode is delayed by its rule and cannot be fetched yet.',
  'why.notComplete': 'The transfer has to finish downloading before it can be added to the library.',
  'why.addingToLibrary': 'This transfer is already being added to the library.',

  // ---- Data pages ----
  'page.results.title': 'Results',
  'page.results.subtitle': 'Everything collected so far, grouped by series and ready for review.',
  'results.series': 'Series',
  'results.episodes': 'Episodes',
  'results.withJa': 'With Japanese subtitles',
  'results.failed': 'Failed',
  'results.open': 'Open result',
  'results.missingHint': 'Expected episode count compared with the rows actually collected.',
  'results.jaCount': (n: number) => `${n.toLocaleString()} with Japanese subtitles`,
  'results.failCount': (n: number) => `${n.toLocaleString()} failed`,
  'results.warnCount': (n: number) => `${n.toLocaleString()} warnings`,
  'results.missingCount': (n: number) => `${n.toLocaleString()} missing`,

  'page.downloads.title': 'Downloads',
  'page.downloads.subtitle': 'A managed queue for streams, subtitles, images, and torrent handoffs.',
  'downloads.active': 'Active',
  'downloads.queued': 'Queued',
  'downloads.done': 'Complete',
  'downloads.failed': 'Failed',
  'downloads.speed': 'Total speed',
  'downloads.remaining': 'Remaining:',
  'downloads.free': 'Free space:',
  'downloads.queue': 'Download queue',
  'downloads.empty': 'The download queue is empty.',
  'downloads.player': 'Player handoff',
  'downloads.playerDesc': 'Open completed media in the configured external player.',
  'downloads.playerHint': 'Completed episodes remain linked to their scraped metadata and subtitle tracks.',

  'page.exports.title': 'Exports',
  'page.exports.subtitle': 'Create portable results for files, databases, playlists, and study tools.',
  'exports.builder': 'Export builder',
  'exports.builderDesc': 'Choose a format and scope, then preview exactly what will be written.',
  'exports.format': 'Format',
  'exports.scope': 'Scope',
  'exports.scopeAll': 'All results',
  'exports.scopeFailed': 'Failed only',
  'exports.scopeMissingSubs': 'Missing Japanese subtitles',
  'exports.template': 'File name template',
  'exports.willWrite': 'Destination preview',
  'exports.recordCount': (n: number) => `${n.toLocaleString()} record${n === 1 ? '' : 's'}`,
  'exports.run': 'Create export',
  'exports.history': 'Export history',

  'page.history.title': 'History',
  'page.history.subtitle': 'Past scrape jobs, their outcomes, and stage-level timing details.',
  'history.all': 'All jobs',
  'history.problems': 'Problems',
  'history.clean': 'Clean runs',
  'history.jobs': 'Scrape jobs',
  'history.empty': 'No scrape jobs match this filter.',
  'history.noNote': 'No additional notes were recorded.',
  'history.repeat': 'Repeat scrape',
  'history.col.series': 'Series',
  'history.col.provider': 'Provider',
  'history.col.profile': 'Profile',
  'history.col.found': 'Found',
  'history.col.failed': 'Failed',
  'history.col.size': 'Size',
  'history.col.duration': 'Duration',
  'history.col.when': 'When',

  // ---- Script Console ----
  // Command ids are not text: they are the literal input the allow-list matches
  // on, so they stay untranslated the way a file path or a header name does.
  // Only the descriptions around them are chrome.
  'console.title': 'Script Console',
  'console.subtitle': 'Run allow-listed inspection commands in a restricted, read-only context.',
  'console.sandbox': 'Sandbox',
  'console.sandboxValue': 'Read only',
  'console.commands': 'Commands',
  'console.executions': 'Commands run',
  'console.logRows': 'Live log rows',
  'console.backend': 'Backend',
  'console.backendLive': 'Live',
  'console.backendSample': 'Sample data',
  'console.palette': 'Command palette',
  'console.paletteLabel': 'Console command palette',
  'console.run': 'Run',
  'console.clear': 'Clear session',
  'console.inputLabel': 'Console command',
  'console.empty': 'No commands run yet. Pick one from the palette above.',
  'console.liveTag': 'live',
  'console.sampleTag': 'sample data',
  'console.unknown': (input: string) =>
    `“${input}” is not an inspection command. Nothing was executed.`,
  'console.unknownHint': (list: string) => `Available commands: ${list}`,
  'console.failed': (detail: string) => `The command could not be answered: ${detail}`,
  'console.notExecuted':
    'This console does not evaluate what you type. It matches the input against a fixed list of read-only reads and runs nothing else.',
  'console.locked': 'The Script Console is locked.',
  'console.lockedHint':
    'Turn on “Unlock Script Console” under Developer in Advanced Settings to run inspection commands.',
  'console.openSettings': 'Open Developer settings',
  'console.liveLog': 'Live scraper log',
  'console.waiting': 'Waiting for log events…',
  // One line per command, in allow-list order.
  'console.cmd.help': 'List every command this console accepts',
  'console.cmd.backend.capabilities': 'Which port methods main implements, and which fall back to sample data',
  'console.cmd.system.stats': 'Memory, CPU and active job count as main reports them',
  'console.cmd.jobs.active': 'Jobs that have not reached a terminal stage',
  'console.cmd.jobs.recent': 'The most recent jobs, live and stored',
  'console.cmd.sources.health': 'Health and latency of the configured sources',
  'console.cmd.plugins.installed': 'Plugin manifests read off disk',
  'console.cmd.exports.recent': 'Exports written from this app',
  'console.cmd.profile.active': 'The values the active profile would run a scrape with',
  'console.cmd.logs.tail': 'The tail of the live log this page is subscribed to',

  // ---- Advanced Settings drawer ----
  // Field labels and hints live in settings/fields.ts, beside the bounds they
  // describe; only the drawer's own chrome is here.
  'set.title': 'Advanced Settings',
  'set.search': 'Search settings',
  'set.searchPlaceholder': 'Search settings…',
  'set.searchResults': 'Search results',
  'set.categories': 'Settings categories',
  'set.reset': 'Reset to Defaults',
  'set.save': 'Save Settings',
  'set.activeProfile': 'Profile',
  'set.resetDone': 'Restored this profile’s preset values.',
  'set.resetCustom': 'This profile is custom — pick a preset on the Profiles page to reset it.',
  'set.savedAlready': 'Changes save as you make them.',
  'set.trackersDescription': 'Trackers are appended in this order when a provider returns a magnet link.',
  'set.credentialDescription': 'The password is encrypted by the operating system and stored outside this settings document, which keeps only the lookup name.',
  'set.credentialReference': 'Credential reference',
  'set.credentialPlaceholder': 'Anime Scraper / qBittorrent',
  'set.credentialSecret': 'Password',
  'set.credentialSecretPlaceholder': 'Leave blank to keep the stored password',
  'set.credentialStored': 'A password is stored for this reference.',
  'set.credentialMissing': 'No password is stored for this reference yet.',
  'set.credentialCleared': 'Stored password removed.',
  'set.qbitTesting': 'Testing the configured qBittorrent connection…',
  'set.qbitTestResult': (detail: string) => detail,
  'set.qbitTestFailed': 'The connection test failed before qBittorrent returned a response.',
  'set.listSaved': (label: string) => `${label} saved.`,
  'set.saveItem': (label: string) => `Save ${label}`,
  'set.credentialSaved': 'Credential reference saved.',
  'set.credentialSaveFailed': (detail: string) => detail,
  'set.addEntry': 'Add entry',
  'set.removeEntry': (label: string) => `Remove ${label}`,
  'set.entry': (label: string) => `${label} entry`,
  'set.actionReady': (label: string) => `${label} is ready on this settings panel.`,

  // ---- Health / generic vocabulary ----
  'health.ok': 'Healthy',
  'health.degraded': 'Degraded',
  'health.blocked': 'Blocked',
  'health.offline': 'Offline',
  'health.unknown': 'Unknown',
  'job.queued': 'Queued',
  'job.fetching': 'Fetching',
  'job.parsing': 'Extracting',
  'job.validating': 'Validating',
  'job.done': 'Complete',
  'job.warning': 'Completed with warnings',
  'job.failed': 'Failed',
  'job.cancelled': 'Cancelled',
  'common.episodes': (n: number) => `${n} episode${n === 1 ? '' : 's'}`,
  'common.retry': 'Retry',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.clear': 'Clear',
  'export.cancelled': 'Export cancelled — nothing was written.',
  'export.written': (detail: string) => `Wrote ${detail} records.`,
  'export.failed': (detail: string) => `The export could not be written: ${detail}`,

} as const;

export type ScraperTextKey = keyof typeof TEXT;

export const SCRAPER_TEXT = TEXT;

/**
 * THE MIGRATION OUT OF THIS FILE, batch by batch — decided 2026-08-30.
 *
 * The deferral at the top of this file gave a reason that has expired: the
 * Scraper is a 17-page application at 70/80, not a shell, and rubric category 8
 * cannot pass while the surface renders identical English in all four languages
 * (measured: 1 differing text run of 1,186, and that one is the window title).
 *
 * The keys move into `shared/i18n/scraperUi/{en,ja,zh,ru}.ts` under `scrApp.`,
 * which is where the 662 sibling scraper-settings keys already live. What does
 * NOT move is the call sites: `sx()` looks the key up in the shared catalog
 * first and falls back to `TEXT` below when it has not been migrated yet. That
 * is what makes this landable in batches — 522 call sites across 21 files, 16 of
 * them carrying another track's unstaged work, is not one commit's worth of
 * blob reconstruction, and a half-migrated map would otherwise render bare
 * dotted keys at the user (`translate()` returns the key on a total miss).
 *
 * Argument naming, so a template knows what to expect:
 *   sxn(key, n)     -> {n}, and `count` for plural selection
 *   sxs(key, s)     -> {value}
 *   sx2(key, a, b)  -> {a} {b}, and `count` = b for plural selection
 *   sxss(key, a, b) -> {a} {b}
 * Plural forms are CLDR categories, so Russian gets one/few/many rather than a
 * singular-vs-plural split (see `PluralForms` in shared/i18n/core.ts).
 *
 * A component reading these must re-render on a language switch. `ScraperApp`
 * subscribes once at the root for the whole tree; a memo that caches resolved
 * text still needs `lang` in its deps, per CLAUDE.md's i18n policy.
 */
const SHARED_PREFIX = 'scrApp.';

function shared(key: ScraperTextKey, vars?: TVars): string | null {
  const sharedKey = SHARED_PREFIX + key;
  if (SHARED_EN[sharedKey] === undefined) return null;
  const lang = getUiLang();
  return translate(sharedKey, vars, { lang, catalog: catalogFor(lang), fallback: SHARED_EN });
}

/** Resolve a plain string. Count-bearing keys should use sxn() instead. */
export function sx(key: ScraperTextKey): string {
  const migrated = shared(key);
  if (migrated !== null) return migrated;
  const value = TEXT[key];
  return typeof value === 'function' ? value(0 as never) : value;
}

/** Resolve a count- or value-bearing string. */
export function sxn(key: ScraperTextKey, value: number): string {
  const migrated = shared(key, { n: value, count: value });
  if (migrated !== null) return migrated;
  const entry = TEXT[key];
  return typeof entry === 'function' ? (entry as (n: number) => string)(value) : entry;
}

/** Resolve a string-interpolating entry (stage names, timestamps, page names). */
export function sxs(key: ScraperTextKey, value: string): string {
  const migrated = shared(key, { value });
  if (migrated !== null) return migrated;
  const entry = TEXT[key];
  return typeof entry === 'function' ? (entry as (s: string) => string)(value) : entry;
}

/** Resolve a two-argument entry. */
export function sx2(key: ScraperTextKey, a: number, b: number): string {
  const migrated = shared(key, { a, b, count: b });
  if (migrated !== null) return migrated;
  const entry = TEXT[key];
  return typeof entry === 'function' ? (entry as (x: number, y: number) => string)(a, b) : entry;
}

/**
 * Resolve a two-string entry. Kept separate from sx2() rather than widened,
 * because the connective words between the two halves belong in this file with
 * the rest of the sentence — a call site that joined them itself would be a
 * literal in product code, which is what THE ONE RULE forbids.
 */
export function sxss(key: ScraperTextKey, a: string, b: string): string {
  const migrated = shared(key, { a, b });
  if (migrated !== null) return migrated;
  const entry = TEXT[key];
  return typeof entry === 'function' ? (entry as (x: string, y: string) => string)(a, b) : entry;
}
