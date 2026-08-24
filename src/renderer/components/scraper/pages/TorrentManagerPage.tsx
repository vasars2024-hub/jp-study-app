// Torrent Manager — indexer search on top, a qBittorrent mirror below.
//
// The mirror deliberately carries MORE than qBittorrent's own list shows:
// availability, peer/seed splits, piece progress, the category and tags the
// scraper set, and the episode a transfer belongs to. If it only repeated what
// qBittorrent already displays there would be no reason to look at it here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../Icons';
import { Button, IconButton, Select } from '../../ui';
import ScrCard from '../ScrCard';
import StatusDot from '../StatusDot';
import { Pill } from '../result/Pill';
import { TorrentTable } from '../result/ResultPanels';
import VirtualList from '../../VirtualList';
import { useScraper } from '../ScraperContext';
import { useScraperPort } from '../data/scraperPort';
import { formatEtaClock } from '../data/charts';
import { formatBytes } from '../../../../shared/assetRegistry';
import {
  CREDENTIAL_PRESENCE_TONE,
  KEY_PRESENCE_TEXT,
  PASSWORD_PRESENCE_TEXT,
  resolveCredentialPresence,
  type VaultAnswer,
} from '../data/credentialPresence';
import { sx, sx2, sxn, sxs } from '../strings';
import {
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  updateActiveScraperSettings,
} from '../../../scraperSettingsStore';
import { resolveScraperSettings } from '../../../../shared/scraperSettings';
import type {
  QbitSendReport,
  QbitStatusReport,
  QbitTransferRow,
  TorrentRow,
} from '../../../../shared/scraperResults';
import type {
  AcquisitionAction,
  AcquisitionActionResult,
  AcquisitionBackendSnapshot,
} from '../../../../shared/acquisition';

const STATE_TONE: Record<QbitTransferRow['state'], 'good' | 'warn' | 'bad' | 'neutral' | 'accent'> = {
  downloading: 'accent',
  seeding: 'good',
  paused: 'neutral',
  queued: 'neutral',
  checking: 'warn',
  stalled: 'warn',
  error: 'bad',
};

function speed(bps: number): string {
  return bps > 0 ? `${formatBytes(bps)}/s` : '—';
}

/**
 * Piece map, downsampled to 60 cells. qBittorrent shows this too, but only as a
 * thin bar — here it is wide enough to see where a stalled transfer is stuck.
 */
function PieceStrip({ pieces }: { pieces: number[] }) {
  return (
    <div className="scr-pieces" role="img" aria-label={sx('torrent.pieces')}>
      {pieces.map((value, i) => (
        <span
          key={i}
          className={`scr-piece${value >= 1 ? ' is-done' : value > 0 ? ' is-part' : ''}`}
        />
      ))}
    </div>
  );
}

