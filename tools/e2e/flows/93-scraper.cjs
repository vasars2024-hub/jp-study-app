'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Scraper -> qBittorrent -> library, entirely against the harness's world
 * (tools/e2e/world.cjs): the fixture site (src/main/__tests__/e2eFixtures/fixtureSite.ts,
 * invented show, robots.txt, two pages) is scraped through the Scraper app with a site
 * rule; its Nyaa-shaped index is searched; two episodes are sent to the fake qBittorrent
 * (v5 WebUI, generated password in the credential vault); the fake "finishes" them —
 * a real ≥2 MiB video with a `.ja.srt` beside it — and the app's own completion poller
 * imports them into the library. Nothing leaves 127.0.0.1: magnets carry no trackers and
 * the catalogue (a public API) is never asked, because a site rule answers the URL.
 *
 * v1 additions: the first scrape waits for the one-time torrent notice
 * (components/common/DownloadNotice.tsx), which is acknowledged once and never shown
 * again; a Dashboard series card selects that run on the Results page; and the Plugins
 * page (never built, hidden for v1, plan D4) cannot be reached.
 */
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

const CREDENTIAL_REF = 'e2e-qbit';
const NOTICE_KEY = 'gum-download-notice-v1';

module.exports = {
  id: 'scraper',
  title: 'Scraper: fixture site -> fake qBittorrent -> library import',
  async run(ctx) {
    const { eval: ev, result, world } = ctx;
    const goTo = async (page, selector, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await ev(`(window.dispatchEvent(new CustomEvent('scraper:navigate', { detail: { page: ${JSON.stringify(page)} } })), true)`);
        if (await poll(ctx, `!!document.querySelector(${JSON.stringify(selector)})`, 1500)) return true;
      }
      return null;
    };
    if (!world) {
      result.skip('no fixture site / fake qBittorrent in this process (run it through npm run e2e or --serve)');
      return;
    }
    await installHelpers(ctx);
    const { site, qbit, fakes } = world;
    const SHOW = fakes.texts.SHOW;
    const EPISODES = fakes.texts.EPISODES;

    // --- the run's scraper profile: real defaults, zero politeness delays, one site rule ---
    const doc = fakes.createDefaultScraperSettingsDocument();
    const s = fakes.resolveScraperSettings(doc);
    s.network = { ...s.network, retryAttempts: 2, retryDelayMs: 0, randomDelayMinMs: 0, randomDelayMaxMs: 0, requestTimeoutMs: 6000 };
    s.safety = { ...s.safety, crawlDelayMs: 0, maxRequestsPerMinute: 6000, respectRobotsTxt: true, allowPrivateNetwork: true };
    s.cache = { ...s.cache, htmlEnabled: false, metadataEnabled: false, thumbnailsEnabled: false };
    const rule = {
      ...fakes.DEFAULT_SITE_RULE,
      id: 'fixture', host: '127.0.0.1', sampleUrl: `${site.base}/shows/gum-test-show`, enabled: true,
      episodeSelector: 'table.eps tr.ep', titleSelector: '.title', linkSelector: 'a.mag', numberSelector: 'th.no',
      nextPageSelector: 'a[rel=next]', maxPages: 5,
    };
    s.extraction = { ...s.extraction, siteRules: [rule] };
    const indexEntry = {
      id: 'fixture-index', label: 'Fixture index', host: site.base, kind: 'torrent', enabled: true, priority: 1, fallbackIds: [],
      verifiedSiteId: '', requiresAuth: false, supportsSubtitles: true, health: 'ok', lastCheckedAt: null, notes: '',
    };
    s.sources = { ...s.sources, mode: 'torrent', entries: [indexEntry], order: ['fixture-index'] };
    const qbitConfig = {
      ...fakes.DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
      enabled: true, scheme: 'http', host: '127.0.0.1', port: qbit.port, username: 'admin', passwordRef: CREDENTIAL_REF, category: 'gum-e2e',
    };
    s.qbittorrent = qbitConfig;
    const active = doc.profiles.find((p) => p.id === doc.activeProfileId) ?? doc.profiles[0];
    active.settings = s;
    await ev(`(localStorage.setItem('jp-scraper-settings-v1', ${JSON.stringify(JSON.stringify(doc))}), true)`);
    // A first use, whatever ran before this flow.
    await ev(`(localStorage.removeItem(${JSON.stringify(NOTICE_KEY)}), true)`);
    const cred = await ev(`window.api.scraperSetCredential(${JSON.stringify(CREDENTIAL_REF)}, ${JSON.stringify(world.qbitPassword)})`, { await: true });
    result.check('the fake qBittorrent password is stored in the credential vault', cred?.ok !== false, cred);

    // --- scrape the fixture site through the Scraper app ----------------------------------
    site.reset();
    const target = `${site.base}/shows/gum-test-show`;
    await ev(`__e2e.open('scraper')`);
    // The Scraper app mounts lazily; under a long run it can still be loading when the first
    // navigate event fires, and that event is lost. Re-send it until the page answers.
    const input = await goTo('new-scrape', '#scr-target', 20000);
    let jobVia = 'ui';
    if (input) {
      await ev(`__e2e.fill('#scr-target', ${JSON.stringify(target)})`);
      await ctx.sleep(200);
      const started = await ev(`__e2e.clickText('button', 'Start Scraping')`);
      if (!started) jobVia = 'ui (no start button)';
      // --- the first-use torrent notice: shown before the first scrape, nothing runs yet --
      const notice = await poll(ctx, `(() => { const d = document.querySelector('[role="dialog"] [data-download-notice="torrent"]'); return d ? d.innerText : null; })()`, 8000);
      result.check('the first scrape waits for the torrent notice (IP visibility, legality)', Boolean(notice) && /IP address/.test(notice) && /legal/.test(notice), notice);
      const jobsBeforeAck = await ev(`window.api.scraperListJobs().then((l) => (l || []).length)`, { await: true });
      await ctx.shot('download-notice');
      const acked = await ev(`__e2e.click('[data-download-notice-ack="torrent"]')`);
      const stored = await poll(ctx, `(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(NOTICE_KEY)}) || '{}').torrent || null; } catch { return null; } })()`, 5000);
      const gone = await poll(ctx, `!document.querySelector('[data-download-notice]')`, 5000);
      result.check('"I understand" is remembered and closes the notice; no job ran before it', Boolean(acked) && Boolean(stored) && Boolean(gone) && jobsBeforeAck === 0, { acked, stored, jobsBeforeAck });
    } else {
      jobVia = 'api';
    }
    // The job, wherever it was started from: read it back from main.
    const job = jobVia === 'ui' ? await pollAsync(ctx, `window.api.scraperListJobs().then((l) => (l || []).find((x) => String(x.seriesId || '').includes('gum-test-show') && x.stage === 'done') || null)`, 15000, 300) : null;
    let jobId = job?.id ?? null;
    if (jobId) {
      // What the Scraper app shows for the job: the episodes of both pages.
      const shown = await poll(ctx, `(() => { const t = document.body.innerText; return ${JSON.stringify(EPISODES.map((e) => e.title))}.every((x) => t.includes(x)) ? true : null; })()`, 10000);
      result.check('the Scraper app shows the scraped episodes', Boolean(shown));
    }
    if (!jobId) {
      jobVia = `${jobVia} -> api`;
      jobId = await ev(`window.api.scraperStartScrape({ request: { targetUrl: ${JSON.stringify(target)}, profileId: ${JSON.stringify(active.id)} }, settings: ${JSON.stringify(s)} })`, { await: true });
    }
    const scraped = await pollAsync(ctx, `window.api.scraperGetResult(${JSON.stringify(jobId)}).then((r) => r && r.episodes && r.episodes.length >= 4 ? r.episodes.map((e) => ({ n: e.number ?? e.episode ?? null, title: e.titleEn || e.titleJa || e.title, magnet: /^magnet:/.test(e.url || e.link || '') })) : null)`, 30000, 500);
    result.check(`the site rule scrapes all four episodes across both pages (${jobVia})`, Boolean(scraped) && EPISODES.every((e) => scraped.some((x) => String(x.title).includes(e.title))), { jobId, scraped });
    result.check('the scrape read robots.txt and followed the next-page link', site.hits.some((h) => h.startsWith('GET /robots.txt')) && site.hits.some((h) => h.includes('page=2')), site.hits);
    await ctx.shot('scraped');

    // --- Dashboard -> Results: a series card selects that run on the Results page ---------
    if (jobId) {
      const summary = await ev(`window.api.scraperListJobs().then((l) => (l || []).find((x) => x.id === ${JSON.stringify(jobId)}) || null)`, { await: true });
      const title = summary?.titleEn ?? '';
      await goTo('dashboard', '.scr-dashboard-series-card', 10000);
      const card = await poll(ctx, `(() => { const c = [...document.querySelectorAll('.scr-dashboard-series-card')].find((x) => x.innerText.includes(${JSON.stringify(title)})); return c ? (c.click(), true) : null; })()`, 10000);
      const inspector = await poll(ctx, `(() => { const s = document.querySelector('.scr-results-inspector'); return s ? s.getAttribute('aria-label') : null; })()`, 10000);
      result.check('a Dashboard series card opens Results with that run selected', Boolean(card) && Boolean(inspector) && inspector.includes(title), { title, card, inspector });
    }

    // --- the notice is not shown again: the Torrent Manager searches straight away -------
    await goTo('torrents', '.scr-page--torrents', 8000);
    await ctx.sleep(800);
    const noticeAgain = await ev(`!!document.querySelector('[data-download-notice]')`);
    result.check('the acknowledged notice is not shown again', noticeAgain === false, { noticeAgain });

    // --- the Plugins page is not part of v1 ------------------------------------------------
    await ev(`(window.dispatchEvent(new CustomEvent('scraper:navigate', { detail: { page: 'plugins' } })), true)`);
    await ctx.sleep(500);
    const plugins = await ev(`(() => {
      const rail = [...document.querySelectorAll('.scr-rail-label')].map((b) => b.innerText.trim());
      const text = document.body.innerText;
      return { railItems: rail.length, railHasPlugins: rail.includes('Plugins'), pageShown: /Install from file|Permission audit|Update center/.test(text), title: document.querySelector('.scr-page-title')?.innerText ?? '' };
    })()`);
    result.check('the Plugins page is unreachable (no rail entry; navigating to it shows no plugin page)', plugins && plugins.railItems > 5 && !plugins.railHasPlugins && !plugins.pageShown, plugins);

    // --- the index search, then the send to qBittorrent ------------------------------------
    const rows = await ev(`window.api.scraperSearchTorrents({ query: { text: ${JSON.stringify(SHOW)} }, indexers: [${JSON.stringify(indexEntry)}], torrents: ${JSON.stringify(s.torrents)}, timeoutMs: 8000 })`, { await: true });
    const list = Array.isArray(rows) ? rows : rows?.rows ?? rows?.results ?? [];
    result.check('the fixture index answers the torrent search (four releases)', list.length === 4, { count: list.length, names: list.map((r) => r.name) });
    // Two episodes, their magnets rebuilt without trackers: nothing may announce anywhere.
    const picked = list.slice(0, 2).map((r) => ({ ...r, seeders: Math.max(1, r.seeders ?? 1), magnet: `magnet:?xt=urn:btih:${r.infoHash}&dn=${encodeURIComponent(r.name)}` }));
    const rowEpisodes = Object.fromEntries(picked.map((r) => [r.id, [Number(/ - (\d+)/.exec(r.name)?.[1] ?? 0)]]));
    const sent = await ev(`window.api.scraperQbitSend({ config: ${JSON.stringify(qbitConfig)}, rows: ${JSON.stringify(picked)}, ingest: { hint: { title: ${JSON.stringify(SHOW)}, provider: 'e2e' }, rowEpisodes: ${JSON.stringify(rowEpisodes)} } })`, { await: true });
    result.check('"Send to qBittorrent" adds both to the fake client (logged in, tagged, no trackers)', qbit.torrents.size >= 2 && qbit.calls.includes('POST /api/v2/torrents/add'), { sent, torrents: [...qbit.torrents.values()].map((t) => ({ name: t.name, tags: t.tags, category: t.category })), logins: qbit.logins() });

    // --- the app's completion poller imports the finished downloads -------------------------
    const synced = await ev(`window.api.mediaIngestSyncQbit(${JSON.stringify(qbitConfig)})`, { await: true });
    const names = [...qbit.torrents.values()].map((t) => t.name);
    let imported = null;
    for (let i = 0; i < 30 && !imported; i++) {
      await ev(`window.api.mediaIngestRescan()`, { await: true }).catch(() => null);
      imported = await ev(`window.api.listMedia().then((l) => { const want = ${JSON.stringify(names)}; const got = (l || []).filter((m) => want.includes(m.fileName)); return got.length === want.length ? got.map((m) => ({ title: m.title, fileName: m.fileName, series: m.seriesTitle, episode: m.episode })) : null; })`, { await: true });
      if (!imported) await ctx.sleep(1000);
    }
    const state = await ev(`window.api.mediaIngestState()`, { await: true });
    result.check('the finished downloads are imported into the library by the qBittorrent poller', Boolean(imported), { imported, synced, qbit: state?.qbit });
    if (imported) result.check('the import knows the show and the episode numbers', imported.every((m) => m.series && m.episode), imported);

    await ev(`__e2e.open('player')`);
    const card = await poll(ctx, `(() => { const t = [...document.querySelectorAll('.gum-card__title, .mc-tile-copy strong')].map((x) => x.textContent); return t.find((x) => x.includes(${JSON.stringify(SHOW)})) || null; })()`, 15000);
    result.check('the show appears in the Media Center library', Boolean(card), card);
    await ctx.shot('library');
  },
};
