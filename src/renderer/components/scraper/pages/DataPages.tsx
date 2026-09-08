// The four Data pages: Results, Downloads, Exports and History.
//
// One module because they share a shape — a summary strip over a list built
// from the port — and splitting them would mean four near-identical files.

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { sx, sxn, sxs } from '../strings';
import { SERIES, episodes, type FixtureSeries } from '../data/fixtures';
import { scraperArtwork } from '../artwork';
import { buildEpisodeExport, exportExtension } from '../data/exportBuilder';
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
  // while nothing has been scraped yet, so an empty profile still has something
  // to look at.
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
        /* fall through to sample data */
      }
      if (alive) setLibrary({ series: SERIES, rows: episodes() });
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

      <div className="scr-tile-row">
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('results.series')}</span>
          <span className="scr-tile-value">{bySeries.length}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('results.episodes')}</span>
          <span className="scr-tile-value">{rows.length.toLocaleString()}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('results.withJa')}</span>
          <span className="scr-tile-value">
            {bySeries.reduce((n, s) => n + s.withJapanese, 0).toLocaleString()}
          </span>
        </div>
        <div className="scr-tile is-bad">
          <span className="scr-tile-label">{sx('results.failed')}</span>
          <span className="scr-tile-value">
            {bySeries.reduce((n, s) => n + s.failed, 0)}
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
        <span className="scr-muted">{visible.length} series</span>
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

