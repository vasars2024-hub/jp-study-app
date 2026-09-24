// The result tabs other than Episodes: Details, Streams, Torrents, Images,
// Metadata and Logs. Each is a real, populated view — none is a placeholder.

import { useMemo, useState } from 'react';
import Icon from '../../Icons';
import { Button } from '../../ui';
import VirtualList from '../../VirtualList';
import VirtualGrid from '../../VirtualGrid';
import { Pill } from './Pill';
import { formatBytes } from '../../../../shared/assetRegistry';
import { formatDuration } from '../../../stats';
import { formatEtaClock } from '../data/charts';
import {
  filterImageRows,
  imageDownloadFilename,
  summarizeImageRows,
  type ImageKindFilter,
} from '../data/imageWorkspace';
import type {
  EpisodeRow,
  ImageRow,
  LogLine,
  SeriesMetadata,
  StreamRow,
  TorrentRow,
} from '../../../../shared/scraperResults';
import { sx, sx3, sxn, sxs } from '../strings';
import { useScraperPort } from '../data/scraperPort';
import { getActiveScraperSettings } from '../../../scraperSettingsStore';
import { SCRAPER_POSTER, scraperArtwork } from '../artwork';
import { openMediaWorkspace, reachMediaWorkspace } from '../../../mediaWorkspaceBridge';

function downloadText(filename: string, content: string, type = 'text/plain') {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

// ---------------------------------------------------------------- details ---

export function DetailsPanel({
  metadata,
  episodes,
}: {
  metadata: SeriesMetadata;
  episodes: EpisodeRow[];
}) {
  const stats = useMemo(() => {
    const withSubs = episodes.filter((e) => e.subtitles.length > 0).length;
    const withJa = episodes.filter((e) => e.subtitles.some((s) => s.language === 'ja')).length;
    const failed = episodes.filter((e) => e.status === 'failed').length;
    const bytes = episodes.reduce((n, e) => n + e.sizeBytes, 0);
    const seconds = episodes.reduce((n, e) => n + e.durationSec, 0);
    return { withSubs, withJa, failed, bytes, seconds };
  }, [episodes]);

  const gap = metadata.episodeCount - episodes.length;

  return (
    <div className="scr-panel scr-panel--details">
      <div className="scr-detail-head">
        <img className="scr-detail-poster" src={SCRAPER_POSTER} alt="" />
        <div className="scr-detail-titles">
          <h3>{metadata.titleEn}</h3>
          <p className="scr-muted">{metadata.titleJa}</p>
          <div className="scr-detail-pills">
            <Pill>{metadata.format}</Pill>
            <Pill tone="outline">{metadata.season}</Pill>
            <Pill tone={metadata.status === 'Airing' ? 'good' : 'neutral'}>{metadata.status}</Pill>
            <Pill tone="outline">{metadata.contentRating}</Pill>
          </div>
          <p className="scr-detail-synopsis">{metadata.synopsis}</p>
        </div>
      </div>

      <div className="scr-tile-row">
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('result.detail.found')}</span>
          <span className="scr-tile-value">{episodes.length.toLocaleString()}</span>
        </div>
        <div className={`scr-tile${gap > 0 ? ' is-warn' : ''}`}>
          <span className="scr-tile-label">{sx('result.detail.expected')}</span>
          <span className="scr-tile-value">{metadata.episodeCount.toLocaleString()}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('result.detail.japaneseSubs')}</span>
          <span className="scr-tile-value">{stats.withJa.toLocaleString()}</span>
        </div>
        <div className={`scr-tile${stats.failed ? ' is-bad' : ''}`}>
          <span className="scr-tile-label">{sx('result.detail.failed')}</span>
          <span className="scr-tile-value">{stats.failed}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('result.detail.totalSize')}</span>
          <span className="scr-tile-value">{formatBytes(stats.bytes)}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('result.detail.runtime')}</span>
          <span className="scr-tile-value">{formatDuration(stats.seconds)}</span>
        </div>
      </div>

      <dl className="scr-kv">
        <div><dt>{sx('result.detail.studios')}</dt><dd>{metadata.studios.join(', ')}</dd></div>
        <div><dt>{sx('result.detail.genres')}</dt><dd>{metadata.genres.join(', ')}</dd></div>
        <div><dt>{sx('result.detail.opening')}</dt><dd>{metadata.openingTheme}</dd></div>
        <div><dt>{sx('result.detail.ending')}</dt><dd>{metadata.endingTheme}</dd></div>
        <div><dt>{sx('result.detail.rating')}</dt><dd>{metadata.communityRating} / 10</dd></div>
        <div><dt>{sx('result.detail.site')}</dt><dd>{metadata.officialSite}</dd></div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- streams ---

