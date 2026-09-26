// New Scrape — the app's main screen.
//
// Target form on top, then a tabbed result surface. Everything below the form
// is driven by the ScraperPort, so when a real backend replaces the mock this
// page does not change.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import { Button, IconButton, Progress, Select } from '../../ui';
import StatusDot from '../StatusDot';
import EpisodeTable from '../result/EpisodeTable';
import ResultToolbar, { EMPTY_FILTERS, type ResultFilters } from '../result/ResultToolbar';
import {
  DetailsPanel,
  ImageGrid,
  LogConsole,
  MetadataPanel,
  StreamResultPanel,
  TorrentResultPanel,
} from '../result/ResultPanels';
import { resolveColumns, rowMatches, sortRows, type GroupKey } from '../result/columns';
import { useScraper } from '../ScraperContext';
import { useScraperPort } from '../data/scraperPort';
import { formatEtaClock } from '../data/charts';
import { sx, sxn, sxNumber, sxs } from '../strings';
import { profileName, tr } from '../localize';
import {
  SCRAPER_PAGE_SIZES,
  type ScraperColumnId,
  type ScraperResultTab,
} from '../../../../shared/scraperShell';
import type {
  EpisodeRow,
  ImageRow,
  LogLine,
  ScrapeResult,
  ScrapeStage,
  StreamRow,
  TorrentRow,
} from '../../../../shared/scraperResults';
import {
  getActiveScraperSettings,
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  saveScraperSettingsDocument,
} from '../../../scraperSettingsStore';
import { formatBytes } from '../../../../shared/assetRegistry';
import { scraperArtwork } from '../artwork';