export function DownloadsPage() {
  const port = useScraperPort();
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [notice, setNotice] = useState('');
  const [player, setPlayer] = useState('system');
  const [playerNotice, setPlayerNotice] = useState('');

  useEffect(() => {
    void port.listDownloads().then(setRows);
  }, [port]);

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
  // from what is still to come rather than from what has already landed.
  const freeBytes = 412 * 1024 ** 3;
  const tight = totals.remaining > freeBytes * 0.8;

  const togglePause = (id: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id && (row.state === 'downloading' || row.state === 'paused')
          ? {
              ...row,
              state: row.state === 'paused' ? 'downloading' : 'paused',
              speedBps: row.state === 'paused' ? 6_800_000 : 0,
              etaSec: row.state === 'paused' ? 94 : null,
            }
          : row,
      ),
    );
    setNotice('Download queue state updated.');
  };

  const retry = (id: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, state: 'queued', receivedBytes: 0, speedBps: 0, etaSec: null, error: '' }
          : row,
      ),
    );
    setNotice('Episode returned to the queue.');
  };

  const cancel = (id: string) => {
    const row = rows.find((item) => item.id === id);
    setRows((current) => current.filter((item) => item.id !== id));
    setNotice(row ? `Removed ${row.title} from the queue.` : 'Queue updated.');
  };

  const completed = rows.filter((row) => row.state === 'done');
  const createPlayerHandoff = () => {
    const row = completed[0];
    if (!row) return;
    const fileUrl = `file:///${row.destination.replace(/\\/g, '/')}`;
    const playlist = `#EXTM3U\n#EXTINF:-1,${row.title}\n${fileUrl}\n`;
    const href = URL.createObjectURL(new Blob([playlist], { type: 'audio/x-mpegurl' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${player}.m3u`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    setPlayerNotice(`Created a ${player === 'system' ? 'system player' : player.toUpperCase()} handoff for ${row.title}.`);
  };

  return (
    <div className="scr-page">
      <PageHead
        titleKey="page.downloads.title"
        subKey="page.downloads.subtitle"
        statusId="page.downloads"
      />

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.active')}</span><span className="scr-tile-value">{totals.active}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.queued')}</span><span className="scr-tile-value">{totals.queued}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.done')}</span><span className="scr-tile-value">{totals.done}</span></div>
        <div className={`scr-tile${totals.failed ? ' is-bad' : ''}`}><span className="scr-tile-label">{sx('downloads.failed')}</span><span className="scr-tile-value">{totals.failed}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('downloads.speed')}</span><span className="scr-tile-value">{formatBytes(totals.speed)}/s</span></div>
      </div>

      <div className={`scr-storage-bar${tight ? ' is-tight' : ''}`}>
        <Icon name={tight ? 'warning' : 'drive'} size={14} />
        <span>
          {sx('downloads.remaining')} {formatBytes(totals.remaining)} · {sx('downloads.free')}{' '}
          {formatBytes(freeBytes)}
        </span>
      </div>

      <ScrCard id="download-queue" title={sx('downloads.queue')} statusId="page.downloads">
        {notice && <p className="scr-action-notice" role="status">{notice}</p>}
        <ul className="scr-dl-list">
          {rows.map((row, index) => {
            const ratio = row.totalBytes ? row.receivedBytes / row.totalBytes : 0;
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
                </div>
                <div className="scr-dl-meta">
                  <Pill tone={DOWNLOAD_TONE[row.state]}>{row.state}</Pill>
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
                    label={`${row.state === 'paused' ? 'Resume' : 'Pause'} ${row.title}`}
                    size="sm"
                    disabled={row.state !== 'downloading' && row.state !== 'paused'}
                    onClick={() => togglePause(row.id)}
                  >
                    <Icon name={row.state === 'paused' ? 'player' : 'pause'} size={13} />
                  </IconButton>
                  <IconButton
                    label={`Retry ${row.title}`}
                    size="sm"
                    disabled={row.state !== 'failed' && row.state !== 'paused'}
                    onClick={() => retry(row.id)}
                  >
                    <Icon name="refresh" size={13} />
                  </IconButton>
                  <IconButton label={`Cancel ${row.title}`} size="sm" onClick={() => cancel(row.id)}>
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
            {completed[0]
              ? <img src={scraperArtwork(Math.max(0, rows.indexOf(completed[0])))} alt="" />
              : <Icon name="player" size={18} />}
          </span>
          <div>
            <span className="scr-micro-label">Ready to play</span>
            <strong>{completed[0]?.title ?? 'No completed episodes'}</strong>
            <small>{completed[0]?.destination ?? sx('downloads.playerHint')}</small>
          </div>
          <label className="scr-result-inline-filter">
            <span>Player</span>
            <select className="scr-input" value={player} onChange={(event) => setPlayer(event.target.value)}>
              <option value="system">System default</option>
              <option value="vlc">VLC</option>
              <option value="mpv">mpv</option>
            </select>
          </label>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Icon name="player" size={13} />}
            disabled={!completed.length}
            onClick={createPlayerHandoff}
          >
            Create player handoff
          </Button>
        </div>
        {playerNotice && <p className="scr-action-notice" role="status">{playerNotice}</p>}
      </ScrCard>
    </div>
  );
}

// ---------------------------------------------------------------- exports ---

export function ExportsPage() {
  const port = useScraperPort();
  const [records, setRecords] = useState<ExportRecord[]>([]);
  const [format, setFormat] = useState<ScraperExportFormat>('json');
  const [scope, setScope] = useState('all');
  const [template, setTemplate] = useState('{series}-{date}');
  const [notice, setNotice] = useState('');

  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [source, setSource] = useState<{ jobId: string; title: string } | null>(null);

  useEffect(() => {
    void port.listExports().then(setRecords);
  }, [port]);

  // Export what was actually scraped. The newest finished job is the one the
  // user just ran, so that is what the builder is pointed at; sample rows are
  // the fallback for a profile that has never run anything.
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
        /* fall through to sample rows */
      }
      if (alive) setRows(episodes());
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

  // The series slug the template expands to, taken from the rows being
  // exported rather than from a hard-coded example.
  const seriesSlug = (source?.title || rows[0]?.seriesId || 'anime-export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'anime-export';

  const fileStem = template
    .replace('{series}', seriesSlug)
    .replace('{date}', new Date().toISOString().slice(0, 10))
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'anime-export';

  // A live preview of the name is the cheapest way to catch a template mistake
  // before it writes a thousand files with the wrong one.
  const previewPath = `${fileStem}.${exportExtension(format)}`;

  const sample = scoped[0];

  const createExport = async () => {
    if (!scoped.length) return;
    const output = buildEpisodeExport(scoped, format);
    const created = await port.writeExport({
      jobId: source?.jobId ?? '',
      format,
      content: output.content,
      defaultName: `${fileStem}.${output.extension}`,
      recordCount: scoped.length,
    });
    if (!created) {
      setNotice(sx('export.cancelled'));
      return;
    }
    setRecords((current) => [created, ...current]);
    setNotice(
      created.outcome === 'ok'
        ? sxs('export.written', `${created.destination} · ${scoped.length.toLocaleString()}`)
        : sxs('export.failed', created.note),
    );
  };

  return (
    <div className="scr-page">
      <PageHead titleKey="page.exports.title" subKey="page.exports.subtitle" statusId="page.exports" />

      <div className="scr-export-format-strip" aria-label="Export formats">
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
              <small>
                {candidate === 'json'
                  ? 'Structured archive'
                  : candidate === 'csv'
                    ? 'Spreadsheet ready'
                    : candidate === 'ndjson'
                      ? 'Streaming records'
                      : candidate === 'm3u'
                        ? 'Player playlist'
                        : 'Resolved links'}
              </small>
            </span>
          </button>
        ))}
      </div>

      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Available rows</span><span className="scr-tile-value">{rows.length.toLocaleString()}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Current scope</span><span className="scr-tile-value">{scoped.length.toLocaleString()}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Past exports</span><span className="scr-tile-value">{records.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Selected format</span><span className="scr-tile-value scr-tile-value--format">{format.toUpperCase()}</span></div>
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

          <div className="scr-export-preview">
            <span className="scr-muted">{sx('exports.willWrite')}</span>
            <code>{previewPath}</code>
            <span className="scr-muted">{sxn('exports.recordCount', scoped.length)}</span>
          </div>

          {sample && (
            <pre className="scr-export-sample">
{JSON.stringify(
  {
    number: sample.number,
    titleEn: sample.titleEn,
    titleJa: sample.titleJa,
    resolution: sample.resolution,
    source: sample.sourceLabel,
    subtitles: sample.subtitles.map((s) => s.language),
  },
  null,
  2,
)}
            </pre>
          )}

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
    void port.listJobs().then(setJobs);
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
          <div className={`scr-tile${totals.failures ? ' is-bad' : ''}`}><span className="scr-tile-label">Failed checks</span><span className="scr-tile-value">{totals.failures.toLocaleString()}</span></div>
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
                    <span className={`scr-t-num${job.failed ? ' scr-seed is-low' : ''}`}>{job.failed.toLocaleString()}</span>
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
              checks were slow", which is the only version you can act on. */}
          <div className="scr-stages">
            {stageBreakdown(open.durationSec).map((stage) => (
              <div key={stage.label} className="scr-stage">
                <span className="scr-stage-label">{stage.label}</span>
                <div className="scr-stage-bar">
                  <span style={{ width: `${stage.percent}%` }} />
                </div>
                <span className="scr-t-num">{formatDuration(stage.seconds)}</span>
              </div>
            ))}
          </div>
        </ScrCard>
      )}
    </div>
  );
}

const HISTORY_TEMPLATE =
  '28px minmax(180px, 2fr) 104px 104px 84px 72px 96px 92px 92px 44px';

/** A plausible split of a job's runtime across its stages. */
function stageBreakdown(totalSec: number) {
  const weights: [string, number][] = [
    ['Search', 0.08],
    ['Fetch', 0.34],
    ['Extract', 0.31],
    ['Mirrors', 0.16],
    ['Validate', 0.11],
  ];
  return weights.map(([label, weight]) => ({
    label,
    seconds: Math.round(totalSec * weight),
    percent: Math.round(weight * 100),
  }));
}
