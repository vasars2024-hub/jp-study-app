// The four Data pages: Results, Downloads, Exports and History.
//
// One module because they share a shape — a summary strip over a list built
// from the port — and splitting them would mean four near-identical files.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import { Button, IconButton, Progress, Select } from '../../ui';
import VirtualList from '../../VirtualList';
import ScrCard from '../ScrCard';
import StatusDot from '../StatusDot';
import { Pill } from '../result/Pill';
import { useScraper } from '../ScraperContext';
import { useScraperPort } from '../data/scraperPort';
import { formatAgeMinutes, formatEtaClock } from '../data/charts';
import { formatBytes } from '../../../../shared/assetRegistry';
import { formatDuration } from '../../../stats';
import { scrollIntoViewReliably } from '../../../utils/reliableScroll';
import { distinctEpisodes } from '../data/dashboardData';
import { sx, sxn, sxNumber, sxs, sxss, type ScraperTextKey } from '../strings';
import { firstReason } from '../disabledReason';
import TransferRemoveConfirm from '../TransferRemoveConfirm';
import { errorText, qbitActionNotice } from '../data/qbitActions';
import { loadExternalPlayerPreferences } from '../../../externalPlayerStore';
import { selectExternalPlayerProfile, type PlaybackHandoff } from '../../../../shared/externalPlayer';
import type {
  ScraperFreeSpaceReport,
  ScraperQbitTorrentAction,
} from '../../../../shared/scraperIpc';
import { SERIES, episodes, type FixtureSeries } from '../data/fixtures';
import { scraperArtwork } from '../artwork';
import {
  buildEpisodeExport,
  exportColumns,
  exportExtension,
  exportFileStem,
} from '../data/exportBuilder';
import {
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  updateActiveScraperSettings,
} from '../../../scraperSettingsStore';
import { resolveScraperSettings } from '../../../../shared/scraperSettings';
import {
  buildResultLibrary,
  buildSeriesResultReport,
  filterSeriesResults,
  summarizeSeriesResults,
  type ResultLibraryFilter,
} from '../data/resultLibrary';
import { resolveResultSeriesHandoff } from '../data/resultHandoff';
import type {
  DownloadRow,
  EpisodeRow,
  ExportRecord,
  ScrapeJobSummary,
  ScrapeResult,
  ScrapeStageTiming,
} from '../../../../shared/scraperResults';
import {
  SCRAPER_EXPORT_FORMATS,
  type ScraperExportFormat,
} from '../../../../shared/scraperOutputSettings';