export function StreamTable({
  streams,
  onPlay,
}: {
  streams: StreamRow[];
  /** Async because the handler has to ask main whether a player exists at all. */
  onPlay?: (stream: StreamRow) => void | Promise<void>;
}) {
  const template = `1fr 96px 84px 84px 108px 96px 92px 96px${onPlay ? ' 72px' : ''}`;
  return (
    <div className="scr-table" role="table" aria-rowcount={streams.length + 1}>
      <div className="scr-thead" role="row" aria-rowindex={1} style={{ gridTemplateColumns: template }}>
        {[
          sx('result.col.source'), sx('result.col.resolution'), sx('result.col.codec'),
          sx('result.col.container'), sx('result.col.bitrate'), sx('result.col.latency'),
          sx('result.col.health'), sx('result.col.expires'), ...(onPlay ? [''] : []),
        ].map((label) => (
          <div key={label} role="columnheader" className="scr-th">{label}</div>
        ))}
      </div>
      <div className="scr-tbody">
        <VirtualList
          items={streams}
          itemHeight={40}
          getKey={(s) => s.id}
          gridRole="rowgroup"
          emptyState={<p className="scr-table-empty">{sx('result.emptyStreams')}</p>}
          renderItem={(stream, index) => (
            <div role="row" aria-rowindex={index + 2} className="scr-row" style={{ gridTemplateColumns: template }}>
              <div role="gridcell" className="scr-td">{stream.sourceLabel}</div>
              <div role="gridcell" className="scr-td"><Pill tone="outline">{stream.resolution}</Pill></div>
              <div role="gridcell" className="scr-td"><span className="scr-t-plain">{stream.codec}</span></div>
              <div role="gridcell" className="scr-td"><span className="scr-t-plain">{stream.container}</span></div>
              <div role="gridcell" className="scr-td"><span className="scr-t-num">{stream.bitrateKbps.toLocaleString()} kbps</span></div>
              <div role="gridcell" className="scr-td"><span className="scr-t-num">{stream.latencyMs} ms</span></div>
              <div role="gridcell" className="scr-td">
                <Pill tone={stream.health === 'ok' ? 'good' : stream.health === 'degraded' ? 'warn' : 'bad'}>
                  {stream.health}
                </Pill>
              </div>
              <div role="gridcell" className="scr-td">
                {/* Signed URLs die quietly; showing the countdown is what stops
                    the UI handing over a link that expired ten minutes ago. */}
                <span className="scr-t-plain">
                  {stream.expiresInSec === null ? '—' : formatEtaClock(stream.expiresInSec)}
                </span>
              </div>
              {onPlay && (
                <div role="gridcell" className="scr-td">
                  <Button
                    size="sm"
                    disabled={!stream.playback || stream.playback.refreshRequired}
                    onClick={() => { void onPlay(stream); }}
                  >
                    Play
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      </div>
    </div>
  );
}

export function StreamResultPanel({
  streams,
  episodes = [],
  metadata,
}: {
  streams: StreamRow[];
  episodes?: EpisodeRow[];
  metadata?: SeriesMetadata;
}) {
  const [health, setHealth] = useState<'all' | StreamRow['health']>('all');
  const [resolution, setResolution] = useState('all');
  const [notice, setNotice] = useState('');
  const resolutions = useMemo(
    () => [...new Set(streams.map((stream) => stream.resolution))].sort().reverse(),
    [streams],
  );
  const visible = useMemo(
    () =>
      streams.filter(
        (stream) =>
          (health === 'all' || stream.health === health)
          && (resolution === 'all' || stream.resolution === resolution),
      ),
    [streams, health, resolution],
  );
  const healthy = streams.filter((stream) => stream.health === 'ok').length;
  const expiring = streams.filter(
    (stream) => stream.expiresInSec !== null && stream.expiresInSec < 1_800,
  ).length;
  const averageLatency = streams.length
    ? Math.round(streams.reduce((sum, stream) => sum + stream.latencyMs, 0) / streams.length)
    : 0;

  const exportPlaylist = () => {
    if (!visible.length) return;
    const lines = ['#EXTM3U'];
    for (const stream of visible) {
      lines.push(
        `#EXTINF:-1 group-title="${stream.sourceLabel}",${stream.resolution} · ${stream.codec}`,
        stream.url,
      );
    }
    downloadText('anime-streams.m3u', lines.join('\n'), 'audio/x-mpegurl');
    setNotice(`Exported ${visible.length} stream links to an M3U playlist.`);
  };

  /**
   * Hand a resolved mirror to the adopted media workspace — slice 14's gate, applied to
   * the one caller slice 19 missed.
   *
   * These panels are not desktop-only: a scrape result can be opened in a **pop-out**,
   * which mounts `CommandPalette` but no `MediaWorkspaceHost`. `openMediaWorkspace`
   * dispatches a window event, so in that shell the click went nowhere and said nothing.
   *
   * `reachMediaWorkspace` answers the window question before the machine question and
   * short-circuits — see its doc comment. The two declines get different sentences on
   * purpose: one is a fact about *this window*, the other about the machine, and reporting
   * the first as the second is what told users the media server was off while it was running.
   */
  const play = async (stream: StreamRow) => {
    const playback = stream.playback;
    const episode = episodes.find((candidate) => candidate.id === stream.episodeId);
    if (!playback || playback.refreshRequired || !episode) {
      setNotice(sx('result.play.refresh'));
      return;
    }
    const reach = await reachMediaWorkspace();
    if (reach === 'no-host') {
      setNotice(sx('result.play.noPlayerHere'));
      return;
    }
    if (reach === 'unavailable') {
      setNotice(sx('result.play.serverOff'));
      return;
    }
    openMediaWorkspace({
      stream: {
        streamId: stream.id,
        episodeId: stream.episodeId,
        episodeNumber: episode.number,
        episodeTitle: episode.titleEn || episode.titleJa || episode.numberLabel,
        seriesTitle: metadata?.titleEn || metadata?.titleRomaji || metadata?.titleJa || '',
        aniListId: metadata?.aniListId ?? null,
        resolution: stream.resolution,
        playback,
      },
    });
    setNotice(sxn('result.play.opening', episode.number));
  };

  return (
    <div className="scr-panel scr-result-workspace">
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Mirrors</span><span className="scr-tile-value">{streams.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Healthy</span><span className="scr-tile-value">{healthy}</span></div>
        <div className={`scr-tile${expiring ? ' is-warn' : ''}`}><span className="scr-tile-label">Expiring soon</span><span className="scr-tile-value">{expiring}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Average latency</span><span className="scr-tile-value scr-tile-value--text">{averageLatency} ms</span></div>
      </div>
      <div className="scr-result-controls">
        <div className="scr-chip-row" aria-label="Stream health filter">
          {(['all', 'ok', 'degraded', 'dead'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`scr-chip${health === value ? ' is-on' : ''}`}
              onClick={() => setHealth(value)}
            >
              {value === 'all' ? 'All health' : value}
            </button>
          ))}
        </div>
        <label className="scr-result-inline-filter">
          <span>Resolution</span>
          <select className="scr-input" value={resolution} onChange={(event) => setResolution(event.target.value)}>
            <option value="all">All resolutions</option>
            {resolutions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <span className="scr-result-control-spacer" />
        <span className="scr-muted">{visible.length} visible</span>
        <Button size="sm" leftIcon={<Icon name="external" size={13} />} onClick={exportPlaylist} disabled={!visible.length}>
          Export M3U
        </Button>
      </div>
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}
      <StreamTable streams={visible} onPlay={play} />
    </div>
  );
}

// --------------------------------------------------------------- torrents ---

export function TorrentTable({
  torrents,
  selected,
  onToggle,
}: {
  torrents: TorrentRow[];
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const selectable = Boolean(onToggle);
  // The track list lives in `scraper.css` keyed off these classes, never inline: an inline
  // declaration — including an inline custom property — outranks a container query, so a
  // template written here could never reflow. See `.scr-table--torrents`.
  return (
    <div
      className={`scr-table scr-table--torrents${selectable ? ' is-selectable' : ''}`}
      role="table"
      aria-rowcount={torrents.length + 1}
    >
      <div className="scr-thead" role="row" aria-rowindex={1}>
        {selectable && <div role="columnheader" className="scr-th" />}
        {([
          ['name', sx('result.col.name')], ['group', sx('result.col.group')],
          ['resolution', sx('result.col.resolution')], ['seeders', sx('result.col.seeders')],
          ['leechers', sx('result.col.leechers')], ['size', sx('result.col.size')],
          ['age', sx('result.col.age')], ['subs', sx('result.col.subs')],
          ['tracker', sx('result.col.tracker')],
        ] as const).map(([col, label]) => (
          <div key={col} role="columnheader" className="scr-th" data-col={col}>{label}</div>
        ))}
      </div>
      <div className="scr-tbody">
        <VirtualList
          items={torrents}
          itemHeight={44}
          getKey={(t) => t.id}
          gridRole="rowgroup"
          emptyState={<p className="scr-table-empty">{sx('result.emptyTorrents')}</p>}
          renderItem={(row, index) => (
            <div
              role="row"
              aria-rowindex={index + 2}
              className={`scr-row${selected?.has(row.id) ? ' is-selected' : ''}`}
            >
              {selectable && (
                <div role="gridcell" className="scr-td scr-td--center">
                  <input
                    type="checkbox"
                    checked={selected?.has(row.id) ?? false}
                    aria-label={`Select ${row.name}`}
                    onChange={() => onToggle?.(row.id)}
                  />
                </div>
              )}
              <div role="gridcell" className="scr-td" data-col="name">
                <span className="scr-t-titles">
                  <span className="scr-t-en">{row.name}</span>
                  <span className="scr-t-ja">
                    {row.isBatch ? sx('result.batch') : sx('result.single')} · {row.fileCount} files
                  </span>
                  {/* The four columns the narrow tier drops, folded back into the row that
                      lost them. Nothing about this table is reachable anywhere else — there
                      is no per-row inspector here — so hiding a column without this line
                      would delete the value outright. Painted only by the tier. */}
                  <span className="scr-t-fold">
                    {row.releaseGroup} · {row.ageDays}d ·{' '}
                    {row.subtitleLanguages.join(', ').toUpperCase()} · {row.tracker}
                  </span>
                </span>
              </div>
              <div role="gridcell" className="scr-td" data-col="group"><Pill>{row.releaseGroup}</Pill></div>
              <div role="gridcell" className="scr-td" data-col="resolution"><Pill tone="outline">{row.resolution}</Pill></div>
              {/* Seeders drive whether a torrent is usable at all, so the number
                  is toned rather than left as neutral text. */}
              <div role="gridcell" className="scr-td" data-col="seeders">
                <span className={`scr-seed${row.seeders < 3 ? ' is-low' : row.seeders > 200 ? ' is-high' : ''}`}>
                  {row.seeders.toLocaleString()}
                </span>
              </div>
              <div role="gridcell" className="scr-td" data-col="leechers"><span className="scr-t-num">{row.leechers.toLocaleString()}</span></div>
              <div role="gridcell" className="scr-td" data-col="size"><span className="scr-t-num">{formatBytes(row.sizeBytes)}</span></div>
              <div role="gridcell" className="scr-td" data-col="age"><span className="scr-t-num">{row.ageDays}d</span></div>
              <div role="gridcell" className="scr-td" data-col="subs">
                <Pill tone={row.subtitleLanguages.includes('ja') ? 'good' : 'warn'}>
                  {row.subtitleLanguages.join(', ').toUpperCase()}
                </Pill>
              </div>
              <div role="gridcell" className="scr-td" data-col="tracker"><span className="scr-t-plain">{row.tracker}</span></div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

export function TorrentResultPanel({ torrents }: { torrents: TorrentRow[] }) {
  const port = useScraperPort();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolution, setResolution] = useState('all');
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const resolutions = useMemo(
    () => [...new Set(torrents.map((torrent) => torrent.resolution))].sort().reverse(),
    [torrents],
  );
  const visible = useMemo(
    () => torrents.filter((torrent) => resolution === 'all' || torrent.resolution === resolution),
    [torrents, resolution],
  );
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectedRows = torrents.filter((torrent) => selected.has(torrent.id));
  const exportMagnets = () => {
    if (!selectedRows.length) return;
    downloadText(
      'anime-torrents.txt',
      selectedRows.map((torrent) => `${torrent.name}\n${torrent.magnet}`).join('\n\n'),
    );
    setNotice({ text: sxn('result.magnetsExported', selectedRows.length), bad: false });
  };
  // A real send, through the same path as the Torrent Manager's: the notice is
  // qBittorrent's own answer. It used to say "Queued" and send nothing.
  const queueSelected = async () => {
    if (!selectedRows.length) return;
    setSending(true);
    try {
      const report = await port.qbitSend(
        selectedRows,
        getActiveScraperSettings().qbittorrent,
        { via: 'scrape-results' },
      );
      const reasons = report.details
        .filter((detail) => detail.outcome !== 'sent' && detail.reason)
        .map((detail) => detail.reason);
      const summary = sx3('result.sendSummary', report.sent, report.skipped, report.failed);
      setNotice({
        text: reasons.length ? `${summary} ${[...new Set(reasons)].join(' ')}` : summary,
        bad: report.sent === 0,
      });
      if (report.sent > 0) setSelected(new Set());
    } catch (error) {
      setNotice({ text: sxs('transfer.failed', error instanceof Error ? error.message : String(error)), bad: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="scr-panel scr-result-workspace">
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Releases</span><span className="scr-tile-value">{torrents.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Total seeders</span><span className="scr-tile-value">{torrents.reduce((sum, torrent) => sum + torrent.seeders, 0).toLocaleString()}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Batches</span><span className="scr-tile-value">{torrents.filter((torrent) => torrent.isBatch).length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('result.detail.japaneseSubs')}</span><span className="scr-tile-value">{torrents.filter((torrent) => torrent.subtitleLanguages.includes('ja')).length}</span></div>
      </div>
      <div className="scr-result-controls">
        <label className="scr-result-inline-filter">
          <span>Resolution</span>
          <select className="scr-input" value={resolution} onChange={(event) => setResolution(event.target.value)}>
            <option value="all">All resolutions</option>
            {resolutions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelected(new Set(visible.map((torrent) => torrent.id)))}
          disabled={!visible.length}
        >
          Select visible
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={!selected.size}>
          Clear
        </Button>
        <span className="scr-result-control-spacer" />
        <span className="scr-muted">{selected.size} selected</span>
        <Button size="sm" onClick={exportMagnets} disabled={!selected.size}>Export magnets</Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void queueSelected()}
          disabled={!selected.size || sending}
        >
          {sx(sending ? 'result.sending' : 'result.sendSelected')}
        </Button>
      </div>
      {notice && (
        <p className={`scr-action-notice${notice.bad ? ' is-bad' : ''}`} role="status">{notice.text}</p>
      )}
      <TorrentTable torrents={visible} selected={selected} onToggle={toggle} />
    </div>
  );
}

// ----------------------------------------------------------------- images ---

export function ImageGrid({ images }: { images: ImageRow[] }) {
  const [kind, setKind] = useState<ImageKindFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(images[0]?.id ?? '');
  const [notice, setNotice] = useState('');
  const summary = useMemo(() => summarizeImageRows(images), [images]);
  const visible = useMemo(
    () => filterImageRows(images, kind, query),
    [images, kind, query],
  );
  const selected = visible.find((image) => image.id === selectedId) ?? visible[0] ?? null;
  const imageSource = (image: ImageRow) =>
    image.url
    || (image.kind === 'poster'
      ? SCRAPER_POSTER
      : scraperArtwork(Number.parseInt(image.id.replace(/\D/g, ''), 10) || 0));

  const copySource = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(imageSource(selected));
      setNotice(`${selected.kind} source copied to the clipboard.`);
    } catch {
      setNotice('Clipboard access is unavailable. Use Download image instead.');
    }
  };

  const downloadImage = () => {
    if (!selected) return;
    const anchor = document.createElement('a');
    anchor.href = imageSource(selected);
    anchor.download = imageDownloadFilename(selected);
    anchor.click();
    setNotice(`${imageDownloadFilename(selected)} prepared for download.`);
  };

  return (
    <div className="scr-panel scr-panel--images scr-result-workspace">
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Images</span><span className="scr-tile-value">{summary.count}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('result.detail.totalSize')}</span><span className="scr-tile-value scr-tile-value--text">{formatBytes(summary.totalBytes)}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Providers</span><span className="scr-tile-value">{summary.sources}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Episode linked</span><span className="scr-tile-value">{summary.episodeLinked}</span></div>
      </div>
      <div className="scr-result-controls">
        <div className="scr-chip-row" aria-label="Image kind filter">
          {(['all', 'poster', 'banner', 'thumbnail', 'still'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`scr-chip${kind === value ? ' is-on' : ''}`}
              onClick={() => setKind(value)}
            >
              {value === 'all' ? 'All images' : value}
            </button>
          ))}
        </div>
        <label className="scr-result-log-search">
          <Icon name="search" size={13} />
          <input
            className="scr-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search images…"
          />
        </label>
        <span className="scr-result-control-spacer" />
        <span className="scr-muted">{visible.length} visible</span>
      </div>
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}
      <div className="scr-image-workspace">
        <div className="scr-image-grid-region">
          <VirtualGrid
            className="scr-image-grid-scroller"
            items={visible}
            minColWidth={170}
            gap={12}
            rowHeight={(colWidth) => Math.round(colWidth * 0.62) + 56}
            getKey={(img) => img.id}
            emptyState={<p className="scr-table-empty">{sx('result.emptyImages')}</p>}
            renderItem={(img) => (
              <figure className={`scr-img-card${selected?.id === img.id ? ' is-selected' : ''}`}>
                <button
                  type="button"
                  className="scr-img-select"
                  aria-label={`Preview ${img.kind} ${img.id}`}
                  aria-pressed={selected?.id === img.id}
                  onClick={() => {
                    setSelectedId(img.id);
                    setNotice('');
                  }}
                >
                  <span className="scr-img-frame">
                    <img src={imageSource(img)} alt={`${img.kind} ${img.id}`} loading="lazy" />
                  </span>
                  <span className="scr-img-caption">
                    <span className="scr-img-kind">{img.kind}</span>
                    <span className="scr-img-meta">
                      {img.width}×{img.height} · {formatBytes(img.sizeBytes)}
                    </span>
                  </span>
                </button>
              </figure>
            )}
          />
        </div>
        {selected && (
          <aside className="scr-image-inspector" aria-label={`Image details for ${selected.id}`}>
            <div className="scr-image-inspector-preview">
              <img src={imageSource(selected)} alt={`${selected.kind} full preview`} />
            </div>
            <div>
              <span className="scr-eyebrow">Selected image</span>
              <h3>{selected.kind} · {selected.id}</h3>
              <p>{selected.sourceLabel}</p>
            </div>
            <dl className="scr-image-inspector-meta">
              <div><dt>Dimensions</dt><dd>{selected.width} × {selected.height}</dd></div>
              <div><dt>Format</dt><dd>{selected.format.toUpperCase()}</dd></div>
              <div><dt>File size</dt><dd>{formatBytes(selected.sizeBytes)}</dd></div>
              <div><dt>Episode</dt><dd>{selected.episodeId ?? 'Series artwork'}</dd></div>
            </dl>
            <div className="scr-image-inspector-actions">
              <Button size="sm" variant="ghost" onClick={() => void copySource()}>
                Copy source
              </Button>
              <Button size="sm" variant="primary" leftIcon={<Icon name="download" size={13} />} onClick={downloadImage}>
                Download image
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- metadata ---

export function MetadataPanel({ metadata }: { metadata: SeriesMetadata }) {
  const [notice, setNotice] = useState('');
  const rows: { label: string; value: string; source: string }[] = [
    { label: sx('result.meta.titleEn'), value: metadata.titleEn, source: metadata.provenance.titleEn ?? '—' },
    { label: sx('result.meta.titleJa'), value: metadata.titleJa, source: metadata.provenance.titleJa ?? '—' },
    { label: sx('result.meta.titleRomaji'), value: metadata.titleRomaji, source: metadata.provenance.titleEn ?? '—' },
    { label: sx('result.meta.format'), value: metadata.format, source: metadata.provenance.episodeCount ?? '—' },
    { label: sx('result.meta.status'), value: metadata.status, source: metadata.provenance.episodeCount ?? '—' },
    { label: sx('result.meta.season'), value: metadata.season, source: metadata.provenance.titleEn ?? '—' },
    { label: sx('result.meta.episodes'), value: String(metadata.episodeCount), source: metadata.provenance.episodeCount ?? '—' },
    { label: sx('result.meta.duration'), value: formatDuration(metadata.averageDurationSec), source: metadata.provenance.episodeCount ?? '—' },
    { label: sx('result.meta.genres'), value: metadata.genres.join(', '), source: metadata.provenance.genres ?? '—' },
    { label: sx('result.meta.studios'), value: metadata.studios.join(', '), source: metadata.provenance.studios ?? '—' },
    { label: sx('result.meta.rating'), value: `${metadata.communityRating} / 10`, source: metadata.provenance.communityRating ?? '—' },
    { label: sx('result.meta.mal'), value: metadata.malId ? `#${metadata.malId}` : '—', source: 'MyAnimeList' },
    { label: sx('result.meta.anilist'), value: metadata.aniListId ? `#${metadata.aniListId}` : '—', source: 'AniList' },
  ];
  const providerCount = new Set(Object.values(metadata.provenance).filter(Boolean)).size;
  const complete = rows.filter((row) => row.value && row.value !== '—').length;
  const exportMetadata = () => {
    downloadText(
      `${metadata.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-metadata.json`,
      JSON.stringify(metadata, null, 2),
      'application/json',
    );
    setNotice('Metadata JSON file created.');
  };
  const copyMetadata = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
      setNotice('Metadata copied to the clipboard.');
    } catch {
      setNotice('Clipboard access is unavailable; use Export JSON instead.');
    }
  };

  return (
    <div className="scr-panel scr-result-workspace">
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Fields present</span><span className="scr-tile-value">{complete}/{rows.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Providers</span><span className="scr-tile-value">{providerCount}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">{sx('result.meta.rating')}</span><span className="scr-tile-value">{metadata.communityRating}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">External IDs</span><span className="scr-tile-value">{Number(Boolean(metadata.malId)) + Number(Boolean(metadata.aniListId))}</span></div>
      </div>
      <div className="scr-result-controls">
        <p className="scr-muted scr-panel-note">{sx('result.meta.provenanceNote')}</p>
        <span className="scr-result-control-spacer" />
        <Button size="sm" variant="ghost" onClick={() => void copyMetadata()}>Copy JSON</Button>
        <Button size="sm" leftIcon={<Icon name="external" size={13} />} onClick={exportMetadata}>{sx('result.exportJson')}</Button>
      </div>
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}
      <div className="scr-table" role="table">
        <div className="scr-thead" role="row" style={{ gridTemplateColumns: '180px 1fr 160px' }}>
          <div role="columnheader" className="scr-th">{sx('result.meta.field')}</div>
          <div role="columnheader" className="scr-th">{sx('result.meta.value')}</div>
          <div role="columnheader" className="scr-th">{sx('result.meta.source')}</div>
        </div>
        <div className="scr-tbody scr-tbody--auto">
          {rows.map((row) => (
            <div key={row.label} role="row" className="scr-row" style={{ gridTemplateColumns: '180px 1fr 160px' }}>
              <div role="gridcell" className="scr-td scr-muted">{row.label}</div>
              <div role="gridcell" className="scr-td">{row.value}</div>
              <div role="gridcell" className="scr-td"><Pill tone="outline">{row.source}</Pill></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- logs ---

export function LogConsole({ logs }: { logs: LogLine[] }) {
  const [level, setLevel] = useState<'all' | LogLine['level']>('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const visible = useMemo(
    () =>
      logs.filter(
        (line) =>
          (level === 'all' || line.level === level)
          && (!query.trim()
            || `${line.channel} ${line.message} ${line.correlationId}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      ),
    [logs, level, query],
  );
  const exportLogs = () => {
    if (!visible.length) return;
    downloadText(
      'anime-scrape.log',
      visible
        .map(
          (line) =>
            `${formatEtaClock(line.offsetMs / 1_000)} ${line.level.toUpperCase().padEnd(5)} ${line.channel.padEnd(12)} ${line.message} [${line.correlationId}]`,
        )
        .join('\n'),
    );
    setNotice(`Exported ${visible.length} log lines.`);
  };

  return (
    <div className="scr-panel scr-panel--logs scr-result-workspace">
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Log lines</span><span className="scr-tile-value">{logs.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Errors</span><span className="scr-tile-value">{logs.filter((line) => line.level === 'error').length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Warnings</span><span className="scr-tile-value">{logs.filter((line) => line.level === 'warn').length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Channels</span><span className="scr-tile-value">{new Set(logs.map((line) => line.channel)).size}</span></div>
      </div>
      <div className="scr-result-controls">
        <div className="scr-chip-row" aria-label="Log level filter">
          {(['all', 'error', 'warn', 'info', 'debug'] as const).map((value) => (
            <button key={value} type="button" className={`scr-chip${level === value ? ' is-on' : ''}`} onClick={() => setLevel(value)}>
              {value}
            </button>
          ))}
        </div>
        <label className="scr-result-log-search">
          <Icon name="search" size={13} />
          <input className="scr-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search logs…" />
        </label>
        <span className="scr-result-control-spacer" />
        <Button size="sm" leftIcon={<Icon name="external" size={13} />} onClick={exportLogs} disabled={!visible.length}>
          Export log
        </Button>
      </div>
      {notice && <p className="scr-action-notice" role="status">{notice}</p>}
      <VirtualList
        items={visible}
        itemHeight={24}
        getKey={(line) => line.id}
        listRole="list"
        itemRole="listitem"
        emptyState={<p className="scr-table-empty">{sx('result.emptyLogs')}</p>}
        renderItem={(line) => (
          <div className={`scr-log scr-log--${line.level}`}>
            <span className="scr-log-time">{formatEtaClock(line.offsetMs / 1_000)}</span>
            <span className="scr-log-level">{line.level}</span>
            <span className="scr-log-channel">{line.channel}</span>
            <span className="scr-log-msg">{line.message}</span>
          </div>
        )}
      />
    </div>
  );
}