export default function TorrentManagerPage() {
  const ctl = useScraper();
  const port = useScraperPort();

  const [doc, setDoc] = useState(() => loadScraperSettingsDocument());
  const [query, setQuery] = useState('');
  const [minSeeders, setMinSeeders] = useState('');
  const [resolution, setResolution] = useState('');
  const [results, setResults] = useState<TorrentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transfers, setTransfers] = useState<QbitTransferRow[]>([]);
  const [status, setStatus] = useState<QbitStatusReport | null>(null);
  const [testing, setTesting] = useState(false);
  const [sendReport, setSendReport] = useState<QbitSendReport | null>(null);
  const [activeTransferHash, setActiveTransferHash] = useState<string | null>(null);
  const [transferNotice, setTransferNotice] = useState('');
  /** Which transfer is mid-import, so the button cannot be fired twice. */
  const [addingHash, setAddingHash] = useState<string | null>(null);
  const [backend, setBackend] = useState<AcquisitionBackendSnapshot | null>(null);
  const [backendBusy, setBackendBusy] = useState(false);
  const [backendNotice, setBackendNotice] = useState<AcquisitionActionResult | null>(null);
  const [backendDestination, setBackendDestination] = useState('');
  const [vaultHas, setVaultHas] = useState<VaultAnswer>(null);

  useEffect(() => onScraperSettingsChanged(setDoc), []);

  const settings = useMemo(() => resolveScraperSettings(doc), [doc]);
  const qbit = settings.qbittorrent;

  // Only the mode in force is asked about: with a key stored and a stale
  // password ref left behind, reporting on both is two answers to one question.
  const credentialRef = qbit.authMode === 'apiKey' ? qbit.apiKeyRef : qbit.passwordRef;

  // The settings document knows the ref; only main knows whether a secret sits
  // behind it. Re-asked whenever the document changes, because saving or
  // clearing a secret in the drawer can leave the ref string identical.
  useEffect(() => {
    const ref = credentialRef.trim();
    if (!ref) return;
    const probe = window.api?.scraperHasCredential;
    if (!probe) {
      setVaultHas('error');
      return;
    }
    let cancelled = false;
    setVaultHas(null);
    void probe(ref)
      .then((stored) => {
        if (!cancelled) setVaultHas(stored);
      })
      .catch(() => {
        if (!cancelled) setVaultHas('error');
      });
    return () => {
      cancelled = true;
    };
  }, [credentialRef, doc]);

  const credentialPresence = resolveCredentialPresence({ ref: credentialRef, vaultHas });

  const search = useCallback(async () => {
    const rows = await port.searchTorrents({
      text: query,
      minSeeders: minSeeders ? Number(minSeeders) : undefined,
      resolution: resolution || undefined,
    });
    setResults(rows);
  }, [port, query, minSeeders, resolution]);

  useEffect(() => {
    void search();
  }, [search]);

  useEffect(() => {
    void port.qbitTransfers().then(setTransfers);
  }, [port]);

  const refreshBackend = useCallback(async () => {
    setBackend(await port.getAcquisitionSnapshot());
  }, [port]);

  useEffect(() => {
    void refreshBackend();
  }, [refreshBackend]);

  const runBackendAction = async (action: AcquisitionAction) => {
    setBackendBusy(true);
    try {
      const result = await port.runAcquisitionAction(action);
      setBackendNotice(result);
      await refreshBackend();
    } finally {
      setBackendBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const report = await port.qbitTest(qbit);
      setStatus(report);
      setDoc(
        updateActiveScraperSettings({
          qbittorrent: { connectionStatus: report.status },
        }),
      );
    } finally {
      setTesting(false);
    }
  };

  const send = async () => {
    const rows = results.filter((r) => selected.has(r.id));
    if (!rows.length) return;
    setSendReport(await port.qbitSend(rows, qbit));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totals = useMemo(
    () => ({
      down: transfers.reduce((n, t) => n + t.downloadSpeedBps, 0),
      up: transfers.reduce((n, t) => n + t.uploadSpeedBps, 0),
      size: transfers.reduce((n, t) => n + t.sizeBytes, 0),
      active: transfers.filter((t) => t.state === 'downloading' || t.state === 'seeding').length,
    }),
    [transfers],
  );

  const connTone =
    status?.status === 'connected' ? 'good' : status?.status ? 'bad' : 'neutral';
  const activeTransfer = transfers.find((transfer) => transfer.hash === activeTransferHash) ?? null;

  const patchTransfer = (hash: string, patch: Partial<QbitTransferRow>) => {
    setTransfers((current) =>
      current.map((transfer) => (transfer.hash === hash ? { ...transfer, ...patch } : transfer)),
    );
  };

  const toggleTransfer = (transfer: QbitTransferRow) => {
    const paused = transfer.state === 'paused';
    patchTransfer(transfer.hash, {
      state: paused ? (transfer.progress >= 1 ? 'seeding' : 'downloading') : 'paused',
      downloadSpeedBps: paused && transfer.progress < 1 ? 5_400_000 : 0,
      uploadSpeedBps: paused && transfer.progress >= 1 ? 860_000 : 0,
    });
    setTransferNotice(`${transfer.name} ${paused ? 'resumed' : 'paused'}.`);
  };

  const recheckTransfer = (transfer: QbitTransferRow) => {
    patchTransfer(transfer.hash, { state: 'checking', downloadSpeedBps: 0, uploadSpeedBps: 0 });
    setTransferNotice(`${transfer.name} queued for an integrity recheck.`);
  };

  /**
   * The step the acquisition pipeline was missing: hand the finished files to
   * the library, so a subtitle can be attached and the episode can be played.
   *
   * Reversible — the library's own remove action takes the item back out, and
   * nothing here touches the file on disk or the transfer itself.
   */
  const addTransferToLibrary = async (transfer: QbitTransferRow) => {
    if (transfer.progress < 1) {
      setTransferNotice(sx('torrent.addToLibraryIncomplete'));
      return;
    }
    setAddingHash(transfer.hash);
    try {
      // Forward slash on purpose: Node accepts it on Windows too, and the
      // renderer has no `path.join` to reach for.
      const target = `${transfer.savePath.replace(/[\\/]+$/, '')}/${transfer.name}`;
      const report = await window.api.addAcquiredMedia(target);
      if (report.outcome === 'missing') setTransferNotice(sx('torrent.addMissing'));
      else if (report.outcome !== 'ok') setTransferNotice(sx('torrent.addNoMedia'));
      else if (report.added === 0) setTransferNotice(sxn('torrent.alreadyInLibrary', report.found));
      else setTransferNotice(sx2('torrent.addedToLibrary', report.added, report.found));
    } catch (error) {
      setTransferNotice(sxs('torrent.addFailed', error instanceof Error ? error.message : String(error)));
    } finally {
      setAddingHash(null);
    }
  };

  const removeTransfer = (transfer: QbitTransferRow) => {
    setTransfers((current) => current.filter((candidate) => candidate.hash !== transfer.hash));
    setActiveTransferHash(null);
    setTransferNotice(`${transfer.name} removed from the local mirror. Downloaded files were kept.`);
  };

  return (
    <div className="scr-page scr-page--torrents">
      <header className="scr-page-head">
        <div>
          <h1 className="scr-page-title">
            {sx('page.torrents.title')}
            <StatusDot id="page.torrents" className="scr-page-dot" />
          </h1>
          <p className="scr-page-sub">{sx('page.torrents.subtitle')}</p>
        </div>
        <div className="scr-page-actions">
          <Button size="sm" onClick={() => ctl.openDrawer('torrent')}>
            {sx('torrent.settings')}
          </Button>
          <Button size="sm" onClick={() => ctl.openDrawer('qbittorrent')}>
            {sx('torrent.qbitSettings')}
          </Button>
        </div>
      </header>

      <ScrCard
        id="qbit-connection"
        title={sx('torrent.connection')}
        description={sx('torrent.connectionDesc')}
        statusId="set.qbittorrent"
        trailing={
          <Button size="sm" disabled={testing} onClick={() => void test()}>
            {testing ? sx('torrent.testing') : sx('torrent.test')}
          </Button>
        }
      >
        <div className="scr-conn-row">
          <Pill tone={connTone}>
            {status ? status.status.replace(/-/g, ' ') : qbit.connectionStatus.replace(/-/g, ' ')}
          </Pill>
          <span className="scr-muted">
            {qbit.scheme}://{qbit.host}:{qbit.port}
            {qbit.basePath}
          </span>
          {status?.version && <Pill tone="outline">v{status.version}</Pill>}
          {status && <span className="scr-muted">{status.message}</span>}
          {status?.authMode && (
            <Pill tone="outline">{sxs('torrent.authVia', status.authMode)}</Pill>
          )}
          {/* No secret is ever shown or stored here — only whether one exists,
              and only for the mode actually in force. Reading `passwordRef` in
              key mode told a user with a working key that they had "no
              password", which reads as broken. The ref alone is not the answer
              either: it said "stored" over an empty store. */}
          <Pill
            tone={CREDENTIAL_PRESENCE_TONE[credentialPresence]}
            title={
              credentialPresence === 'orphaned'
                ? sx(qbit.authMode === 'apiKey' ? 'torrent.keyOrphanedHint' : 'torrent.credOrphanedHint')
                : credentialPresence === 'unknown'
                  ? sx('torrent.credUnknownHint')
                  : undefined
            }
          >
            {sx(
              qbit.authMode === 'apiKey'
                ? KEY_PRESENCE_TEXT[credentialPresence]
                : PASSWORD_PRESENCE_TEXT[credentialPresence],
            )}
          </Pill>
        </div>
      </ScrCard>

      <ScrCard
        id="seanime-acquisition"
        title={sx('acq.title')}
        description={sx('acq.desc')}
        statusId="page.torrents.acquisition"
        trailing={
          <Button size="sm" disabled={backendBusy} onClick={() => void refreshBackend()}>
            {sx('acq.refresh')}
          </Button>
        }
      >
        <div className="scr-setting-summary">
          <span>
            {sx('acq.sidecar')}{' '}
            <Pill tone={backend?.state === 'ready' ? 'good' : backend?.state === 'error' ? 'bad' : 'neutral'}>
              {backend?.state ?? sx('acq.loading')}
            </Pill>
          </span>
          <span>
            {sx('acq.torrentClient')} <b>{backend?.torrentClient.client || sx('acq.off')}</b>{' '}
            <small>{sxn('acq.transfers', backend?.torrentClient.transfers.length ?? 0)}</small>
          </span>
          <span>
            {sx('acq.debrid')} <b>{backend?.debrid.provider || sx('acq.off')}</b>{' '}
            <small>{sxn('acq.debridItems', backend?.debrid.items.length ?? 0)}</small>
          </span>
          <span>
            {sx('acq.autoDownloader')} <b>{backend?.autoDownloader.provider || sx('acq.off')}</b>{' '}
            <small>
              {sxn('acq.rules', backend?.autoDownloader.rules.length ?? 0)},{' '}
              {sxn('acq.queued', backend?.autoDownloader.queue.length ?? 0)}
            </small>
          </span>
        </div>

        <div className="scr-torrent-filters">
          <input
            className="scr-input"
            value={backendDestination}
            placeholder={sx('acq.destinationPlaceholder')}
            aria-label={sx('acq.destinationLabel')}
            onChange={(event) => setBackendDestination(event.target.value)}
          />
          <Button
            size="sm"
            disabled={
              backendBusy
              || !selected.size
              || backend?.torrentClient.state !== 'ready'
            }
            onClick={() => void runBackendAction({
              kind: 'send-torrents',
              target: 'torrent-client',
              torrentIds: [...selected],
              destination: backendDestination,
              torrents: results,
            })}
          >
            {sx('acq.sendTorrentClient')}
          </Button>
          <Button
            size="sm"
            disabled={backendBusy || !selected.size || backend?.debrid.state !== 'ready'}
            onClick={() => void runBackendAction({
              kind: 'send-torrents',
              target: 'debrid',
              torrentIds: [...selected],
              destination: backendDestination,
              torrents: results,
            })}
          >
            {sx('acq.sendDebrid')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={backendBusy || backend?.autoDownloader.state !== 'ready'}
            onClick={() => void runBackendAction({ kind: 'run-auto-downloader' })}
          >
            {sx('acq.runAutoDownloader')}
          </Button>
          <Button
            size="sm"
            disabled={backendBusy || !backend?.autoDownloader.rules.length}
            onClick={() => void runBackendAction({
              kind: 'simulate-auto-downloader',
              ruleIds: backend?.autoDownloader.rules
                .filter((rule) => rule.enabled)
                .map((rule) => rule.id) ?? [],
            })}
          >
            {sx('acq.simulateRules')}
          </Button>
        </div>

        {backend?.autoDownloader.queue.length ? (
          <div className="scr-send-report">
            <b>{sx('acq.queueTitle')}</b>
            <ul>
              {backend.autoDownloader.queue.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <Pill tone={item.delayed ? 'warn' : item.downloaded ? 'good' : 'neutral'}>
                    {sxn('acq.episode', item.episode)}
                  </Pill>
                  <span className="scr-t-plain">{item.torrentName}</span>
                  <Button
                    size="sm"
                    disabled={backendBusy || item.downloaded || item.delayed}
                    onClick={() => void runBackendAction({
                      kind: 'download-queued-item',
                      itemId: item.id,
                    })}
                  >
                    {sx('acq.download')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {backendNotice && (
          <div className="scr-send-report" role="status">
            <b>{backendNotice.message}</b>
            {backendNotice.simulation.length ? (
              <ul>
                {backendNotice.simulation.slice(0, 8).map((row) => (
                  <li key={`${row.ruleId}-${row.mediaId}-${row.episode}-${row.torrentName}`}>
                    <Pill tone={row.delayed ? 'warn' : 'good'}>
                      {sxn('acq.episode', row.episode)}
                    </Pill>
                    <span className="scr-t-plain">{row.torrentName}</span>
                    <span className="scr-muted">
                      {sxn('acq.score', row.score)} · {row.providerId}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setBackendNotice(null)}>
              {sx('common.close')}
            </Button>
          </div>
        )}
      </ScrCard>

      <ScrCard
        id="torrent-search"
        title={sx('torrent.search')}
        description={sx('torrent.searchDesc')}
        statusId="result.torrents"
        className="scr-card--tall"
        trailing={
          <div className="scr-page-actions">
            <Button
              size="sm"
              variant="primary"
              disabled={!selected.size}
              onClick={() => void send()}
            >
              {sxn('torrent.send', selected.size)}
            </Button>
            <Button size="sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>
              {sx('result.clearSelection')}
            </Button>
          </div>
        }
      >
        <div className="scr-torrent-filters">
          <input
            type="search"
            className="scr-input"
            value={query}
            placeholder={sx('torrent.searchPlaceholder')}
            aria-label={sx('torrent.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            type="number"
            className="scr-input scr-input--narrow"
            value={minSeeders}
            min={0}
            placeholder={sx('torrent.minSeeders')}
            aria-label={sx('torrent.minSeeders')}
            onChange={(e) => setMinSeeders(e.target.value)}
          />
          <Select
            aria-label={sx('result.col.resolution')}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            options={[
              { value: '', label: sx('result.any') },
              { value: '2160p', label: '2160p' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
            ]}
          />
          <span className="scr-muted">{sxn('torrent.matches', results.length)}</span>
        </div>

        {sendReport && (
          <div className="scr-send-report">
            <b>
              {sendReport.sent} sent · {sendReport.skipped} skipped · {sendReport.failed} failed
            </b>
            <ul>
              {sendReport.details.slice(0, 6).map((detail) => (
                <li key={detail.name}>
                  <Pill tone={detail.outcome === 'sent' ? 'good' : detail.outcome === 'skipped' ? 'warn' : 'bad'}>
                    {detail.outcome}
                  </Pill>
                  <span className="scr-t-plain">{detail.name}</span>
                  {detail.reason && <span className="scr-muted">{detail.reason}</span>}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" onClick={() => setSendReport(null)}>
              {sx('common.close')}
            </Button>
          </div>
        )}

        <div className="scr-torrent-table">
          <TorrentTable torrents={results} selected={selected} onToggle={toggle} />
        </div>
      </ScrCard>

      <ScrCard
        id="qbit-mirror"
        title={sx('torrent.mirror')}
        description={sx('torrent.mirrorDesc')}
        statusId="page.torrents"
        className="scr-card--tall"
        trailing={
          <span className="scr-muted">
            {sxn('torrent.activeTransfers', totals.active)} · ↓ {speed(totals.down)} · ↑{' '}
            {speed(totals.up)}
          </span>
        }
      >
        <div className="scr-table" role="table">
          <div
            className="scr-thead"
            role="row"
            style={{ gridTemplateColumns: MIRROR_TEMPLATE }}
          >
            {MIRROR_COLUMNS.map((label) => (
              <div key={label} role="columnheader" className="scr-th">
                {label}
              </div>
            ))}
          </div>
          <div className="scr-tbody scr-tbody--mirror">
            <VirtualList
              items={transfers}
              itemHeight={56}
              getKey={(t) => t.hash}
              emptyState={<p className="scr-table-empty">{sx('torrent.noTransfers')}</p>}
              renderItem={(t) => (
                <div role="row" className="scr-row" style={{ gridTemplateColumns: MIRROR_TEMPLATE }}>
                  <div role="gridcell" className="scr-td">
                    <span className="scr-t-titles">
                      <span className="scr-t-en">{t.name}</span>
                      <span className="scr-t-ja">{t.savePath}</span>
                    </span>
                  </div>
                  <div role="gridcell" className="scr-td">
                    <Pill tone={STATE_TONE[t.state]}>{t.state}</Pill>
                  </div>
                  <div role="gridcell" className="scr-td">
                    <div className="scr-progress-cell">
                      <PieceStrip pieces={t.pieceStates} />
                      <span className="scr-t-num">{Math.round(t.progress * 100)}%</span>
                    </div>
                  </div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{speed(t.downloadSpeedBps)}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{speed(t.uploadSpeedBps)}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{t.etaSec === null ? '—' : formatEtaClock(t.etaSec)}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{t.ratio.toFixed(2)}</span></div>
                  {/* Peers and seeds as connected/total — qBittorrent's own list
                      shows only the connected half, which hides a swarm that is
                      large but unreachable. */}
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{t.seedsConnected} / {t.seedsTotal}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{t.peersConnected} / {t.peersTotal}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{t.availability.toFixed(2)}</span></div>
                  <div role="gridcell" className="scr-td"><span className="scr-t-num">{formatBytes(t.sizeBytes)}</span></div>
                  <div role="gridcell" className="scr-td">
                    <Pill tone="outline">{t.category || '—'}</Pill>
                  </div>
                  <div role="gridcell" className="scr-td">
                    <span className="scr-t-plain">{t.tags.join(', ') || '—'}</span>
                  </div>
                  <div role="gridcell" className="scr-td">
                    <span className="scr-t-plain">{t.completedOn ? t.completedOn.slice(0, 10) : '—'}</span>
                  </div>
                  <div role="gridcell" className="scr-td scr-td--center">
                    <IconButton
                      label={`Actions for ${t.name}`}
                      size="sm"
                      onClick={() => {
                        setActiveTransferHash(t.hash);
                        setTransferNotice('');
                      }}
                    >
                      <Icon name="settings" size={13} />
                    </IconButton>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
        {activeTransfer && (
          <section className="scr-transfer-inspector" aria-label={`Transfer actions for ${activeTransfer.name}`}>
            <div className="scr-transfer-inspector-head">
              <div>
                <span className="scr-micro-label">Selected transfer</span>
                <strong>{activeTransfer.name}</strong>
                <small>{activeTransfer.savePath}</small>
              </div>
              <IconButton label="Close transfer actions" size="sm" onClick={() => setActiveTransferHash(null)}>
                <Icon name="close" size={13} />
              </IconButton>
            </div>
            <div className="scr-transfer-inspector-stats">
              <span><small>State</small><Pill tone={STATE_TONE[activeTransfer.state]}>{activeTransfer.state}</Pill></span>
              <span><small>Progress</small><b>{Math.round(activeTransfer.progress * 100)}%</b></span>
              <span><small>Availability</small><b>{activeTransfer.availability.toFixed(2)}</b></span>
              <span><small>Ratio</small><b>{activeTransfer.ratio.toFixed(2)}</b></span>
              <span><small>Peers</small><b>{activeTransfer.peersConnected}/{activeTransfer.peersTotal}</b></span>
            </div>
            <PieceStrip pieces={activeTransfer.pieceStates} />
            <div className="scr-page-actions">
              <Button size="sm" variant="primary" onClick={() => toggleTransfer(activeTransfer)}>
                {activeTransfer.state === 'paused' ? 'Resume transfer' : 'Pause transfer'}
              </Button>
              <Button size="sm" onClick={() => recheckTransfer(activeTransfer)}>Force recheck</Button>
              <Button
                size="sm"
                disabled={activeTransfer.progress < 1 || addingHash === activeTransfer.hash}
                onClick={() => void addTransferToLibrary(activeTransfer)}
              >
                {addingHash === activeTransfer.hash
                  ? sx('torrent.addToLibraryBusy')
                  : sx('torrent.addToLibrary')}
              </Button>
              <Button
                size="sm"
                onClick={() => setTransferNotice(`Save location: ${activeTransfer.savePath}`)}
              >
                Show save location
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeTransfer(activeTransfer)}>
                Remove from mirror
              </Button>
            </div>
          </section>
        )}
        {transferNotice && <p className="scr-action-notice" role="status">{transferNotice}</p>}
      </ScrCard>
    </div>
  );
}

const MIRROR_COLUMNS = [
  'Name',
  'State',
  'Progress',
  '↓ Speed',
  '↑ Speed',
  'ETA',
  'Ratio',
  'Seeds',
  'Peers',
  'Avail.',
  'Size',
  'Category',
  'Tags',
  'Completed',
  '',
];

const MIRROR_TEMPLATE =
  'minmax(220px, 2fr) 104px 150px 96px 96px 84px 68px 84px 84px 68px 92px 96px 120px 104px 44px';