function PageHead({ titleKey, subKey, statusId, actions }: {
  titleKey: Parameters<typeof sx>[0];
  subKey: Parameters<typeof sx>[0];
  statusId: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="scr-page-head">
      <div>
        <h1 className="scr-page-title">
          {sx(titleKey)}
          <StatusDot id={statusId} className="scr-page-dot" />
        </h1>
        <p className="scr-page-sub">{sx(subKey)}</p>
      </div>
      {actions && <div className="scr-page-actions">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------- results ---

/**
 * The series header a result library row needs, built from a finished job.
 *
 * `FixtureSeries` started as the sample-data shape, but it is exactly the set
 * of fields the summary needs, so real results are projected onto it rather
 * than duplicating `summarizeSeriesResults` for a second input type.
 */
function seriesFromResult(summary: ScrapeJobSummary, result: ScrapeResult): FixtureSeries {
  return {
    // Replaced with the per-job id by buildResultLibrary().
    id: result.seriesId,
    titleEn: summary.titleEn || result.metadata.titleEn,
    titleJa: summary.titleJa || result.metadata.titleJa,
    provider: summary.provider,
    // What the catalogue says the season contains, which is what "missing"
    // is measured against — not how many rows this run happened to produce.
    episodes: result.metadata.episodeCount || result.episodes.length,
    streams: result.streams.length,
    images: result.images.length,
  };
}

export function ResultsPage() {
  const ctl = useScraper();
  const port = useScraperPort();
  const [library, setLibrary] = useState<{ series: FixtureSeries[]; rows: EpisodeRow[] } | null>(
    null,
  );

  // Every stored job becomes one row in the library. Sample data stands in only
  // in a window with no backend at all (a harness); a live profile that has
  // scraped nothing shows an empty library, not somebody else's shows.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const jobs = await port.listJobs();
        const loaded = await Promise.all(
          jobs.slice(0, 20).map(async (job) => {
            const result = await port.getResult(job.id).catch(() => null);
            if (!result) return null;
            return {
              jobId: job.id,
              seriesId: result.seriesId,
              series: seriesFromResult(job, result),
              episodes: result.episodes,
            };
          }),
        );
        const usable = loaded.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        if (alive && usable.length) {
          setLibrary(buildResultLibrary(usable));
          return;
        }
      } catch {
        /* nothing stored */
      }
      const live = (await port.backendCapabilities().catch(() => [])).length > 0;
      if (alive) setLibrary(live ? { series: [], rows: [] } : { series: SERIES, rows: episodes() });
    })();
    return () => {
      alive = false;
    };
  }, [port]);

  const rows = library?.rows ?? [];
  const [filter, setFilter] = useState<ResultLibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const inspectorRef = useRef<HTMLElement>(null);
  const bySeries = useMemo(
    () => summarizeSeriesResults(library?.series ?? [], rows),
    [library, rows],
  );
  // Deduplicated on `EpisodeRow.id` (untouched by `buildResultLibrary`, which
  // re-tags only `seriesId`), so re-running a scrape cannot inflate either tile.
  const distinct = useMemo(() => distinctEpisodes(rows), [rows]);
  const visible = useMemo(
    () => filterSeriesResults(bySeries, filter, query),
    [bySeries, filter, query],
  );
  const selected = visible.find((summary) => summary.series.id === selectedId) ?? null;

  useEffect(() => {
    const handoff = resolveResultSeriesHandoff(
      ctl.resultSeriesId,
      bySeries.map((summary) => summary.series.id),
    );
    if (!handoff) return;
    setFilter('all');
    setQuery('');
    setSelectedId(handoff);
    setNotice('');
    ctl.clearResultSeries();
  }, [ctl.resultSeriesId, ctl.clearResultSeries, bySeries]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelScroll: (() => void) | null = null;
    const frame = window.requestAnimationFrame(() => {
      cancelScroll = scrollIntoViewReliably(inspectorRef.current, { block: 'start' });
      inspectorRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cancelScroll?.();
    };
  }, [selectedId]);

  const resumeSeries = (title: string) => {
    ctl.setTargetUrl(title);
    ctl.navigate('new-scrape');
  };

  const exportSeriesReport = () => {
    if (!selected) return;
    const report = buildSeriesResultReport(selected);
    const href = URL.createObjectURL(new Blob([report.content], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = report.filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
    setNotice(`${report.filename} created with ${selected.episodes.length.toLocaleString()} episodes.`);
  };

  return (
    <div className="scr-page">
      <PageHead
        titleKey="page.results.title"
        subKey="page.results.subtitle"
        statusId="page.results"
        actions={
          <Button size="sm" onClick={() => ctl.navigate('new-scrape')}>
            {sx('app.newScrape')}
          </Button>
        }
      />

      {/* Each card below is one stored RUN, not one series - that is what the
          per-job `librarySeriesId` fix established, and it is why a series
          scraped five times shows five cards. The first tile therefore counts
          results; calling it "Series" made this page say 10 while the Dashboard
          said 5 for the same library. The episode tiles deduplicate on
          `EpisodeRow.id`, so they cannot count one episode once per run. */}
      <div className="scr-tile-row">
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('results.count')}</span>
          <span className="scr-tile-value">{sxNumber(bySeries.length)}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('results.episodes')}</span>
          <span className="scr-tile-value">{sxNumber(distinct.indexed)}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('results.withJa')}</span>
          <span className="scr-tile-value">{sxNumber(distinct.japanese)}</span>
        </div>
        <div className="scr-tile is-bad">
          <span className="scr-tile-label">{sx('results.failed')}</span>
          <span className="scr-tile-value">
            {sxNumber(bySeries.reduce((n, s) => n + s.failed, 0))}
          </span>
        </div>
      </div>

      <div className="scr-result-controls scr-results-toolbar">
        <div className="scr-chip-row" aria-label="Result library filter">
          {([
            ['all', 'All series'],
            ['problems', 'Needs attention'],
            ['complete', 'Complete'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`scr-chip${filter === value ? ' is-on' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="scr-result-log-search">
          <Icon name="search" size={13} />
          <input
            className="scr-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search result library…"
          />
        </label>
        <span className="scr-result-control-spacer" />
        <span className="scr-muted">{sxn('results.countLabel', visible.length)}</span>
      </div>

      <div className="scr-grid">
        {visible.map((summary) => {
          const {
            series,
            episodes: own,
            withJapanese,
            failed,
            warned,
            expected,
            missing,
          } = summary;
          const index = SERIES.findIndex((candidate) => candidate.id === series.id);
          const ratio = expected ? own.length / expected : 0;
          return (
            <ScrCard
              key={series.id}
              id={`results-${series.id}`}
              title={series.titleEn}
              description={series.titleJa}
              statusId="page.results"
              trailing={
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={selectedId === series.id}
                  onClick={() => {
                    setSelectedId(series.id);
                    setNotice('');
                  }}
                >
                  {sx('results.open')}
                </Button>
              }
            >
              <div className="scr-result-series-media">
                <img src={scraperArtwork(index + 2)} alt="" />
                <span>
                  <b>{Math.round(ratio * 100)}%</b>
                  <small>catalogue coverage</small>
                </span>
              </div>
              <div className="scr-meter">
                <Progress value={ratio} />
                <span className="scr-t-num">
                  {own.length.toLocaleString()} / {expected.toLocaleString()}
                </span>
              </div>
              <div className="scr-chip-row">
                <Pill tone="outline">{series.provider}</Pill>
                <Pill tone={withJapanese ? 'good' : 'warn'}>{sxn('results.jaCount', withJapanese)}</Pill>
                {warned > 0 && <Pill tone="warn">{sxn('results.warnCount', warned)}</Pill>}
                {failed > 0 && <Pill tone="bad">{sxn('results.failCount', failed)}</Pill>}
                {missing > 0 && <Pill tone="warn">{sxn('results.missingCount', missing)}</Pill>}
              </div>
              {missing > 0 && (
                <p className="scr-muted">{sx('results.missingHint')}</p>
              )}
            </ScrCard>
          );
        })}
      </div>

      {selected && (
        <section
          ref={inspectorRef}
          className="scr-results-inspector"
          aria-label={`Result details for ${selected.series.titleEn}`}
          tabIndex={-1}
        >
          <div className="scr-results-inspector-media">
            <img
              src={scraperArtwork(SERIES.findIndex((series) => series.id === selected.series.id) + 2)}
              alt=""
            />
            <span>
              <b>{selected.series.titleEn}</b>
              <small>{selected.series.titleJa}</small>
              <em>{selected.series.provider}</em>
            </span>
          </div>
          <div className="scr-results-inspector-body">
            <div className="scr-dashboard-block-head">
              <div>
                <span className="scr-eyebrow">Series result inspector</span>
                <h2>{selected.episodes.length.toLocaleString()} indexed episodes</h2>
                <p>Review the latest rows, export a report, or resume this title in New Scrape.</p>
              </div>
              <div className="scr-page-actions">
                <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
                <Button size="sm" onClick={exportSeriesReport}>Export report</Button>
                <Button size="sm" variant="primary" onClick={() => resumeSeries(selected.series.titleEn)}>
                  Resume scrape
                </Button>
              </div>
            </div>
            {notice && <p className="scr-action-notice" role="status">{notice}</p>}
            <div className="scr-results-inspector-stats">
              <span><small>Coverage</small><b>{Math.round((selected.episodes.length / Math.max(1, selected.expected)) * 100)}%</b></span>
              <span><small>Japanese subs</small><b>{selected.withJapanese.toLocaleString()}</b></span>
              <span><small>Indexed size</small><b>{formatBytes(selected.bytes)}</b></span>
              <span><small>Runtime</small><b>{formatDuration(selected.durationSec)}</b></span>
              <span><small>Issues</small><b>{selected.failed + selected.warned + selected.missing}</b></span>
            </div>
            <div className="scr-results-episode-preview" role="table" aria-label="Recent indexed episodes">
              {selected.episodes.slice(0, 5).map((episode) => (
                <div role="row" key={episode.id}>
                  <span role="cell">{episode.numberLabel}</span>
                  <span role="cell"><b>{episode.titleEn}</b><small>{episode.titleJa}</small></span>
                  <span role="cell">{episode.resolution}</span>
                  <span role="cell">{episode.subtitles.map((subtitle) => subtitle.language.toUpperCase()).join(', ') || '—'}</span>
                  <Pill tone={episode.status === 'ok' ? 'good' : episode.status === 'warning' ? 'warn' : 'bad'}>
                    {episode.status}
                  </Pill>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// -------------------------------------------------------------- downloads ---

const DOWNLOAD_TONE: Record<DownloadRow['state'], 'good' | 'warn' | 'bad' | 'accent' | 'neutral'> = {
  downloading: 'accent',
  queued: 'neutral',
  paused: 'warn',
  done: 'good',
  failed: 'bad',
};

const DOWNLOAD_STATE_KEY: Record<DownloadRow['state'], ScraperTextKey> = {
  downloading: 'downloads.state.downloading',
  queued: 'downloads.state.queued',
  paused: 'downloads.state.paused',
  done: 'downloads.state.done',
  failed: 'downloads.state.failed',
};

export function DownloadsPage() {
  const port = useScraperPort();
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [free, setFree] = useState<ScraperFreeSpaceReport | null>(null);
  const [players] = useState(() => loadExternalPlayerPreferences());
  const [playerId, setPlayerId] = useState(
    () => selectExternalPlayerProfile(players, 'video')?.id ?? '',
  );
  const [playId, setPlayId] = useState('');
  const [playerNotice, setPlayerNotice] = useState<{ text: string; bad: boolean } | null>(null);

  // Every action re-reads the client rather than patching rows locally: the
  // page shows what qBittorrent says happened, not what the click hoped for.
  const refresh = useCallback(async () => {
    try {
      setRows(await port.listDownloads());
    } catch (error) {
      setNotice({ text: sxs('downloads.loadFailed', errorText(error)), bad: true });
    }
  }, [port]);

  useEffect(() => {
    void refresh();
    let alive = true;
    void port.freeSpace().then((report) => {
      if (alive) setFree(report);
    }, () => {
      if (alive) setFree({ bytes: null, source: 'none', path: '' });
    });
    return () => {
      alive = false;
    };
  }, [port, refresh]);

  const totals = useMemo(
    () => ({
      active: rows.filter((r) => r.state === 'downloading').length,
      queued: rows.filter((r) => r.state === 'queued').length,
      done: rows.filter((r) => r.state === 'done').length,
      failed: rows.filter((r) => r.state === 'failed').length,
      speed: rows.reduce((n, r) => n + r.speedBps, 0),
      remaining: rows.reduce((n, r) => n + Math.max(0, r.totalBytes - r.receivedBytes), 0),
    }),
    [rows],
  );

  // A storage warning is only useful before the disk fills, so it is derived
  // from what is still to come rather than from what has already landed — and
  // only when the free space was actually measured.
  const freeBytes = free?.bytes ?? null;
  const tight = freeBytes !== null && totals.remaining > freeBytes * 0.8;

  const act = async (
    row: DownloadRow,
    action: ScraperQbitTorrentAction,
    deleteFiles = false,
  ) => {
    setBusyId(row.id);
    try {
      const report = await port.qbitAction(action, [row.id], { deleteFiles });
      setNotice(qbitActionNotice(action, report, row.title, deleteFiles));
      if (report.ok && action === 'delete') setRemovingId(null);
    } catch (error) {
      setNotice({ text: sxs('transfer.failed', errorText(error)), bad: true });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  const completed = rows.filter((row) => row.state === 'done');
  const playRow = completed.find((row) => row.id === playId) ?? completed[0] ?? null;
  const player = players.profiles.find((profile) => profile.id === playerId) ?? null;
  const whyPlay = firstReason(
    [!playRow, sx('downloads.noCompleted')],
    [!player, sx('downloads.noPlayer')],
  );

  // A real handoff: the chosen external player profile is launched on the
  // file qBittorrent wrote. It used to download an .m3u whose only link to the
  // player dropdown was its file name.
  const playInPlayer = async () => {
    if (!playRow || !player) return;
    const handoff: PlaybackHandoff = {
      mediaPath: playRow.contentPath || playRow.destination,
      title: playRow.title,
      episodeNumber: null,
      subtitlePath: null,
      audioPreference: null,
      metadata: { source: 'scraper-downloads', infoHash: playRow.id },
      resumePositionSec: null,
    };
    try {
      const refused = await window.api.handoffMedia(handoff, player);
      setPlayerNotice(refused
        ? { text: sxs('downloads.playFailed', refused), bad: true }
        : { text: sxss('downloads.playing', playRow.title, player.name), bad: false });
    } catch (error) {
      setPlayerNotice({ text: sxs('downloads.playFailed', errorText(error)), bad: true });
    }
  };

  return (
    <div className="scr-page">
      <PageHead
        titleKey="page.downloads.title"
        subKey="page.downloads.subtitle"
        statusId="page.downloads"
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.active')}</span><span className="scr-tile-value">{sxNumber(totals.active)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.queued')}</span><span className="scr-tile-value">{sxNumber(totals.queued)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.done')}</span><span className="scr-tile-value">{sxNumber(totals.done)}</span></div>
        <div className={`scr-tile${totals.failed ? ' is-bad' : ''}`}><span className="scr-tile-label">{sx('downloads.failed')}</span><span className="scr-tile-value">{sxNumber(totals.failed)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.speed')}</span><span className="scr-tile-value">{formatBytes(totals.speed)}/s</span></div>
      </div>

      <div
        className={`scr-storage-bar${tight ? ' is-tight' : ''}`}
        title={free?.path || undefined}
      >
        <Icon name={tight ? 'warning' : 'drive'} size={14} />
        <span>
          {sx('downloads.remaining')} {formatBytes(totals.remaining)} · {sx('downloads.free')}{' '}
          {freeBytes === null ? sx('downloads.freeUnknown') : formatBytes(freeBytes)}
        </span>
      </div>

      <ScrCard id="download-queue" title={sx('downloads.queue')} statusId="page.downloads">
        {notice && (
          <p className={`scr-action-notice${notice.bad ? ' is-bad' : ''}`} role="status">{notice.text}</p>
        )}
        <ul className="scr-dl-list">
          {rows.map((row, index) => {
            const ratio = row.totalBytes ? row.receivedBytes / row.totalBytes : 0;
            const busy = busyId === row.id;
            const paused = row.state === 'paused';
            return (
              <li key={row.id} className="scr-dl">
                <span className="scr-t-thumb scr-dl-thumb" aria-hidden>
                  <img src={scraperArtwork(index)} alt="" />
                </span>
                <div className="scr-dl-main">
                  <span className="scr-t-en">{row.title}</span>
                  <span className="scr-t-ja">{row.subtitle}</span>
                  <Progress value={row.state === 'queued' ? 0 : ratio} />
                  <span className="scr-dl-path">{row.destination}</span>
                  {row.error && <span className="scr-dl-error">{row.error}</span>}
                  {removingId === row.id && (
                    <TransferRemoveConfirm
                      name={row.title}
                      busy={busy}
                      onConfirm={(deleteFiles) => void act(row, 'delete', deleteFiles)}
                      onCancel={() => setRemovingId(null)}
                    />
                  )}
                </div>
                <div className="scr-dl-meta">
                  <Pill tone={DOWNLOAD_TONE[row.state]}>{sx(DOWNLOAD_STATE_KEY[row.state])}</Pill>
                  <span className="scr-t-num">
                    {formatBytes(row.receivedBytes)} / {formatBytes(row.totalBytes)}
                  </span>
                  <span className="scr-t-num">
                    {row.speedBps ? `${formatBytes(row.speedBps)}/s` : '—'}
                  </span>
                  <span className="scr-t-num">
                    {row.etaSec === null ? '—' : formatEtaClock(row.etaSec)}
                  </span>
                </div>
                <div className="scr-dl-actions">
                  <IconButton
                    label={sxs(paused ? 'downloads.resumeItem' : 'downloads.pauseItem', row.title)}
                    size="sm"
                    disabled={busy || (row.state !== 'downloading' && row.state !== 'queued' && !paused)}
                    onClick={() => void act(row, paused ? 'resume' : 'pause')}
                  >
                    <Icon name={paused ? 'player' : 'pause'} size={13} />
                  </IconButton>
                  <IconButton
                    label={sxs('downloads.retryItem', row.title)}
                    size="sm"
                    disabled={busy || (row.state !== 'failed' && !paused)}
                    onClick={() => void act(row, 'retry')}
                  >
                    <Icon name="refresh" size={13} />
                  </IconButton>
                  <IconButton
                    label={sxs('downloads.removeItem', row.title)}
                    size="sm"
                    disabled={busy}
                    onClick={() => setRemovingId(row.id)}
                  >
                    <Icon name="close" size={13} />
                  </IconButton>
                </div>
              </li>
            );
          })}
          {!rows.length && <p className="scr-muted">{sx('downloads.empty')}</p>}
        </ul>
      </ScrCard>

      <ScrCard
        id="external-player"
        title={sx('downloads.player')}
        description={sx('downloads.playerDesc')}
        statusId="page.downloads"
      >
        <div className="scr-player-handoff">
          <span className="scr-t-thumb scr-dl-thumb" aria-hidden>
            {playRow
              ? <img src={scraperArtwork(Math.max(0, rows.indexOf(playRow)))} alt="" />
              : <Icon name="player" size={18} />}
          </span>
          <div>
            <span className="scr-micro-label">{sx('downloads.readyToPlay')}</span>
            {completed.length > 1 ? (
              <select
                className="scr-input"
                aria-label={sx('downloads.readyToPlay')}
                value={playRow?.id ?? ''}
                onChange={(event) => setPlayId(event.target.value)}
              >
                {completed.map((row) => (
                  <option key={row.id} value={row.id}>{row.title}</option>
                ))}
              </select>
            ) : (
              <strong>{playRow?.title ?? sx('downloads.noCompleted')}</strong>
            )}
            <small>{playRow ? (playRow.contentPath || playRow.destination) : sx('downloads.playerHint')}</small>
          </div>
          <label className="scr-result-inline-filter">
            <span>{sx('downloads.playerLabel')}</span>
            <select
              className="scr-input"
              value={playerId}
              disabled={!players.profiles.length}
              onChange={(event) => setPlayerId(event.target.value)}
            >
              {!players.profiles.length && <option value="">{sx('downloads.noPlayerOption')}</option>}
              {players.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Icon name="player" size={13} />}
            disabled={!!whyPlay}
            title={whyPlay}
            onClick={() => void playInPlayer()}
          >
            {sx('downloads.play')}
          </Button>
        </div>
        {playerNotice && (
          <p className={`scr-action-notice${playerNotice.bad ? ' is-bad' : ''}`} role="status">{playerNotice.text}</p>
        )}
      </ScrCard>
    </div>
  );
}

// ---------------------------------------------------------------- exports ---

export function ExportsPage() {
  const ctl = useScraper();
  const port = useScraperPort();
  const [records, setRecords] = useState<ExportRecord[]>([]);
  // Format and template ARE the profile's Export group — one source of truth.
  // The page used to keep its own two copies, so the drawer's settings changed
  // nothing a user could export.
  const [doc, setDoc] = useState(() => loadScraperSettingsDocument());
  useEffect(() => onScraperSettingsChanged(setDoc), []);
  const exportSettings = useMemo(() => resolveScraperSettings(doc).export, [doc]);
  const format = exportSettings.format;
  const template = exportSettings.filenameTemplate;
  const setFormat = (next: ScraperExportFormat) =>
    setDoc(updateActiveScraperSettings({ export: { format: next } }));
  const setTemplate = (next: string) =>
    setDoc(updateActiveScraperSettings({ export: { filenameTemplate: next } }));
  const [scope, setScope] = useState('all');
  const [notice, setNotice] = useState('');

  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [source, setSource] = useState<{ jobId: string; title: string } | null>(null);

  useEffect(() => {
    void port.listExports().then(setRecords, () => undefined);
  }, [port]);

  // Export what was actually scraped. The newest finished job is the one the
  // user just ran, so that is what the builder is pointed at. Sample rows are
  // only for a window with no backend at all: a live profile that has never
  // run anything has nothing to export, and says so.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const jobs = await port.listJobs();
        const newest = jobs[0];
        if (newest) {
          const result = await port.getResult(newest.id);
          if (alive && result?.episodes.length) {
            setRows(result.episodes);
            setSource({ jobId: newest.id, title: newest.titleEn });
            return;
          }
        }
      } catch {
        /* nothing exportable */
      }
      const live = (await port.backendCapabilities().catch(() => [])).length > 0;
      if (alive) setRows(live ? [] : episodes());
    })();
    return () => {
      alive = false;
    };
  }, [port]);
  const scoped = useMemo(() => {
    switch (scope) {
      case 'failed':
        return rows.filter((r) => r.status !== 'ok');
      case 'missing-subs':
        return rows.filter((r) => !r.subtitles.some((s) => s.language === 'ja'));
      default:
        return rows;
    }
  }, [rows, scope]);

  // The series the template expands to, taken from the rows being exported
  // rather than from a hard-coded example.
  const fileStem = exportFileStem(template, source?.title || rows[0]?.seriesId || '');

  // A live preview of the name is the cheapest way to catch a template mistake
  // before it writes a thousand files with the wrong one.
  const previewPath = `${fileStem}.${exportExtension(format)}`;

  const samplePreview = useMemo(
    () => (scoped[0] ? buildEpisodeExport([scoped[0]], exportSettings).content.slice(0, 1_200) : ''),
    [scoped, exportSettings],
  );

  const createExport = async () => {
    if (!scoped.length) return;
    const output = buildEpisodeExport(scoped, exportSettings);
    let created: ExportRecord | null;
    try {
      created = await port.writeExport({
        jobId: source?.jobId ?? '',
        format,
        content: output.content,
        defaultName: `${fileStem}.${output.extension}`,
        recordCount: scoped.length,
        openAfter: exportSettings.openAfterExport,
      });
    } catch (error) {
      setNotice(sxs('export.failed', errorText(error)));
      return;
    }
    if (!created) {
      setNotice(sx('export.cancelled'));
      return;
    }
    const record = created;
    setRecords((current) => [record, ...current]);
    setNotice(
      created.outcome === 'ok'
        ? sxs('export.written', `${created.destination} · ${sxNumber(scoped.length)}`)
        : sxs('export.failed', created.note),
    );
  };

  return (
    <div className="scr-page">
      <PageHead titleKey="page.exports.title" subKey="page.exports.subtitle" statusId="page.exports" />

      <div className="scr-export-format-strip" aria-label={sx('exports.formatsLabel')}>
        {SCRAPER_EXPORT_FORMATS.map((candidate) => (
          <button
            type="button"
            key={candidate}
            className={candidate === format ? 'is-active' : ''}
            aria-pressed={candidate === format}
            onClick={() => setFormat(candidate)}
          >
            <Icon name={candidate === 'm3u' ? 'player' : candidate === 'torrent-list' ? 'download' : 'file'} size={16} />
            <span>
              <b>{candidate.toUpperCase()}</b>
              <small>{sx(`exports.formatHint.${candidate}` as ScraperTextKey)}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{sx('exports.tile.available')}</span><span className="scr-tile-value">{sxNumber(rows.length)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('exports.tile.scope')}</span><span className="scr-tile-value">{sxNumber(scoped.length)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('exports.tile.past')}</span><span className="scr-tile-value">{sxNumber(records.length)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('exports.tile.format')}</span><span className="scr-tile-value scr-tile-value--format">{format.toUpperCase()}</span></div>
      </div>

      <div className="scr-grid">
        <ScrCard
          id="export-builder"
          title={sx('exports.builder')}
          description={sx('exports.builderDesc')}
          statusId="set.export"
          className="scr-card--wide"
        >
          <div className="scr-export-grid">
            <div>
              <label className="scr-micro-label" htmlFor="exp-format">{sx('exports.format')}</label>
              <Select
                id="exp-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ScraperExportFormat)}
                options={SCRAPER_EXPORT_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="scr-micro-label" htmlFor="exp-scope">{sx('exports.scope')}</label>
              <Select
                id="exp-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                options={[
                  { value: 'all', label: sx('exports.scopeAll') },
                  { value: 'failed', label: sx('exports.scopeFailed') },
                  { value: 'missing-subs', label: sx('exports.scopeMissingSubs') },
                ]}
              />
            </div>
            <div className="scr-export-template">
              <label className="scr-micro-label" htmlFor="exp-template">{sx('exports.template')}</label>
              <input
                id="exp-template"
                type="text"
                className="scr-input"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
            </div>
          </div>

          {/* The rest of the Export group, stated where it takes effect. Edited
              in one place — the drawer — so there is no second copy to drift. */}
          <ul className="scr-export-options" aria-label={sx('exports.editOptions')}>
            <li>{sxs('exports.optColumns', exportColumns(exportSettings).join(', '))}</li>
            <li>{sx(exportSettings.splitBySeason ? 'exports.optSplitOn' : 'exports.optSplitOff')}</li>
            {format === 'json' && (
              <li>{sx(exportSettings.prettyPrint ? 'exports.optPrettyOn' : 'exports.optPrettyOff')}</li>
            )}
            <li>
              {exportSettings.destinationRef.trim()
                ? sxs('exports.optDestination', exportSettings.destinationRef.trim())
                : sx('exports.optDestinationDefault')}
            </li>
            <li>{sx(exportSettings.openAfterExport ? 'exports.optRevealOn' : 'exports.optRevealOff')}</li>
            <li>
              <Button size="sm" variant="ghost" onClick={() => ctl.openDrawer('export')}>
                {sx('exports.editOptions')}
              </Button>
            </li>
          </ul>

          <div className="scr-export-preview">
            <span className="scr-muted">{sx('exports.willWrite')}</span>
            <code>{previewPath}</code>
            <span className="scr-muted">{sxn('exports.recordCount', scoped.length)}</span>
          </div>

          {/* The first row exactly as the builder will write it, so the
              drawer's columns, split and indentation are visible here. */}
          {samplePreview && <pre className="scr-export-sample">{samplePreview}</pre>}
          {!rows.length && <p className="scr-muted">{sx('exports.nothingScraped')}</p>}

          <div className="scr-export-action">
            <Button variant="primary" size="sm" disabled={!scoped.length} onClick={() => void createExport()}>
              {sx('exports.run')}
            </Button>
            {notice && <span className="scr-muted" role="status">{notice}</span>}
          </div>
        </ScrCard>

        <ScrCard
          id="export-history"
          title={sx('exports.history')}
          statusId="page.exports"
          className="scr-card--wide"
        >
          <ul className="scr-list">
            {records.map((record) => (
              <li key={record.id} className="scr-list-row">
                <span
                  className={`scr-outcome scr-outcome--${
                    record.outcome === 'ok' ? 'done' : record.outcome === 'partial' ? 'warning' : 'failed'
                  }`}
                  aria-label={record.outcome}
                />
                <span className="scr-list-main">
                  <span className="scr-list-title">{record.destination}</span>
                  {record.note && <span className="scr-list-sub">{record.note}</span>}
                </span>
                <Pill tone="outline">{record.format}</Pill>
                <span className="scr-list-cell">{sxn('exports.recordCount', record.records)}</span>
                <span className="scr-list-cell scr-muted">{formatAgeMinutes(record.ageMinutes)}</span>
              </li>
            ))}
          </ul>
        </ScrCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- history ---

const STAGE_OUTCOME: Record<string, 'done' | 'warning' | 'failed' | 'cancelled'> = {
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function HistoryPage() {
  const ctl = useScraper();
  const port = useScraperPort();
  const [jobs, setJobs] = useState<ScrapeJobSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    void port.listJobs().then(setJobs, () => undefined);
  }, [port]);

  const visible = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'problems') return jobs.filter((j) => j.failed > 0 || j.stage !== 'done');
    return jobs.filter((j) => j.stage === 'done' && j.failed === 0);
  }, [jobs, filter]);

  const open = jobs.find((j) => j.id === openId) ?? null;
  const totals = useMemo(
    () => ({
      episodes: jobs.reduce((sum, job) => sum + job.found, 0),
      failures: jobs.reduce((sum, job) => sum + job.failed, 0),
      bytes: jobs.reduce((sum, job) => sum + job.bytes, 0),
      average: jobs.length
        ? Math.round(jobs.reduce((sum, job) => sum + job.durationSec, 0) / jobs.length)
        : 0,
    }),
    [jobs],
  );
  const activity = useMemo(() => {
    const recent = jobs.slice(0, 7).reverse();
    const max = Math.max(1, ...recent.map((job) => job.found));
    return recent.map((job) => ({
      ...job,
      height: Math.max(12, Math.round((job.found / max) * 100)),
    }));
  }, [jobs]);

  const repeatJob = (job: ScrapeJobSummary) => {
    ctl.setTargetUrl(job.titleEn);
    ctl.navigate('new-scrape');
  };

  return (
    <div className="scr-page">
      <PageHead titleKey="page.history.title" subKey="page.history.subtitle" statusId="page.history" />

      <div className="scr-history-overview">
        <div className="scr-tile-row">
          <div className="scr-tile"><span className="scr-tile-label">Episodes found</span><span className="scr-tile-value">{totals.episodes.toLocaleString()}</span></div>
          <div className={`scr-tile${totals.failures ? ' is-bad' : ''}`}><span className="scr-tile-label">Failed checks</span><span className="scr-tile-value">{sxNumber(totals.failures)}</span></div>
          <div className="scr-tile"><span className="scr-tile-label">Data indexed</span><span className="scr-tile-value scr-tile-value--text">{formatBytes(totals.bytes)}</span></div>
          <div className="scr-tile"><span className="scr-tile-label">Average runtime</span><span className="scr-tile-value scr-tile-value--text">{formatDuration(totals.average)}</span></div>
        </div>
        <div className="scr-history-activity" aria-label="Recent scrape activity">
          <span className="scr-history-activity-label">Recent activity<small>Episodes found per run</small></span>
          <div className="scr-history-bars">
            {activity.map((job) => (
              <span key={job.id} title={`${job.titleEn}: ${job.found} episodes`}>
                <i style={{ height: `${job.height}%` }} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="scr-chip-row">
        {[
          { id: 'all', label: sx('history.all'), count: jobs.length },
          { id: 'problems', label: sx('history.problems'), count: jobs.filter((j) => j.failed > 0 || j.stage !== 'done').length },
          { id: 'clean', label: sx('history.clean'), count: jobs.filter((j) => j.stage === 'done' && j.failed === 0).length },
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`scr-chip${filter === chip.id ? ' is-on' : ''}`}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
            <span className="scr-chip-count">{chip.count}</span>
          </button>
        ))}
      </div>

      <ScrCard id="history-list" title={sx('history.jobs')} statusId="page.history">
        <div className="scr-table" role="table" aria-rowcount={visible.length + 1}>
          <div className="scr-thead" role="row" aria-rowindex={1} style={{ gridTemplateColumns: HISTORY_TEMPLATE }}>
            {[
              '', sx('history.col.series'), sx('history.col.provider'), sx('history.col.profile'),
              sx('history.col.found'), sx('history.col.failed'), sx('history.col.size'),
              sx('history.col.duration'), sx('history.col.when'), '',
            ].map((label, i) => (
              <div key={`${label}-${i}`} role="columnheader" className="scr-th">{label}</div>
            ))}
          </div>
          <div className="scr-tbody scr-tbody--history">
            <VirtualList
              items={visible}
              itemHeight={54}
              getKey={(j) => j.id}
              gridRole="rowgroup"
              emptyState={<p className="scr-table-empty">{sx('history.empty')}</p>}
              renderItem={(job, index) => (
                <div role="row" aria-rowindex={index + 2} className="scr-row" style={{ gridTemplateColumns: HISTORY_TEMPLATE }}>
                  <div role="gridcell" className="scr-td scr-td--center">
                    <span
                      className={`scr-outcome scr-outcome--${
                        job.failed > 0 && job.stage === 'done' ? 'warning' : STAGE_OUTCOME[job.stage] ?? 'done'
                      }`}
                      aria-label={job.stage}
                    />
                  </div>
                  <div role="gridcell" className="scr-td">
                    <span className="scr-t-titles">
                      <span className="scr-t-en">{job.titleEn}</span>
                      <span className="scr-t-ja">{job.titleJa}</span>
                    </span>
                  </div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-plain">{job.provider}</span></div>
                  <div role="gridcell" className="scr-td"><Pill tone="outline">{job.profile}</Pill></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{job.found.toLocaleString()}</span></div>
                  <div role="gridcell" className="scr-td">
                    <span className={`scr-t-num${job.failed ? ' scr-seed is-low' : ''}`}>{sxNumber(job.failed)}</span>
                  </div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{formatBytes(job.bytes)}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{formatDuration(job.durationSec)}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-plain scr-muted">{formatAgeMinutes(job.ageMinutes)}</span></div>
                  <div role="gridcell" className="scr-td scr-td--center">
                    <IconButton label={`Details for ${job.titleEn}`} size="sm" onClick={() => setOpenId(job.id)}>
                      <Icon name="chevron" size={12} />
                    </IconButton>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </ScrCard>

      {open && (
        <ScrCard
          id="history-detail"
          title={open.titleEn}
          description={open.note || sx('history.noNote')}
          statusId="page.history"
          trailing={
            <div className="scr-page-actions">
              <Button size="sm" onClick={() => repeatJob(open)}>{sx('history.repeat')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>{sx('common.close')}</Button>
            </div>
          }
        >
          {/* Per-stage timings are what turn "it was slow" into "the mirror
              checks were slow", which is the only version you can act on.
              They are the engine's measured transitions; a run recorded
              before those existed says so instead of showing a made-up split. */}
          {open.stageTimings?.length ? (
            <div className="scr-stages">
              {stageBreakdown(open.stageTimings).map((stage, index) => (
                <div key={`${stage.stage}-${index}`} className="scr-stage">
                  <span className="scr-stage-label">{sx(`job.${stage.stage}` as ScraperTextKey)}</span>
                  <div className="scr-stage-bar">
                    <span style={{ width: `${stage.percent}%` }} />
                  </div>
                  <span className="scr-t-num">{formatStageMs(stage.ms)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="scr-muted">{sx('history.noStageTimings')}</p>
          )}
        </ScrCard>
      )}
    </div>
  );
}

const HISTORY_TEMPLATE =
  '28px minmax(180px, 2fr) 104px 104px 84px 72px 96px 92px 92px 44px';

/** Each measured stage as a share of the measured total. */
export function stageBreakdown(timings: readonly ScrapeStageTiming[]) {
  const total = timings.reduce((sum, stage) => sum + Math.max(0, stage.ms), 0);
  return timings.map((stage) => ({
    stage: stage.stage,
    ms: Math.max(0, stage.ms),
    percent: total ? Math.round((Math.max(0, stage.ms) / total) * 100) : 0,
  }));
}

/** Sub-second stages are the common case, so they keep their milliseconds. */
function formatStageMs(ms: number): string {
  return ms < 1_000 ? `${sxNumber(ms)} ms` : formatDuration(Math.round(ms / 1_000));
}