const STAGE_LABEL: Record<ScrapeStage, string> = {
  queued: 'Queued',
  searching: 'Searching',
  fetching: 'Fetching',
  parsing: 'Extracting',
  streams: 'Checking mirrors',
  subtitles: 'Collecting subtitles',
  validating: 'Validating',
  done: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

interface RunState {
  jobId: string | null;
  stage: ScrapeStage;
  done: number;
  total: number;
  etaSec: number;
  failed: number;
}

const IDLE: RunState = { jobId: null, stage: 'done', done: 0, total: 0, etaSec: 0, failed: 0 };

function publishJobStatus(detail: { active: boolean; lastScrape?: string }) {
  window.dispatchEvent(new CustomEvent('scraper:job-status', { detail }));
}

export default function NewScrapePage() {
  const ctl = useScraper();
  const port = useScraperPort();

  const [run, setRun] = useState<RunState>(IDLE);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [liveRows, setLiveRows] = useState<EpisodeRow[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogLine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ResultFilters>(EMPTY_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);
  const [startOpen, setStartOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<EpisodeRow | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const unsubscribe = useRef<(() => void) | null>(null);

  const settings = useMemo(() => getActiveScraperSettings(), []);
  // The profile picker and the preflight line read the real document: they
  // used to say "Balanced" whichever profile a run would actually use.
  const [doc, setDoc] = useState(() => loadScraperSettingsDocument());
  useEffect(() => onScraperSettingsChanged(setDoc), []);
  const activeProfile = doc.profiles.find((profile) => profile.id === doc.activeProfileId) ?? null;
  // Measured where downloads land; `null` renders as "unknown", never a guess.
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void port.freeSpace().then(
      (report) => {
        if (alive) setFreeBytes(report.bytes);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [port]);
  const languagePriority = settings.episodeProcessing.languagePriority;

  useEffect(
    () => () => {
      unsubscribe.current?.();
      publishJobStatus({ active: false });
    },
    [],
  );

  const running = run.jobId !== null && !['done', 'failed', 'cancelled'].includes(run.stage);

  const start = useCallback(async () => {
    unsubscribe.current?.();
    setResult(null);
    setLiveRows([]);
    setLiveLogs([]);
    setSelected(new Set());
    setPreviewRow(null);
    setActionNotice('');
    setPageIndex(0);
    setRun({ ...IDLE, stage: 'queued', jobId: 'pending' });
    publishJobStatus({ active: true });

    let jobId: string;
    try {
      jobId = await port.startScrape({
        targetUrl: ctl.targetUrl,
        profileId: 'balanced',
      });
    } catch {
      setRun((prev) => ({ ...prev, jobId: null, stage: 'failed' }));
      publishJobStatus({ active: false });
      return;
    }
    setRun((prev) => ({ ...prev, jobId }));

    unsubscribe.current = port.subscribeJob(jobId, (event) => {
      switch (event.kind) {
        case 'stage':
          setRun((prev) => ({ ...prev, stage: event.stage }));
          break;
        case 'progress':
          setRun((prev) => ({
            ...prev,
            done: event.done,
            total: event.total,
            etaSec: event.etaSec,
          }));
          break;
        case 'row':
          setLiveRows((prev) => (prev.some((r) => r.id === event.row.id) ? prev : [...prev, event.row]));
          break;
        case 'log':
          // Newest first, and bounded — an unbounded live log is a memory leak
          // dressed up as a feature.
          setLiveLogs((prev) => [event.line, ...prev].slice(0, 500));
          break;
        case 'done':
          setRun((prev) => ({ ...prev, stage: 'done', failed: event.summary.failed }));
          publishJobStatus({
            active: false,
            lastScrape: `${event.summary.provider} · ${event.summary.found}/${event.summary.found}`,
          });
          void port.getResult(jobId).then(setResult, () => undefined);
          break;
        case 'error':
          setRun((prev) => ({ ...prev, stage: 'failed' }));
          publishJobStatus({ active: false });
          break;
      }
    });
  }, [ctl.targetUrl, port]);

  const cancel = useCallback(async () => {
    if (!run.jobId) return;
    await port.cancelScrape(run.jobId);
    setRun((prev) => ({ ...prev, stage: 'cancelled' }));
    publishJobStatus({ active: false });
  }, [port, run.jobId]);

  // Rows stream in during a run, then the finished result takes over.
  const allRows: EpisodeRow[] = result?.episodes ?? liveRows;
  const streams: StreamRow[] = result?.streams ?? [];
  const torrents: TorrentRow[] = result?.torrents ?? [];
  const images: ImageRow[] = result?.images ?? [];
  const logs: LogLine[] = liveLogs.length ? liveLogs : (result?.logs ?? []);

  const filtered = useMemo(() => {
    let rows = allRows.filter((row) => rowMatches(row, query));
    if (filters.onlyMissingSubs) {
      rows = rows.filter((row) => !row.subtitles.some((s) => s.language === languagePriority[0]));
    }
    if (filters.onlyFailed) rows = rows.filter((row) => row.status !== 'ok');
    if (filters.resolution) rows = rows.filter((row) => row.resolution === filters.resolution);
    return sortRows(rows, ctl.sortColumn, ctl.sortDir);
  }, [allRows, query, filters, languagePriority, ctl.sortColumn, ctl.sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ctl.pageSize));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const pageRows = useMemo(
    () => filtered.slice(safePage * ctl.pageSize, (safePage + 1) * ctl.pageSize),
    [filtered, safePage, ctl.pageSize],
  );

  const columns = useMemo(() => {
    if (ctl.compact) {
      const compactColumns: ScraperColumnId[] = ['select', 'index', 'title', 'source', 'status', 'link'];
      return resolveColumns(compactColumns, compactColumns);
    }
    return resolveColumns(ctl.visibleColumns, ctl.shell.columnOrder);
  }, [ctl.compact, ctl.visibleColumns, ctl.shell.columnOrder]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The source mode decides which of Streams / Torrents is even meaningful, so
  // it hides the irrelevant tab rather than showing one that is always empty.
  const mode = settings.sources.mode;
  const allTabs = (
    [
      { id: 'episodes', label: sx('result.tab.episodes'), count: allRows.length, statusId: 'result.episodes' },
      { id: 'details', label: sx('result.tab.details'), statusId: 'result.details' },
      mode !== 'torrent'
        ? { id: 'streams', label: sx('result.tab.streams'), count: streams.length, statusId: 'result.streams' }
        : null,
      mode !== 'streaming'
        ? { id: 'torrents', label: sx('result.tab.torrents'), count: torrents.length, statusId: 'result.torrents' }
        : null,
      { id: 'images', label: sx('result.tab.images'), count: images.length, statusId: 'result.images' },
      { id: 'metadata', label: sx('result.tab.metadata'), statusId: 'result.metadata' },
      { id: 'logs', label: sx('result.tab.logs'), count: logs.length, statusId: 'result.logs' },
    ] as ({ id: ScraperResultTab; label: string; count?: number; statusId: string } | null)[]
  ).filter((tab): tab is { id: ScraperResultTab; label: string; count?: number; statusId: string } =>
    tab !== null,
  );
  const tabs = ctl.compact
    ? allTabs.filter((tab) => ['episodes', 'details', 'metadata'].includes(tab.id))
    : allTabs;

  // A persisted tab that the current mode hides would leave the pane blank.
  const activeTab: ScraperResultTab = tabs.some((t) => t.id === ctl.resultTab)
    ? ctl.resultTab
    : 'episodes';

  const trimmed = ctl.targetUrl.trim();
  const looksLikeUrl = /^https?:\/\/\S+\.\S+/i.test(trimmed);
  const preflight = !trimmed
    ? sx('scrape.urlEmpty')
    : looksLikeUrl
      ? sx('scrape.urlValid')
      : sx('scrape.urlSearch');

  const actionRows = selected.size
    ? allRows.filter((row) => selected.has(row.id))
    : pageRows;

  const previewSelection = () => {
    const row = actionRows[0] ?? allRows[0] ?? null;
    setPreviewRow(row);
    setActionNotice(
      row
        ? sxn('result.previewReady', actionRows.length || 1)
        : sx('result.emptyEpisodes'),
    );
  };

  const exportSelection = () => {
    if (!actionRows.length) return;
    const payload = actionRows.map((row) => ({
      number: row.number,
      title: row.titleEn,
      titleJa: row.titleJa,
      resolution: row.resolution,
      source: row.sourceLabel,
      url: row.url,
      subtitles: row.subtitles.map((subtitle) => subtitle.language),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${(result?.metadata.titleEn ?? 'anime-scrape')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-episodes.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    setActionNotice(sxn('result.exported', payload.length));
  };

  return (
    <div className="scr-page scr-page--scrape">
      <header className="scr-page-head">
        <div>
          <h1 className="scr-page-title">
            {sx('page.newScrape.title')}
            <StatusDot id="page.new-scrape" className="scr-page-dot" />
          </h1>
          <p className="scr-page-sub">{sx('page.newScrape.subtitle')}</p>
        </div>
      </header>

      <section className="scr-form-card">
        <label className="scr-micro-label" htmlFor="scr-target">
          {sx('scrape.targetUrl')}
        </label>
        <div className="scr-target-row">
          <div className="scr-target-input">
            <span className="scr-target-icon" aria-hidden>
              <Icon name="globe" size={14} />
            </span>
            <input
              id="scr-target"
              type="text"
              className="scr-input"
              value={ctl.targetUrl}
              placeholder={sx('scrape.targetPlaceholder')}
              onChange={(e) => ctl.setTargetUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !running) void start();
              }}
            />
          </div>

          <div className="scr-split">
            <Button
              variant="primary"
              leftIcon={<Icon name={running ? 'pause' : 'player'} size={13} />}
              onClick={() => (running ? void cancel() : void start())}
            >
              {running ? sx('scrape.cancel') : sx('scrape.start')}
            </Button>
            <IconButton
              label={sx('scrape.startOptions')}
              className="scr-split-more"
              aria-expanded={startOpen}
              onClick={() => setStartOpen((v) => !v)}
            >
              <Icon name="chevron" size={12} />
            </IconButton>
            {startOpen && (
              <div className="scr-pop scr-pop--split">
                <div className="scr-pop-body">
                  {[sx('scrape.startPaused'), sx('scrape.previewOnly'), sx('scrape.queue')].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="scr-pop-item"
                      onClick={() => {
                        setStartOpen(false);
                        void start();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="scr-form-grid">
          <div>
            <label className="scr-micro-label" htmlFor="scr-profile">{sx('scrape.profile')}</label>
            <Select
              id="scr-profile"
              value={doc.activeProfileId}
              onChange={(event) => setDoc(saveScraperSettingsDocument({
                ...doc,
                activeProfileId: event.target.value,
              }))}
              options={doc.profiles.map((profile) => ({ value: profile.id, label: profileName(profile) }))}
            />
          </div>
          <div>
            <label className="scr-micro-label" htmlFor="scr-ua">{sx('scrape.userAgent')}</label>
            <Select
              id="scr-ua"
              value={settings.network.userAgent || ''}
              onChange={() => ctl.openDrawer('network')}
              options={[{ value: '', label: 'Default (Random)' }]}
            />
          </div>
          <div>
            <label className="scr-micro-label" htmlFor="scr-proxy">{sx('scrape.proxy')}</label>
            <Select
              id="scr-proxy"
              value={settings.network.proxyUrl || ''}
              onChange={() => ctl.openDrawer('network')}
              options={[{ value: '', label: sx('scrape.noProxy') }]}
            />
          </div>
          <Button
            className="scr-form-advanced"
            leftIcon={<Icon name="settings" size={13} />}
            onClick={() => ctl.openDrawer('network')}
          >
            {sx('scrape.advanced')}
          </Button>
        </div>

        {/* Preflight: the spec's "validate before work begins" check, so an
            unusable target is obvious before a job is queued. */}
        <div className="scr-preflight">
          <span><b>{sx('scrape.preflightUrl')}</b> {preflight}</span>
          <span><b>{sx('scrape.preflightProvider')}</b> {looksLikeUrl ? sx('scrape.detected') : '—'}</span>
          <span><b>{sx('scrape.preflightProfile')}</b> {activeProfile ? profileName(activeProfile) : '—'}</span>
          <span>
            <b>{sx('scrape.preflightSpace')}</b>{' '}
            {freeBytes === null ? sx('downloads.freeUnknown') : formatBytes(freeBytes)}
          </span>
        </div>

        {run.jobId && (
          <div className="scr-run">
            <div className="scr-run-tiles">
              {[
                { label: sx('scrape.stat.detected'), value: String(run.total) },
                { label: sx('scrape.stat.fetched'), value: String(run.done) },
                { label: sx('scrape.stat.failed'), value: String(run.failed) },
                { label: sx('scrape.stat.eta'), value: formatEtaClock(run.etaSec) },
              ].map((tile) => (
                <div key={tile.label} className="scr-tile">
                  <span className="scr-tile-label">{tile.label}</span>
                  <span className="scr-tile-value">{tile.value}</span>
                </div>
              ))}
            </div>
            <div className="scr-run-bar">
              <span className="scr-run-stage">{STAGE_LABEL[run.stage]}</span>
              <Progress value={run.total ? run.done / run.total : null} />
              <span className="scr-run-pct">
                {run.total ? `${Math.round((run.done / run.total) * 100)}%` : '—'}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="scr-result">
        <div className="scr-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`scr-tab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => ctl.setResultTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined && <span className="scr-tab-count">({tab.count})</span>}
              <StatusDot id={tab.statusId} />
            </button>
          ))}
          {ctl.compact && (
            <button
              type="button"
              role="tab"
              aria-selected={false}
              className="scr-tab"
              onClick={() => ctl.navigate('downloads')}
            >
              {sx('nav.downloads')}
            </button>
          )}
        </div>

        {activeTab === 'episodes' && (
          <>
            <ResultToolbar
              query={query}
              onQuery={(v) => {
                setQuery(v);
                setPageIndex(0);
              }}
              filters={filters}
              onFilters={(next) => {
                setFilters(next);
                setPageIndex(0);
              }}
              sortColumn={ctl.sortColumn}
              sortDir={ctl.sortDir}
              onSort={(id, dir) => ctl.setSort(id, dir)}
              groupBy={ctl.groupBy as GroupKey}
              onGroupBy={(key) => ctl.setGroupBy(key)}
              visibleColumns={ctl.visibleColumns}
              onVisibleColumns={(ids) => ctl.setVisibleColumns(ids as ScraperColumnId[])}
            />

            <EpisodeTable
              rows={pageRows}
              columns={columns}
              density={ctl.density}
              selected={selected}
              onToggle={toggleRow}
              sortColumn={ctl.sortColumn}
              sortDir={ctl.sortDir}
              onSort={(id) =>
                ctl.setSort(id, id === ctl.sortColumn && ctl.sortDir === 'asc' ? 'desc' : 'asc')
              }
              languagePriority={languagePriority}
              emptyMessage={sx('result.emptyEpisodes')}
              onOpen={(row) => {
                setPreviewRow(row);
                setActionNotice(sxs('result.openedPreview', row.titleEn));
              }}
            />

            <div className="scr-table-foot">
              <label className="scr-foot-check">
                <input
                  type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const row of pageRows) {
                        if (e.target.checked) next.add(row.id);
                        else next.delete(row.id);
                      }
                      return next;
                    })
                  }
                />
                {sx('result.selectAll')}
              </label>
              <span className="scr-muted">{sxn('result.selected', selected.size)}</span>

              <div className="scr-pager">
                <IconButton
                  label={sx('result.pagePrev')}
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <Icon name="chevron" size={12} />
                </IconButton>
                {pagerPages(safePage, pageCount).map((page, i) =>
                  page === -1 ? (
                    <span key={`gap-${i}`} className="scr-pager-gap">…</span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      className={`scr-pager-page${page === safePage ? ' is-active' : ''}`}
                      aria-current={page === safePage ? 'page' : undefined}
                      onClick={() => setPageIndex(page)}
                    >
                      {page + 1}
                    </button>
                  ),
                )}
                <IconButton
                  label={sx('result.pageNext')}
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <Icon name="chevron" size={12} />
                </IconButton>
              </div>

              <span className="scr-muted scr-foot-count">
                {tr('scrApp.r2.table.range', {
                  from: sxNumber(filtered.length ? safePage * ctl.pageSize + 1 : 0),
                  to: sxNumber(Math.min((safePage + 1) * ctl.pageSize, filtered.length)),
                  total: sxNumber(filtered.length),
                })}
              </span>

              <Select
                className="scr-foot-size"
                aria-label={sx('result.perPage')}
                value={String(ctl.pageSize)}
                onChange={(e) => {
                  ctl.setPageSize(Number(e.target.value));
                  setPageIndex(0);
                }}
                options={SCRAPER_PAGE_SIZES.map((n) => ({
                  value: String(n),
                  label: `${n} ${sx('result.perPage')}`,
                }))}
              />
            </div>
          </>
        )}

        {activeTab === 'details' && result && (
          <DetailsPanel metadata={result.metadata} episodes={allRows} />
        )}
        {activeTab === 'details' && !result && (
          <p className="scr-table-empty">{sx('result.emptyEpisodes')}</p>
        )}
        {activeTab === 'streams' && (
          <StreamResultPanel
            streams={streams}
            episodes={allRows}
            metadata={result?.metadata}
          />
        )}
        {activeTab === 'torrents' && <TorrentResultPanel torrents={torrents} />}
        {activeTab === 'images' && <ImageGrid images={images} />}
        {activeTab === 'metadata' && result && <MetadataPanel metadata={result.metadata} />}
        {activeTab === 'metadata' && !result && (
          <p className="scr-table-empty">{sx('result.emptyEpisodes')}</p>
        )}
        {activeTab === 'logs' && <LogConsole logs={logs} />}
      </section>

      {allRows.length > 0 && (
        <section className="scr-batch-actions" aria-label={sx('result.batchActions')}>
          <div className="scr-batch-primary">
            <Button size="sm" leftIcon={<Icon name="eye" size={13} />} onClick={previewSelection}>
              {sx('result.preview')}
            </Button>
            <Button size="sm" leftIcon={<Icon name="external" size={13} />} onClick={exportSelection}>
              {sx('result.exportJson')}
            </Button>
          </div>
          <span className="scr-batch-spacer" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set(pageRows.map((row) => row.id)))}
          >
            {sx('result.selectPage')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {sx('result.clearSelection')}
          </Button>
          {actionNotice && <span className="scr-batch-notice">{actionNotice}</span>}
        </section>
      )}

      {previewRow && (
        <section className="scr-selection-preview" aria-label={sx('result.preview')}>
          <img src={previewRow.thumbnailUrl || scraperArtwork(previewRow.number - 1)} alt="" />
          <div>
            <span className="scr-micro-label">{sx('result.preview')}</span>
            <strong>{previewRow.titleEn}</strong>
            <small>{previewRow.titleJa}</small>
          </div>
          <span className="scr-pill scr-pill--outline">{previewRow.resolution}</span>
          <span className="scr-pill scr-pill--good">{previewRow.status}</span>
          <Button size="sm" variant="ghost" onClick={() => setPreviewRow(null)}>
            {sx('common.close')}
          </Button>
        </section>
      )}

      {ctl.compact && (
        <section className="scr-compact-profile" aria-label={sx('result.currentProfile')}>
          <div>
            <span>{sx('result.currentProfile')}</span>
            <strong>{activeProfile ? profileName(activeProfile) : '—'}</strong>
          </div>
          <div><span>{sx('result.concurrent')}</span><strong>{settings.network.concurrentRequests}</strong></div>
          <div><span>{sx('result.retries')}</span><strong>{settings.network.retryAttempts}</strong></div>
          <div><span>{sx('result.timeout')}</span><strong>{Math.round(settings.network.requestTimeoutMs / 1_000)}s</strong></div>
          <div><span>{sx('result.proxyState')}</span><strong>{settings.network.proxyUrl ? sx('result.enabled') : sx('result.disabled')}</strong></div>
        </section>
      )}
    </div>
  );
}

/** 1 2 3 … 141 — first, last, and a window around the current page. */
function pagerPages(current: number, count: number): number[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const pages = new Set<number>([0, count - 1, current]);
  for (let d = 1; d <= 1; d += 1) {
    if (current - d > 0) pages.add(current - d);
    if (current + d < count - 1) pages.add(current + d);
  }
  if (current < 3) for (let i = 1; i <= 3; i += 1) pages.add(i);
  if (current > count - 4) for (let i = count - 4; i < count - 1; i += 1) pages.add(i);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: number[] = [];
  let previous = -1;
  for (const page of sorted) {
    if (previous !== -1 && page - previous > 1) out.push(-1);
    out.push(page);
    previous = page;
  }
  return out;
}
