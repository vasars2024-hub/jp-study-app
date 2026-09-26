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
import { sx, sx2, sx3, sxn, sxs, type ScraperTextKey } from '../strings';
import TransferRemoveConfirm from '../TransferRemoveConfirm';
import { errorText, qbitActionNotice, qbitListFailureKey, type ActionNotice } from '../data/qbitActions';
import { t } from '../../../i18n';
import type { ScraperQbitTorrentAction } from '../../../../shared/scraperIpc';
import { engineReason, firstReason, type ReasonCheck } from '../disabledReason';
import {
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  updateActiveScraperSettings,
} from '../../../scraperSettingsStore';
import { resolveScraperSettings } from '../../../../shared/scraperSettings';
import {
  scraperQbitIdleStatus,
  type ScraperQbitStatus,
} from '../../../../shared/scraperSourceSettings';
import type {
  QbitSendReport,
  QbitStatusReport,
  QbitTransferRow,
  TorrentRow,
} from '../../../../shared/scraperResults';

/**
 * One key per status, so a new enum member is a compile error here rather than a
 * silently untranslated pill. `unknown` deliberately reads "not tested yet" — it
 * is a statement about this session, not about the user's configuration.
 */
const QBIT_STATUS_TEXT = {
  'not-configured': 'torrent.statusNotConfigured',
  connected: 'torrent.statusConnected',
  unauthorized: 'torrent.statusUnauthorized',
  unreachable: 'torrent.statusUnreachable',
  unknown: 'torrent.statusUnknown',
} as const satisfies Record<ScraperQbitStatus, string>;
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
  const [transferNotice, setTransferNotice] = useState<ActionNotice | null>(null);
  /** Which transfer an action is in flight for, so it cannot be fired twice. */
  const [actingHash, setActingHash] = useState<string | null>(null);
  const [confirmRemoveHash, setConfirmRemoveHash] = useState<string | null>(null);
  /** Which transfer is mid-import, so the button cannot be fired twice. */
  const [addingHash, setAddingHash] = useState<string | null>(null);
  const [backend, setBackend] = useState<AcquisitionBackendSnapshot | null>(null);
  const [backendBusy, setBackendBusy] = useState(false);
  const [backendNotice, setBackendNotice] = useState<AcquisitionActionResult | null>(null);
  const [backendDestination, setBackendDestination] = useState('');
  const [vaultHas, setVaultHas] = useState<VaultAnswer>(null);

  useEffect(() => onScraperSettingsChanged(setDoc), []);

  // Discover's "Find sources" lands here with the title already searched.
  useEffect(() => {
    if (!ctl.torrentQuery) return;
    setQuery(ctl.torrentQuery);
    ctl.clearTorrentQuery?.();
  }, [ctl.torrentQuery, ctl.clearTorrentQuery]);

  const settings = useMemo(() => resolveScraperSettings(doc), [doc]);
  const qbit = settings.qbittorrent;

  // Which indexes a search would actually reach. This is the EFFECTIVE filter,
  // not one side of it: `ipcScraperPort` narrows by kind and by `indexerIds`,
  // and `searchTorrents` in main narrows again by `enabled` — so a profile whose
  // only index is switched off reaches nothing while passing the port's half.
  //
  // Why the page needs it at all: with nothing surviving, main returns `[]`
  // without a request and this row rendered "0 matching releases", which is the
  // same sentence as a query that genuinely matched nothing — and only the
  // second of those is worth retyping. `sources.entries` ships as `[]`
  // (`shared/scraperSourceSettings.ts`), so that is every new profile.
  const reachableIndexers = useMemo(() => {
    const wanted = new Set(settings.torrents.indexerIds);
    return settings.sources.entries.filter(
      (entry) =>
        entry.kind === 'torrent' && entry.enabled && (!wanted.size || wanted.has(entry.id)),
    );
  }, [settings]);

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
    // No reachable index, no request. Main would refuse it into `[]` anyway; not
    // asking keeps the empty table and the reason beside it from disagreeing
    // about whether a search ever ran.
    if (!reachableIndexers.length) {
      setResults([]);
      return;
    }
    const rows = await port.searchTorrents({
      text: query,
      minSeeders: minSeeders ? Number(minSeeders) : undefined,
      resolution: resolution || undefined,
    });
    setResults(rows);
  }, [port, query, minSeeders, resolution, reachableIndexers.length]);

  useEffect(() => {
    void search();
  }, [search]);

  // Re-read after every action: the mirror shows what qBittorrent reports,
  // never a row patched to look like the click worked.
  const refreshTransfers = useCallback(async () => {
    try {
      setTransfers(await port.qbitTransfers());
    } catch (error) {
      // The last rows that were read stay on screen (not replaced by an empty
      // list), and the line says why they are stale and what to do.
      const key = qbitListFailureKey(error);
      setTransferNotice({ text: key ? t(key) : sxs('transfer.failed', errorText(error)), bad: true });
    }
  }, [port]);

  useEffect(() => {
    void refreshTransfers();
  }, [refreshTransfers]);

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
    // A free-text search knows no catalogue ids, but the handoff still tags the
    // torrents `gum` and records them, so main can find the Scraper's own
    // identification (job history) and import them when they finish.
    try {
      setSendReport(await port.qbitSend(rows, qbit, { via: 'torrent-manager' }));
    } catch (error) {
      setTransferNotice({ text: sxs('transfer.failed', errorText(error)), bad: true });
    }
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

  // The pill's subject: a live test result if one has been run, otherwise what
  // the SETTINGS say. `qbit.connectionStatus` alone was the bug — it defaults to
  // `not-configured` and only a manual test ever writes it, so a working client
  // was announced as unconfigured beside its own stored key and address.
  const connStatus: ScraperQbitStatus = status
    ? status.status
    : scraperQbitIdleStatus(qbit);
  const connTone =
    connStatus === 'connected'
      ? 'good'
      : connStatus === 'unknown' || connStatus === 'not-configured'
        ? 'neutral'
        : 'bad';
  const activeTransfer = transfers.find((transfer) => transfer.hash === activeTransferHash) ?? null;

  const actOnTransfer = async (
    transfer: QbitTransferRow,
    action: ScraperQbitTorrentAction,
    deleteFiles = false,
  ) => {
    setActingHash(transfer.hash);
    try {
      const report = await port.qbitAction(action, [transfer.hash], { deleteFiles });
      setTransferNotice(qbitActionNotice(action, report, transfer.name, deleteFiles));
      if (report.ok && action === 'delete') {
        setConfirmRemoveHash(null);
        setActiveTransferHash(null);
      }
    } catch (error) {
      setTransferNotice({ text: sxs('transfer.failed', errorText(error)), bad: true });
    } finally {
      setActingHash(null);
      await refreshTransfers();
    }
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
      setTransferNotice({ text: sx('torrent.addToLibraryIncomplete'), bad: true });
      return;
    }
    setAddingHash(transfer.hash);
    try {
      // qBittorrent's own `content_path` first: `savePath + name` is wrong for a
      // renamed torrent or a "no subfolder" layout. The guess stays as the
      // fallback for daemons older than 4.4, which do not report it. Forward
      // slash on purpose: Node accepts it on Windows too.
      const target = transfer.contentPath?.trim()
        || `${transfer.savePath.replace(/[\\/]+$/, '')}/${transfer.name}`;
      // The hash lets main use the identity recorded when the torrent was sent.
      const report = await window.api.addAcquiredMedia(target, { infoHash: transfer.hash });
      if (report.outcome === 'missing') setTransferNotice({ text: sx('torrent.addMissing'), bad: true });
      else if (report.outcome !== 'ok') setTransferNotice({ text: sx('torrent.addNoMedia'), bad: true });
      else if (report.added === 0) setTransferNotice({ text: sxn('torrent.alreadyInLibrary', report.found), bad: false });
      else setTransferNotice({ text: sx2('torrent.addedToLibrary', report.added, report.found), bad: false });
    } catch (error) {
      setTransferNotice({ text: sxs('torrent.addFailed', errorText(error)), bad: true });
    } finally {
      setAddingHash(null);
    }
  };

  // Each of these IS the disabled condition, not a caption written beside one:
  // `disabled` reads the same value the tooltip does, so a control can never go
  // off without the surface being able to say which clause turned it off.
  const busy: ReasonCheck = [backendBusy, sx('why.busy')];
  const unselected: ReasonCheck = [!selected.size, sx('why.noneSelected')];
  const whyRefresh = firstReason(busy);
  // Engine before selection, deliberately: "tick a torrent first" is true but is
  // a dead end when the engine behind the button is stopped — the user selects a
  // row and the button stays off. The durable blocker is the honest one to name.
  const whySendClient = firstReason(busy, [
    backend?.torrentClient.state !== 'ready',
    engineReason(sx('acq.torrentClient'), backend?.torrentClient),
  ], unselected);
  const whySendDebrid = firstReason(busy, [
    backend?.debrid.state !== 'ready',
    engineReason(sx('acq.debrid'), backend?.debrid),
  ], unselected);
  const whyRunAuto = firstReason(busy, [
    backend?.autoDownloader.state !== 'ready',
    engineReason(sx('acq.autoDownloader'), backend?.autoDownloader),
  ]);
  const whySimulate = firstReason(busy, [
    !backend?.autoDownloader.rules.length,
    sx('why.noRules'),
  ]);
  const whyClearSelection = firstReason(unselected);
  // One action at a time per transfer: a second click while qBittorrent is
  // still answering the first would race it.
  const whyActing = activeTransfer
    ? firstReason([actingHash === activeTransfer.hash, sx('why.busy')])
    : undefined;

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
          <Button
            size="sm"
            disabled={testing}
            title={testing ? sx('why.testing') : undefined}
            onClick={() => void test()}
          >
            {testing ? sx('torrent.testing') : sx('torrent.test')}
          </Button>
        }
      >
        <div className="scr-conn-row">
          <Pill tone={connTone}>{sx(QBIT_STATUS_TEXT[connStatus])}</Pill>
          <span className="scr-muted">
            {qbit.scheme}://{qbit.host}:{qbit.port}
            {qbit.basePath}
          </span>
          {status?.version && <Pill tone="outline">v{status.version}</Pill>}
          {status && <span className="scr-muted">{status.message}</span>}
          {status?.authMode && (
            <Pill tone="outline">
              {sx(status.authMode === 'apiKey' ? 'torrent.authViaApiKey' : 'torrent.authViaPassword')}
            </Pill>
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
          <Button
            size="sm"
            disabled={!!whyRefresh}
            title={whyRefresh}
            onClick={() => void refreshBackend()}
          >
            {sx('acq.refresh')}
          </Button>
        }
      >
        <div className="scr-setting-summary">
          <span>
            {sx('acq.sidecar')}{' '}
            <Pill tone={backend?.state === 'ready' ? 'good' : backend?.state === 'error' ? 'bad' : 'neutral'}>
              {backend ? sx(`acq.state.${backend.state}`) : sx('acq.loading')}
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
            disabled={!!whySendClient}
            title={whySendClient}
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
            disabled={!!whySendDebrid}
            title={whySendDebrid}
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
            disabled={!!whyRunAuto}
            title={whyRunAuto}
            onClick={() => void runBackendAction({ kind: 'run-auto-downloader' })}
          >
            {sx('acq.runAutoDownloader')}
          </Button>
          <Button
            size="sm"
            disabled={!!whySimulate}
            title={whySimulate}
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
              {backend.autoDownloader.queue.slice(0, 8).map((item) => {
                const whyQueued = firstReason(
                  busy,
                  [item.downloaded, sx('why.alreadyDownloaded')],
                  [item.delayed, sx('why.delayed')],
                );
                return (
                  <li key={item.id}>
                    <Pill tone={item.delayed ? 'warn' : item.downloaded ? 'good' : 'neutral'}>
                      {sxn('acq.episode', item.episode)}
                    </Pill>
                    <span className="scr-t-plain">{item.torrentName}</span>
                    <Button
                      size="sm"
                      disabled={!!whyQueued}
                      title={whyQueued}
                      onClick={() => void runBackendAction({
                        kind: 'download-queued-item',
                        itemId: item.id,
                      })}
                    >
                      {sx('acq.download')}
                    </Button>
                  </li>
                );
              })}
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
              disabled={!!whyClearSelection}
              title={whyClearSelection}
              onClick={() => void send()}
            >
              {sxn('torrent.send', selected.size)}
            </Button>
            <Button
              size="sm"
              disabled={!!whyClearSelection}
              title={whyClearSelection}
              onClick={() => setSelected(new Set())}
            >
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
          {reachableIndexers.length ? (
            <span className="scr-muted">{sxn('torrent.matches', results.length)}</span>
          ) : (
            // Two causes, two different fixes: nothing to search versus something
            // that is switched off. Collapsing them would send a user with no
            // sources at all hunting for a toggle that does not exist.
            <Pill tone="warn">
              {settings.sources.entries.some((entry) => entry.kind === 'torrent')
                ? sx('torrent.indexersAllOff')
                : sx('torrent.noIndexers')}
            </Pill>
          )}
        </div>

        {sendReport && (
          <div className="scr-send-report">
            <b>
              {sx3('result.sendSummary', sendReport.sent, sendReport.skipped, sendReport.failed)}
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
        <div className="scr-table scr-table--mirror" role="table" aria-rowcount={transfers.length + 1}>
          <div
            className="scr-thead"
            role="row"
            aria-rowindex={1}
          >
            {MIRROR_COLUMNS.map(([col, label]) => (
              <div key={col} role="columnheader" className="scr-th" data-col={col}>
                {label ? sx(label) : ''}
              </div>
            ))}
          </div>
          <div className="scr-tbody scr-tbody--mirror">
            <VirtualList
              items={transfers}
              itemHeight={56}
              getKey={(t) => t.hash}
              gridRole="rowgroup"
              emptyState={<p className="scr-table-empty">{sx('torrent.noTransfers')}</p>}
              renderItem={(t, index) => (
                <div role="row" aria-rowindex={index + 2} className="scr-row">
                  <div role="gridcell" className="scr-td" data-col="name">
                    <span className="scr-t-titles">
                      <span className="scr-t-en">{t.name}</span>
                      <span className="scr-t-ja">{t.savePath}</span>
                      {/* Everything the two narrow tiers drop, folded back into the row that
                          owns it. The per-row inspector carries only state, progress,
                          availability, ratio and peers, so speeds, size, category, tags and
                          completion would otherwise have no route at a narrow pane. */}
                      <span className="scr-t-fold">
                        {t.ratio.toFixed(2)} · {t.seedsConnected}/{t.seedsTotal} ·{' '}
                        {t.peersConnected}/{t.peersTotal} · {t.availability.toFixed(2)} ·{' '}
                        {t.category || '—'} · {t.tags.join(', ') || '—'} ·{' '}
                        {t.completedOn ? t.completedOn.slice(0, 10) : '—'}
                      </span>
                      <span className="scr-t-fold scr-t-fold--b">
                        {Math.round(t.progress * 100)}% · ↓ {speed(t.downloadSpeedBps)} · ↑{' '}
                        {speed(t.uploadSpeedBps)} ·{' '}
                        {t.etaSec === null ? '—' : formatEtaClock(t.etaSec)}
                      </span>
                    </span>
                  </div>
                  <div role="gridcell" className="scr-td" data-col="state">
                    <Pill tone={STATE_TONE[t.state]}>{t.state}</Pill>
                  </div>
                  <div role="gridcell" className="scr-td" data-col="progress">
                    <div className="scr-progress-cell">
                      <PieceStrip pieces={t.pieceStates} />
                      <span className="scr-t-num">{Math.round(t.progress * 100)}%</span>
                    </div>
                  </div>
                  <div role="gridcell" className="scr-td" data-col="down"><span className="scr-t-num">{speed(t.downloadSpeedBps)}</span></div>
                  <div role="gridcell" className="scr-td" data-col="up"><span className="scr-t-num">{speed(t.uploadSpeedBps)}</span></div>
                  <div role="gridcell" className="scr-td" data-col="eta"><span className="scr-t-num">{t.etaSec === null ? '—' : formatEtaClock(t.etaSec)}</span></div>
                  <div role="gridcell" className="scr-td" data-col="ratio"><span className="scr-t-num">{t.ratio.toFixed(2)}</span></div>
                  {/* Peers and seeds as connected/total — qBittorrent's own list
                      shows only the connected half, which hides a swarm that is
                      large but unreachable. */}
                  <div role="gridcell" className="scr-td" data-col="seeds"><span className="scr-t-num">{t.seedsConnected} / {t.seedsTotal}</span></div>
                  <div role="gridcell" className="scr-td" data-col="peers"><span className="scr-t-num">{t.peersConnected} / {t.peersTotal}</span></div>
                  <div role="gridcell" className="scr-td" data-col="avail"><span className="scr-t-num">{t.availability.toFixed(2)}</span></div>
                  <div role="gridcell" className="scr-td" data-col="size"><span className="scr-t-num">{formatBytes(t.sizeBytes)}</span></div>
                  <div role="gridcell" className="scr-td" data-col="category">
                    <Pill tone="outline">{t.category || '—'}</Pill>
                  </div>
                  <div role="gridcell" className="scr-td" data-col="tags">
                    <span className="scr-t-plain">{t.tags.join(', ') || '—'}</span>
                  </div>
                  <div role="gridcell" className="scr-td" data-col="completed">
                    <span className="scr-t-plain">{t.completedOn ? t.completedOn.slice(0, 10) : '—'}</span>
                  </div>
                  <div role="gridcell" className="scr-td scr-td--center" data-col="actions">
                    <IconButton
                      label={sxs('torrent.actionsFor', t.name)}
                      size="sm"
                      onClick={() => {
                        setActiveTransferHash(t.hash);
                        setConfirmRemoveHash(null);
                        setTransferNotice(null);
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
          <section className="scr-transfer-inspector" aria-label={sxs('torrent.inspectorFor', activeTransfer.name)}>
            <div className="scr-transfer-inspector-head">
              <div>
                <span className="scr-micro-label">{sx('torrent.selectedTransfer')}</span>
                <strong>{activeTransfer.name}</strong>
                <small>{activeTransfer.savePath}</small>
              </div>
              <IconButton label={sx('torrent.closeActions')} size="sm" onClick={() => setActiveTransferHash(null)}>
                <Icon name="close" size={13} />
              </IconButton>
            </div>
            <div className="scr-transfer-inspector-stats">
              <span><small>{sx('torrent.col.state')}</small><Pill tone={STATE_TONE[activeTransfer.state]}>{activeTransfer.state}</Pill></span>
              <span><small>{sx('torrent.col.progress')}</small><b>{Math.round(activeTransfer.progress * 100)}%</b></span>
              <span><small>{sx('torrent.col.availability')}</small><b>{activeTransfer.availability.toFixed(2)}</b></span>
              <span><small>{sx('torrent.col.ratio')}</small><b>{activeTransfer.ratio.toFixed(2)}</b></span>
              <span><small>{sx('torrent.col.peers')}</small><b>{activeTransfer.peersConnected}/{activeTransfer.peersTotal}</b></span>
            </div>
            <PieceStrip pieces={activeTransfer.pieceStates} />
            <div className="scr-page-actions">
              <Button
                size="sm"
                variant="primary"
                disabled={!!whyActing}
                title={whyActing}
                onClick={() => void actOnTransfer(
                  activeTransfer,
                  activeTransfer.state === 'paused' ? 'resume' : 'pause',
                )}
              >
                {sx(activeTransfer.state === 'paused' ? 'torrent.resumeTransfer' : 'torrent.pauseTransfer')}
              </Button>
              <Button
                size="sm"
                disabled={!!whyActing}
                title={whyActing}
                onClick={() => void actOnTransfer(activeTransfer, 'recheck')}
              >
                {sx('torrent.forceRecheck')}
              </Button>
              <Button
                size="sm"
                disabled={activeTransfer.progress < 1 || addingHash === activeTransfer.hash}
                title={firstReason(
                  [activeTransfer.progress < 1, sx('why.notComplete')],
                  [addingHash === activeTransfer.hash, sx('why.addingToLibrary')],
                )}
                onClick={() => void addTransferToLibrary(activeTransfer)}
              >
                {addingHash === activeTransfer.hash
                  ? sx('torrent.addToLibraryBusy')
                  : sx('torrent.addToLibrary')}
              </Button>
              <Button
                size="sm"
                onClick={() => setTransferNotice({
                  text: sxs('torrent.saveLocation', activeTransfer.savePath),
                  bad: false,
                })}
              >
                {sx('torrent.showSaveLocation')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!whyActing}
                title={whyActing}
                onClick={() => setConfirmRemoveHash(activeTransfer.hash)}
              >
                {sx('torrent.removeFromClient')}
              </Button>
            </div>
            {confirmRemoveHash === activeTransfer.hash && (
              <TransferRemoveConfirm
                name={activeTransfer.name}
                busy={actingHash === activeTransfer.hash}
                onConfirm={(deleteFiles) => void actOnTransfer(activeTransfer, 'delete', deleteFiles)}
                onCancel={() => setConfirmRemoveHash(null)}
              />
            )}
          </section>
        )}
        {transferNotice && (
          <p className={`scr-action-notice${transferNotice.bad ? ' is-bad' : ''}`} role="status">
            {transferNotice.text}
          </p>
        )}
      </ScrCard>
    </div>
  );
}

// Each column carries the key its cells are tagged with, so the two responsive tiers in
// `scraper.css` can drop a column and its header together. The track list itself is NOT
// here any more: it lives on `.scr-table--mirror`, because an inline `grid-template-columns`
// outranks a container query and made this table's 1582px min-content unreflowable.
// Labels are string keys, resolved at render so a language switch reaches them.
const MIRROR_COLUMNS: ReadonlyArray<readonly [string, ScraperTextKey | '']> = [
  ['name', 'torrent.col.name'],
  ['state', 'torrent.col.state'],
  ['progress', 'torrent.col.progress'],
  ['down', 'torrent.col.down'],
  ['up', 'torrent.col.up'],
  ['eta', 'torrent.col.eta'],
  ['ratio', 'torrent.col.ratio'],
  ['seeds', 'torrent.col.seeds'],
  ['peers', 'torrent.col.peers'],
  ['avail', 'torrent.col.availability'],
  ['size', 'torrent.col.size'],
  ['category', 'torrent.col.category'],
  ['tags', 'torrent.col.tags'],
  ['completed', 'torrent.col.completed'],
  ['actions', ''],
];
