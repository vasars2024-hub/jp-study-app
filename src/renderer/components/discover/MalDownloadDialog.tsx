/**
 * "Download this" — the step after picking something in the catalogue.
 *
 * The Discover console tells the learner what is worth watching or reading. This
 * is what turns that answer into files: click any MyAnimeList or AniList entry,
 * say how much of it you want, and hand exactly that much to whatever actually
 * fetches it.
 *
 * The two content types share this dialog because the *question* is the same —
 * which numbered units do I want? — but their acquisition paths are unchanged
 * and separate:
 *
 *   anime → catalogue episode list → torrent index → the user's own client.
 *           This app never touches the swarm; it hands over magnets, exactly as
 *           the Torrent Manager page already does.
 *   manga → an installed provider extension's chapter list → the same
 *           per-chapter download the provider browser already performs, run
 *           across a range instead of one at a time.
 *
 * All of the *choosing* is `shared/malDownload.ts`, which is pure and tested.
 * This file renders it and calls the two boundaries.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_MAL_SELECTION,
  chapterLabel,
  parseUnitNumber,
  filterMalReleases,
  planMalReleases,
  rankMalReleases,
  resolveMalSelection,
  seedMalSelection,
  summarizeMalSelection,
  type MalDownloadSelection,
  type MalDownloadTarget,
  type MalDownloadUnit,
  type MalReleasePlan,
  type MalSelectionMode,
} from '../../../shared/malDownload';
import type { DiscoveryCandidate } from '../../../shared/mediaDiscovery';
import type { ReadingMangaProvider } from '../../../shared/readingIpc';
import type { TorrentRow } from '../../../shared/scraperResults';
import type { LibraryItem } from '../../../shared/types';
import {
  isLocalOnlyMangaProvider,
  isProviderCrash,
  mangaChapterSourceKey,
} from '../reading/mangaSourcePresentation';
import MangaReader from '../../views/MangaReader';
import { getActiveScraperSettings } from '../../scraperSettingsStore';
import { showToast } from '../ui/Toast';
import { notify } from '../../notificationStore';
import { useT } from '../../i18n';
import Icon from '../Icons';

interface Props {
  candidate: DiscoveryCandidate;
  onClose: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';
type SendState = 'idle' | 'searching' | 'planned' | 'sending' | 'done' | 'error';

/** Where a finished plan is handed off to. */
type SendTarget = 'torrent-client' | 'debrid' | 'qbittorrent';

interface BatchProgress {
  done: number;
  total: number;
  label: string;
  failures: string[];
}

const MODES: MalSelectionMode[] = ['all', 'range', 'latest', 'custom'];
/** Rendering every unit of a 1,000-episode run would cost more than it tells. */
const VISIBLE_UNIT_LIMIT = 300;
/** Everything Tab can reach, for the focus wrap. */
const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]';
/** Nyaa's Literature category — raw and translated manga, not video. */
const NYAA_LITERATURE = '3_0';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Announce a finished run.
 *
 * Both surfaces on purpose: the toast is the thing the user sees at the moment
 * it lands, and the notification centre is what they find later if the dialog
 * was already closed — a long chapter batch outlives the attention that started
 * it, and a status line inside a dismissed dialog tells nobody anything.
 */
function announce(kind: 'success' | 'error', title: string, message: string): void {
  showToast({ kind, title, message, duration: kind === 'error' ? 6_000 : 3_600 });
  notify({ kind: kind === 'error' ? 'warning' : 'success', title, message, source: 'Downloads' });
}

/** Release sizes, at the precision a chooser needs and no more. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export default function MalDownloadDialog({ candidate, onClose }: Props) {
  const { t } = useT();
  const isManga = candidate.mediaType === 'manga';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadMessage, setLoadMessage] = useState('');
  const [target, setTarget] = useState<MalDownloadTarget | null>(null);
  /**
   * Units as the provider listed them. What the user already owns is layered on
   * at render rather than baked in here, so learning about a new download never
   * invalidates the fetch that produced the list.
   */
  const [listedUnits, setListedUnits] = useState<MalDownloadUnit[]>([]);
  const [servedBy, setServedBy] = useState('');
  const [note, setNote] = useState('');
  const [selection, setSelection] = useState<MalDownloadSelection>(DEFAULT_MAL_SELECTION);

  const [providers, setProviders] = useState<ReadingMangaProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  /**
   * Which shelf a manga is taken from.
   *
   * `chapters` is the provider path — numbered chapters, downloaded page by
   * page into the reader. `releases` is the torrent index, where raw Japanese
   * manga actually lives, and where a "release" is a volume or a whole series
   * rather than a chapter. The two are not interchangeable and the range picker
   * only makes sense for the first, which is why this is a mode and not a
   * source dropdown.
   */
  const [mangaMode, setMangaMode] = useState<'chapters' | 'releases'>('chapters');
  /** Releases the user ticked in the picker, by id. */
  const [pickedReleases, setPickedReleases] = useState<Set<string>>(() => new Set());
  const [releaseFilter, setReleaseFilter] = useState('');
  /**
   * Unit keys already sitting in the local library.
   *
   * The provider browser marks these one chapter at a time; a range picker has
   * to know them up front or "download chapters 1–200" quietly refetches the
   * hundred the user already has.
   */
  const [ownedKeys, setOwnedKeys] = useState<Set<string>>(() => new Set());

  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendMessage, setSendMessage] = useState('');
  const [releases, setReleases] = useState<TorrentRow[]>([]);
  /** How many rows the index returned, regardless of how many matched. */
  const [releasesFound, setReleasesFound] = useState<number | null>(null);
  const [plan, setPlan] = useState<MalReleasePlan | null>(null);
  /**
   * The text the release indexes are searched by. Seeded from the catalogue's
   * romaji title and editable, because that title and the one release groups
   * actually use are routinely different — and when they are, retyping the
   * query is the whole fix.
   */
  const [query, setQuery] = useState('');
  const [preferBatches, setPreferBatches] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendTarget>('torrent-client');
  const [availableTargets, setAvailableTargets] = useState<SendTarget[]>([]);
  /**
   * Info hashes the torrent client is already working on — the anime answer to
   * the same question the owned set answers for chapters. Sending these again
   * is a no-op the client silently swallows, which makes the dialog look like
   * it queued twelve downloads when it queued none.
   */
  const [queuedHashes, setQueuedHashes] = useState<Set<string>>(() => new Set());
  const [destination, setDestination] = useState('');
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  /**
   * The first chapter a finished batch produced, so the dialog can hand the
   * user straight to the reader instead of ending on a status line and leaving
   * them to find what they just downloaded.
   */
  const [readerItem, setReaderItem] = useState<LibraryItem | null>(null);
  const [reading, setReading] = useState(false);

  const dialogRef = useRef<HTMLElement | null>(null);
  const backdropPressRef = useRef(false);
  /** Set on unmount so an in-flight batch stops instead of writing to a dead tree. */
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------- unit load ---

  useEffect(() => {
    if (isManga) return;
    let dead = false;
    setLoadState('loading');
    // Optional chaining short-circuits the whole expression, so calling a
    // missing bridge method silently yields undefined and the dialog would sit
    // on its spinner for ever. An absent backend is an error state, not a slow
    // one, and has to be said out loud.
    const listUnits = window.api?.scraperMalUnits;
    if (typeof listUnits !== 'function') {
      setLoadMessage(t('malDownload.error.noBackend'));
      setLoadState('error');
      return;
    }
    void listUnits({
      contentType: 'anime',
      provider: candidate.provider,
      id: candidate.id,
    })
      .then((result) => {
        if (dead) return;
        setTarget(result.target);
        setListedUnits(result.units);
        setServedBy(result.servedBy);
        setNote(result.note);
        setQuery(result.target.romajiTitle || result.target.title);
        setSelection(seedMalSelection(result.units));
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (dead) return;
        setLoadMessage(errorText(error));
        setLoadState('error');
      });
    return () => {
      dead = true;
    };
  }, [candidate.id, candidate.provider, isManga, t]);

  // What the local library already holds for this work. Read once per open —
  // the batch below updates the set itself as chapters land, so a re-read after
  // every download would only cost a round-trip to learn what we just did.
  useEffect(() => {
    if (!isManga) return;
    let dead = false;
    void window.api?.listLibrary?.()
      .then((items) => {
        if (dead) return;
        const owned = new Set<string>();
        for (const item of items ?? []) {
          const source = item.readingSource;
          if (source?.kind !== 'seanime-manga-chapter' || source.mediaId !== candidate.id) continue;
          owned.add(mangaChapterSourceKey(source.providerId, source.chapterId));
        }
        setOwnedKeys(owned);
      })
      .catch(() => {
        // Not knowing what is already downloaded degrades this to the old
        // behaviour — it must never block the dialog from opening.
      });
    return () => {
      dead = true;
    };
  }, [candidate.id, isManga]);

  // A manga's identity comes from the catalogue entry, not from whichever shelf
  // it is being taken from — so it is set here rather than inside the chapter
  // fetch, which does not run at all in releases mode.
  useEffect(() => {
    if (!isManga) return;
    setTarget({
      contentType: 'manga',
      provider: candidate.provider,
      id: candidate.id,
      title: candidate.title,
      nativeTitle: candidate.nativeTitle ?? '',
      // Raw volumes are indexed under the native title as often as the English
      // one, so it seeds the search when there is one.
      romajiTitle: candidate.nativeTitle || candidate.title,
      posterUrl: candidate.posterUrl ?? '',
      totalUnits: candidate.chapterCount ?? 0,
    });
    setQuery((current) => current || candidate.nativeTitle || candidate.title);
  }, [candidate, isManga]);

  // Manga units are per-provider, so the provider list comes first and the
  // chapter list is reloaded whenever the user switches between them.
  useEffect(() => {
    if (!isManga) return;
    let dead = false;
    setLoadState('loading');
    const listProviders = window.api?.readingMangaProviders;
    if (typeof listProviders !== 'function') {
      setLoadMessage(t('malDownload.error.noBackend'));
      setLoadState('error');
      return;
    }
    void listProviders()
      .then((reply) => {
        if (dead) return;
        // The local provider serves this disk, not a catalogue, so it cannot
        // answer "what chapters does title X have" — see
        // `isLocalOnlyMangaProvider`. Counting it here is what made a machine
        // with no online source look like a machine with one.
        const list = (reply.state === 'ready' ? reply.data ?? [] : [])
          .filter((provider) => !isLocalOnlyMangaProvider(provider.id));
        setProviders(list);
        if (!list.length) {
          // No chapter source installed used to be a dead end. It is not: the
          // torrent index carries raw volumes, which is the more useful shelf
          // for a Japanese learner anyway. Fall through to that instead of
          // stopping, and say why.
          setMangaMode('releases');
          setNote('no-manga-provider');
          setLoadState('ready');
          return;
        }
        // Keep the provider the user already chose when this re-runs.
        setProviderId((current) =>
          (list.some((provider) => provider.id === current) ? current : list[0].id));
      })
      .catch((error: unknown) => {
        if (dead) return;
        setLoadMessage(errorText(error));
        setLoadState('error');
      });
    return () => {
      dead = true;
    };
    // `t`'s identity is stable, so listing it cannot re-trigger the fetch on a
    // language switch — which is what we want here.
  }, [isManga, t]);

  useEffect(() => {
    if (!isManga || !providerId || mangaMode === 'releases') return;
    let dead = false;
    setLoadState('loading');
    const listChapters = window.api?.readingMangaChapters;
    if (typeof listChapters !== 'function') {
      setLoadMessage(t('malDownload.error.noBackend'));
      setLoadState('error');
      return;
    }
    void listChapters({ mediaId: candidate.id, providerId })
      .then((reply) => {
        if (dead) return;
        if (reply.state !== 'ready' || !reply.data) {
          throw new Error(reply.message || reply.state);
        }
        const provider = providers.find((entry) => entry.id === providerId);
        const chapters = reply.data;
        const built = chapters.map((chapter, index): MalDownloadUnit => {
          const number = parseUnitNumber(chapter.number, chapter.index + 1);
          // Keyed exactly as the library records a downloaded chapter, so the
          // owned set matches without a second mapping to keep in step.
          const key = mangaChapterSourceKey(providerId, chapter.chapterId);
          return {
            key,
            ordinal: index,
            number,
            label: chapterLabel(chapter.number, number),
            title: chapter.title,
            nativeTitle: '',
            airDate: null,
            filler: false,
            recap: false,
            source: {
              providerId,
              providerLabel: provider?.name ?? providerId,
              chapterId: chapter.chapterId,
              rawNumber: chapter.number,
              language: chapter.language || provider?.lang || '',
              scanlator: chapter.scanlator,
            },
          };
        });
        setTarget({
          contentType: 'manga',
          provider: candidate.provider,
          id: candidate.id,
          title: candidate.title,
          nativeTitle: candidate.nativeTitle ?? '',
          romajiTitle: candidate.title,
          posterUrl: candidate.posterUrl ?? '',
          totalUnits: candidate.chapterCount ?? built.length,
        });
        setListedUnits(built);
        setServedBy(provider?.name ?? providerId);
        setNote(built.length ? '' : 'nothing-listed');
        setSelection((current) => seedMalSelection(built, current));
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (dead) return;
        const message = errorText(error);
        // A provider that crashes is not a dead end either. Releases carry raw
        // volumes for the same title and need no provider at all, so take the
        // same fall-through the no-provider case takes — but keep the crash
        // text, because "the source failed" and "this title has no chapters"
        // are different answers and the user is owed the right one.
        if (isProviderCrash(message)) {
          setMangaMode('releases');
          setNote('manga-provider-failed');
          setLoadMessage(message);
          setLoadState('ready');
          return;
        }
        setLoadMessage(message);
        setLoadState('error');
      });
    return () => {
      dead = true;
    };
  }, [candidate, isManga, providerId, providers, t]);

  // ---------------------------------------------------------------- escape ---

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape during a running batch would leave the user with no idea how far
      // it got; the Close button is disabled for the same reason.
      if (event.key === 'Escape' && sendState !== 'sending') {
        onClose();
        return;
      }
      // `aria-modal` tells a screen reader the rest of the page is inert; it
      // does not stop Tab from walking out into the catalogue behind. Without
      // the wrap, tabbing off the last control silently strands keyboard focus
      // in a list the user cannot see.
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sendState]);

  // Focus moves into the dialog on open and back to whatever opened it on
  // close, so dismissing it does not drop the caret at the top of the document.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  // -------------------------------------------------------------- selection ---

  // The owned marks are layered on here. Doing it at render keeps the chapter
  // fetch independent of the library: baking `owned` into the fetched list put
  // `ownedKeys` in that effect's dependencies, so every chapter a batch landed
  // re-listed the whole provider — twenty downloads, twenty needless refetches.
  const units = useMemo(
    () => (ownedKeys.size === 0
      ? listedUnits
      : listedUnits.map((unit) => (ownedKeys.has(unit.key) ? { ...unit, owned: true } : unit))),
    [listedUnits, ownedKeys],
  );

  const selected = useMemo(() => resolveMalSelection(units, selection), [units, selection]);
  const summary = useMemo(() => summarizeMalSelection(units, selection), [units, selection]);
  const selectedKeys = useMemo(() => new Set(selected.map((unit) => unit.key)), [selected]);
  const hasFillers = useMemo(() => units.some((unit) => unit.filler), [units]);
  const hasRecaps = useMemo(() => units.some((unit) => unit.recap), [units]);
  const hasOwned = useMemo(() => units.some((unit) => unit.owned), [units]);
  /** True when the surface is a release picker rather than a unit range. */
  const pickingReleases = isManga && mangaMode === 'releases';
  const visibleReleases = useMemo(
    () => filterMalReleases(releases, releaseFilter),
    [releases, releaseFilter],
  );

  /**
   * Everything that describes the *last* run, cleared whenever the selection
   * changes. A plan built from the old selection no longer describes this one,
   * and a progress line left over from a finished batch reads as live.
   */
  const forgetLastRun = useCallback(() => {
    setPlan(null);
    setReleasesFound(null);
    setProgress(null);
    setSendState('idle');
    setSendMessage('');
  }, []);

  const patch = useCallback((next: Partial<MalDownloadSelection>) => {
    setSelection((current) => ({ ...current, ...next }));
    forgetLastRun();
  }, [forgetLastRun]);

  /**
   * Clicking a row switches to hand-picked mode, carrying the current selection
   * across. Without that carry, unticking one episode of "all" would throw away
   * the other 27.
   */
  const toggleUnit = useCallback((unit: MalDownloadUnit) => {
    setSelection((current) => {
      const base = current.mode === 'custom'
        ? current.keys
        : resolveMalSelection(units, current).map((entry) => entry.key);
      const keys = base.includes(unit.key)
        ? base.filter((key) => key !== unit.key)
        : [...base, unit.key];
      return { ...current, mode: 'custom', keys };
    });
    forgetLastRun();
  }, [forgetLastRun, units]);

  // --------------------------------------------------------------- releases ---

  const findReleases = useCallback(async () => {
    if (!target) return;
    setSendState('searching');
    setSendMessage('');
    try {
      const settings = getActiveScraperSettings();
      const wanted = new Set(settings.torrents.indexerIds);
      const indexers = settings.sources.entries.filter(
        (entry) => entry.kind === 'torrent' && (!wanted.size || wanted.has(entry.id)),
      );
      if (!indexers.length) throw new Error(t('malDownload.error.noIndexers'));
      const search = window.api?.scraperSearchTorrents;
      if (typeof search !== 'function') throw new Error(t('malDownload.error.noBackend'));

      const rows = await search({
        query: {
          text: query.trim() || target.title,
          minSeeders: settings.torrents.minSeeders,
          // Nyaa's Literature tree. Without it a manga search returns the
          // anime of the same name — measured: NARUTO came back as 72 .mkv
          // episode files.
          ...(pickingReleases ? { category: NYAA_LITERATURE } : {}),
        },
        indexers,
        torrents: settings.torrents,
        timeoutMs: settings.sources.perSourceTimeoutMs,
      });
      if (!aliveRef.current) return;

      const resolution = settings.torrents.resolutionPriority[0];
      // Releases mode has no units to match against — a raw volume is not
      // chapter 12 — so it skips planning and hands the ranked list straight to
      // the picker. Planning anyway would invent a mapping that is not there.
      const built = pickingReleases
        ? null
        : planMalReleases(selected, rows, {
          preferredResolution: resolution ? `${resolution}p` : '',
          preferBatches,
        });
      setReleases(pickingReleases
        ? rankMalReleases(rows, { preferredResolution: resolution ? `${resolution}p` : '' })
        : rows);
      // How many the index returned, not just how many matched. Without it, a
      // plan covering nothing looks identical whether the index was empty, the
      // seeder floor ate everything, or the query simply named the wrong show —
      // and only the last of those is worth retyping the query for.
      setReleasesFound(rows.length);
      setPlan(built);
      setSendState('planned');

      // Which handoffs are genuinely reachable, asked once the plan exists so a
      // dialog that is only being browsed never probes the backend. A backend
      // that cannot answer leaves the plan standing and only costs the user the
      // send targets — it must not throw away the search they just paid for.
      const snapshot = await (window.api?.scraperGetAcquisitionSnapshot?.() ?? Promise.resolve(null))
        .catch(() => null);
      if (!aliveRef.current) return;
      const targets: SendTarget[] = [];
      if (snapshot?.torrentClient.state === 'ready') targets.push('torrent-client');
      if (snapshot?.debrid.state === 'ready') targets.push('debrid');
      if (settings.qbittorrent.enabled && settings.qbittorrent.host.trim()) {
        targets.push('qbittorrent');
      }
      setAvailableTargets(targets);
      if (targets.length) setSendTarget(targets[0]);
      setQueuedHashes(new Set(
        (snapshot?.torrentClient.transfers ?? [])
          .map((transfer) => transfer.id.toLowerCase())
          .filter(Boolean),
      ));
      setDestination((current) => current || settings.qbittorrent.savePath || '');
    } catch (error) {
      if (!aliveRef.current) return;
      setSendMessage(errorText(error));
      setSendState('error');
    }
  }, [pickingReleases, preferBatches, query, selected, t, target]);

  /**
   * What the send button will actually hand over.
   *
   * The plan in episode mode, the ticked rows in release mode — minus, in both
   * cases, anything the torrent client is already working on.
   */
  const sendable = useMemo(
    () => (pickingReleases
      ? releases.filter((release) => pickedReleases.has(release.id))
      : plan?.releases ?? []
    ).filter(
      (release) => !release.infoHash || !queuedHashes.has(release.infoHash.toLowerCase()),
    ),
    [pickedReleases, pickingReleases, plan, queuedHashes, releases],
  );

  const sendReleases = useCallback(async () => {
    if (!sendable.length) return;
    setSendState('sending');
    setSendMessage('');
    try {
      const ids = sendable.map((release) => release.id);
      if (sendTarget === 'qbittorrent') {
        const settings = getActiveScraperSettings();
        const chosen = releases.filter((row) => ids.includes(row.id));
        const send = window.api?.scraperQbitSend;
        if (typeof send !== 'function') throw new Error(t('malDownload.error.noBackend'));
        const report = await send({ rows: chosen, config: settings.qbittorrent });
        if (!aliveRef.current) return;
        const message = t('malDownload.sent.qbit', {
          sent: report.sent,
          skipped: report.skipped,
          failed: report.failed,
        });
        setSendMessage(message);
        setSendState(report.failed > 0 && report.sent === 0 ? 'error' : 'done');
        announce(
          report.sent > 0 ? 'success' : 'error',
          t('malDownload.notice.title', { title: candidate.title }),
          message,
        );
        return;
      }

      const result = await window.api.scraperRunAcquisitionAction({
        kind: 'send-torrents',
        target: sendTarget,
        torrentIds: ids,
        destination: destination.trim(),
        torrents: releases,
      });
      if (!aliveRef.current) return;
      setSendMessage(result.message);
      setSendState(result.ok ? 'done' : 'error');
      announce(
        result.ok ? 'success' : 'error',
        t('malDownload.notice.title', { title: candidate.title }),
        result.message,
      );
    } catch (error) {
      if (!aliveRef.current) return;
      setSendMessage(errorText(error));
      setSendState('error');
    }
  }, [destination, releases, sendable, sendTarget, t]);

  // ------------------------------------------------------------ manga batch ---

  const downloadChapters = useCallback(async () => {
    if (!selected.length) return;
    setSendState('sending');
    setSendMessage('');
    const failures: string[] = [];
    let firstItem: LibraryItem | null = null;
    // Serialised on purpose: each chapter is dozens of image requests, and the
    // provider browser downloads one at a time for the same reason.
    for (const [index, unit] of selected.entries()) {
      if (!aliveRef.current) return;
      const source = unit.source;
      if (!source) continue;
      setProgress({ done: index, total: selected.length, label: unit.label, failures });
      try {
        const reply = await window.api.readingMangaDownloadChapter({
          mediaId: candidate.id,
          providerId: source.providerId,
          providerLabel: source.providerLabel,
          chapterId: source.chapterId,
          chapterNumber: source.rawNumber,
          chapterTitle: unit.title,
          language: source.language,
        });
        if (reply.state !== 'ready' || !reply.data) {
          failures.push(`${unit.label}: ${reply.message || reply.state}`);
        } else {
          // Learn from our own work, so re-running the same range does not
          // refetch what this run just landed.
          setOwnedKeys((current) => new Set(current).add(unit.key));
          // Keep the earliest chapter of the run, not the last: after "download
          // 1–20" the one the reader should open is chapter 1.
          firstItem ??= reply.data.item;
        }
      } catch (error) {
        failures.push(`${unit.label}: ${errorText(error)}`);
      }
    }
    if (!aliveRef.current) return;
    setProgress({ done: selected.length, total: selected.length, label: '', failures });
    setReaderItem(firstItem);
    const landed = selected.length - failures.length;
    const message = failures.length
      ? t('malDownload.sent.chaptersPartial', { count: landed, failed: failures.length })
      : t('malDownload.sent.chapters', { count: selected.length });
    setSendMessage(message);
    setSendState(failures.length === selected.length ? 'error' : 'done');
    announce(
      landed > 0 ? 'success' : 'error',
      t('malDownload.notice.title', { title: candidate.title }),
      message,
    );
  }, [candidate.id, selected, t]);

  // ------------------------------------------------------------------ view ---

  const visibleUnits = units.slice(0, VISIBLE_UNIT_LIMIT);
  const hiddenUnits = units.length - visibleUnits.length;
  const busy = sendState === 'searching' || sendState === 'sending';

  // The reader replaces the dialog rather than stacking on it, the same way the
  // provider browser hands over — two modal layers deep is a trap to escape from.
  if (reading && readerItem) {
    return createPortal(
      <MangaReader item={readerItem} onClose={() => setReading(false)} />,
      document.body,
    );
  }

  /**
   * The one line under the footer. Ordered by what the user can act on: what
   * just happened first, then why the plan is empty, then why it cannot be sent.
   * A search that matched nothing is the case most worth explaining — the fix is
   * usually the query, and nothing else on screen says so.
   */
  const footnote = sendMessage
    || (plan && plan.covered === 0 ? t('malDownload.hint.noMatches') : '')
    || (plan && !availableTargets.length ? t('malDownload.error.noClient') : '');

  return createPortal(
    <div
      className="reading-source-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget && !busy) onClose();
        backdropPressRef.current = false;
      }}
    >
      <section
        ref={dialogRef}
        className="reading-source-dialog mal-dl"
        role="dialog"
        aria-modal="true"
        aria-label={t('malDownload.title')}
        aria-busy={busy}
        tabIndex={-1}
      >
        <header>
          <div className="mal-dl-head">
            {candidate.posterUrl ? (
              <img src={candidate.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : null}
            <div>
              <span className="reading-source-eyebrow">{t('malDownload.eyebrow')}</span>
              <h2>{candidate.title}</h2>
              <p>
                {[
                  t(isManga ? 'scraper.mediaType.manga' : 'scraper.mediaType.anime'),
                  servedBy,
                  target ? t('malDownload.unitTotal', { count: units.length }) : '',
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="disc-pin"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        {/* The shelf switch sits outside the load states on purpose. It is
            navigation, not content: a chapter provider that fails — and the
            built-in local-files one fails with a 500 on any online title — must
            still leave the user a way over to the torrent index, which is
            exactly the case where they need it most. */}
        {isManga ? (
          <div
            className="disc-segment mal-dl-shelf"
            role="group"
            aria-label={t('malDownload.shelf')}
          >
            {(['chapters', 'releases'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`disc-seg-btn ${mangaMode === id ? 'active' : ''}`}
                disabled={busy || (id === 'chapters' && providers.length === 0)}
                title={id === 'chapters' && providers.length === 0
                  ? t('malDownload.error.noProviders')
                  : undefined}
                onClick={() => {
                  setMangaMode(id);
                  forgetLastRun();
                  setPickedReleases(new Set());
                  // Releases mode has nothing to fetch, so a failure carried
                  // over from the chapter path must not keep the body hidden.
                  if (id === 'releases') {
                    setLoadMessage('');
                    setLoadState('ready');
                  }
                }}
              >
                {t(`malDownload.shelf.${id}`)}
              </button>
            ))}
          </div>
        ) : null}

        {loadState === 'loading' ? (
          <div className="reading-source-message" role="status" aria-busy="true">
            {t('malDownload.state.loading')}
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="reading-source-message reading-source-error" role="alert">
            {t('malDownload.state.loadFailed')} — {loadMessage}
          </div>
        ) : null}

        {loadState === 'ready' ? (
          <div className="mal-dl-body">
            {isManga && !pickingReleases && providers.length > 1 ? (
              <label className="disc-field mal-dl-provider">
                <span>{t('malDownload.provider')}</span>
                <select
                  value={providerId}
                  disabled={busy}
                  onChange={(event) => {
                    setProviderId(event.target.value);
                    setPlan(null);
                    setSendState('idle');
                  }}
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}{provider.lang ? ` · ${provider.lang.toUpperCase()}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {note === 'no-episode-list' ? (
              <p className="mal-dl-note" role="status">{t('malDownload.note.noEpisodeList')}</p>
            ) : null}
            {note === 'nothing-listed' ? (
              <p className="mal-dl-note" role="status">{t('malDownload.note.nothingListed')}</p>
            ) : null}
            {note === 'no-manga-provider' ? (
              <p className="mal-dl-note" role="status">{t('malDownload.note.noMangaProvider')}</p>
            ) : null}
            {note === 'manga-provider-failed' ? (
              <p className="mal-dl-note" role="status">
                {t('malDownload.note.mangaProviderFailed')}
                {loadMessage ? <span className="mal-dl-note-detail">{loadMessage}</span> : null}
              </p>
            ) : null}
            {pickingReleases ? (
              <p className="mal-dl-note" role="status">{t('malDownload.note.volumesNotChapters')}</p>
            ) : null}

            <div className="mal-dl-controls" hidden={pickingReleases}>
              <div className="disc-segment" role="group" aria-label={t('malDownload.amount')}>
                {MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`disc-seg-btn ${selection.mode === mode ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => patch({ mode })}
                  >
                    {t(`malDownload.mode.${mode}`)}
                  </button>
                ))}
              </div>

              {selection.mode === 'range' ? (
                <div className="mal-dl-range">
                  <label className="disc-field">
                    <span>{t('malDownload.from')}</span>
                    <input
                      type="number"
                      value={selection.from}
                      disabled={busy}
                      onChange={(event) => patch({ from: Number(event.target.value) })}
                    />
                  </label>
                  <label className="disc-field">
                    <span>{t('malDownload.to')}</span>
                    <input
                      type="number"
                      value={selection.to}
                      disabled={busy}
                      onChange={(event) => patch({ to: Number(event.target.value) })}
                    />
                  </label>
                </div>
              ) : null}

              {selection.mode === 'latest' ? (
                <label className="disc-field">
                  <span>{t('malDownload.howMany')}</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, units.length)}
                    value={selection.latest}
                    disabled={busy}
                    onChange={(event) => patch({ latest: Number(event.target.value) })}
                  />
                </label>
              ) : null}

              {hasFillers ? (
                <label className="disc-check">
                  <input
                    type="checkbox"
                    checked={selection.skipFillers}
                    disabled={busy}
                    onChange={(event) => patch({ skipFillers: event.target.checked })}
                  />
                  <span>{t('malDownload.skipFillers')}</span>
                </label>
              ) : null}

              {hasRecaps ? (
                <label className="disc-check">
                  <input
                    type="checkbox"
                    checked={selection.skipRecaps}
                    disabled={busy}
                    onChange={(event) => patch({ skipRecaps: event.target.checked })}
                  />
                  <span>{t('malDownload.skipRecaps')}</span>
                </label>
              ) : null}

              {hasOwned ? (
                <label className="disc-check">
                  <input
                    type="checkbox"
                    checked={selection.skipOwned}
                    disabled={busy}
                    onChange={(event) => patch({ skipOwned: event.target.checked })}
                  />
                  <span>{t('malDownload.skipOwned')}</span>
                </label>
              ) : null}

              {!isManga ? (
                <label className="disc-check">
                  <input
                    type="checkbox"
                    checked={preferBatches}
                    disabled={busy}
                    onChange={(event) => {
                      setPreferBatches(event.target.checked);
                      forgetLastRun();
                    }}
                  />
                  <span>{t('malDownload.preferBatches')}</span>
                </label>
              ) : null}
            </div>

            {!isManga || pickingReleases ? (
              <label className="disc-field mal-dl-query">
                <span>{t('malDownload.query')}</span>
                <input
                  value={query}
                  disabled={busy}
                  placeholder={target?.title ?? ''}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    forgetLastRun();
                  }}
                />
              </label>
            ) : null}

            {pickingReleases ? (
              <>
                {releases.length > 0 ? (
                  <label className="disc-field mal-dl-query">
                    <span>{t('malDownload.filter')}</span>
                    <input
                      value={releaseFilter}
                      disabled={busy}
                      placeholder={t('malDownload.filterPlaceholder')}
                      onChange={(event) => setReleaseFilter(event.target.value)}
                    />
                  </label>
                ) : null}
                <ul className="mal-dl-units mal-dl-releases">
                  {visibleReleases.map((release) => {
                    const picked = pickedReleases.has(release.id);
                    const queued = Boolean(release.infoHash)
                      && queuedHashes.has(release.infoHash.toLowerCase());
                    return (
                      <li key={release.id} className={picked ? 'is-picked' : ''}>
                        <label>
                          <input
                            type="checkbox"
                            checked={picked}
                            disabled={busy}
                            onChange={() => setPickedReleases((current) => {
                              const next = new Set(current);
                              if (next.has(release.id)) next.delete(release.id);
                              else next.add(release.id);
                              return next;
                            })}
                          />
                          <span>{release.name}</span>
                        </label>
                        <span className="mal-dl-unit-meta">
                          {release.isBatch ? (
                            <em className="mal-dl-tag">{t('malDownload.tag.batch')}</em>
                          ) : null}
                          {queued ? (
                            <em className="mal-dl-tag mal-dl-tag--owned">
                              {t('malDownload.match.queued')}
                            </em>
                          ) : null}
                          {release.releaseGroup ? <small>{release.releaseGroup}</small> : null}
                          <small>{formatBytes(release.sizeBytes)}</small>
                          <small className={release.seeders > 0 ? 'mal-dl-hit' : 'mal-dl-miss'}>
                            {t('malDownload.seeders', { count: release.seeders })}
                          </small>
                        </span>
                      </li>
                    );
                  })}
                  {releases.length > 0 && visibleReleases.length === 0 ? (
                    <li className="mal-dl-truncated">{t('malDownload.noFilterMatch')}</li>
                  ) : null}
                  {releases.length === 0 ? (
                    <li className="mal-dl-truncated">{t('malDownload.releasesHint')}</li>
                  ) : null}
                </ul>
              </>
            ) : (
            <ul className="mal-dl-units">
              {visibleUnits.map((unit) => {
                const picked = selectedKeys.has(unit.key);
                const match = plan?.matches.find((entry) => entry.unit.key === unit.key);
                return (
                  <li key={unit.key} className={picked ? 'is-picked' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={picked}
                        disabled={busy}
                        onChange={() => toggleUnit(unit)}
                      />
                      <strong>{unit.label}</strong>
                      <span>{unit.title || unit.nativeTitle}</span>
                    </label>
                    <span className="mal-dl-unit-meta">
                      {unit.filler ? (
                        <em className="mal-dl-tag">{t('malDownload.tag.filler')}</em>
                      ) : null}
                      {unit.recap ? (
                        <em className="mal-dl-tag">{t('malDownload.tag.recap')}</em>
                      ) : null}
                      {unit.owned ? (
                        <em className="mal-dl-tag mal-dl-tag--owned">
                          {t('malDownload.tag.owned')}
                        </em>
                      ) : null}
                      {unit.source?.scanlator ? <small>{unit.source.scanlator}</small> : null}
                      {unit.airDate ? <small>{unit.airDate}</small> : null}
                      {match ? (
                        <small className={match.release ? 'mal-dl-hit' : 'mal-dl-miss'}>
                          {!match.release
                            ? t('malDownload.match.none')
                            : match.release.infoHash
                              && queuedHashes.has(match.release.infoHash.toLowerCase())
                              ? t('malDownload.match.queued')
                              : match.viaBatch
                                ? t('malDownload.match.batch')
                                : match.release.resolution || t('malDownload.match.found')}
                        </small>
                      ) : null}
                    </span>
                  </li>
                );
              })}
              {hiddenUnits > 0 ? (
                <li className="mal-dl-truncated">
                  {t('malDownload.truncated', { count: hiddenUnits })}
                </li>
              ) : null}
            </ul>
            )}
          </div>
        ) : null}

        <footer className="mal-dl-footer">
          <div className="mal-dl-summary" aria-live="polite">
            <strong>
              {pickingReleases
                ? t('malDownload.summary.picked', { count: sendable.length })
                : isManga
                  ? t('malDownload.summary.chapters', { count: summary.selected })
                  : t('malDownload.summary.episodes', { count: summary.selected })}
            </strong>
            {!pickingReleases && summary.firstNumber !== null && summary.selected > 1 ? (
              <span>
                {t('malDownload.summary.span', {
                  first: summary.firstNumber,
                  last: summary.lastNumber ?? summary.firstNumber,
                })}
              </span>
            ) : null}
            {!pickingReleases && summary.skipped > 0 ? (
              <span>{t('malDownload.summary.skipped', { count: summary.skipped })}</span>
            ) : null}
            {plan ? (
              <span className={plan.missing.length ? 'mal-dl-miss' : 'mal-dl-hit'}>
                {t('malDownload.summary.coverage', {
                  covered: plan.covered,
                  total: plan.matches.length,
                })}
                {' · '}
                {t('malDownload.summary.torrents', { count: plan.releases.length })}
              </span>
            ) : null}
            {releasesFound !== null ? (
              <span>{t('malDownload.summary.releasesFound', { count: releasesFound })}</span>
            ) : null}
            {progress ? (
              <span>
                {t('malDownload.progress', {
                  done: progress.done,
                  total: progress.total,
                  label: progress.label,
                })}
              </span>
            ) : null}
          </div>

          <div className="mal-dl-actions">
            {(plan || pickingReleases) && availableTargets.length > 1 ? (
              <label className="disc-field">
                <span>{t('malDownload.sendTo')}</span>
                <select
                  value={sendTarget}
                  disabled={busy}
                  onChange={(event) => setSendTarget(event.target.value as SendTarget)}
                >
                  {availableTargets.map((option) => (
                    <option key={option} value={option}>
                      {t(`malDownload.target.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {(plan || (pickingReleases && releases.length > 0)) && sendTarget !== 'qbittorrent' ? (
              <input
                className="scr-input mal-dl-destination"
                value={destination}
                disabled={busy}
                placeholder={t('malDownload.destinationPlaceholder')}
                aria-label={t('malDownload.destinationLabel')}
                onChange={(event) => setDestination(event.target.value)}
              />
            ) : null}

            {isManga && readerItem ? (
              <button
                type="button"
                className="disc-btn"
                onClick={() => setReading(true)}
              >
                <Icon name="library" size={12} />
                {t('malDownload.action.read')}
              </button>
            ) : null}

            {pickingReleases ? (
              <>
                <button
                  type="button"
                  className={`disc-btn ${releases.length ? '' : 'disc-btn-primary'}`}
                  disabled={busy || !query.trim()}
                  onClick={() => void findReleases()}
                >
                  <Icon name="search" size={12} />
                  {sendState === 'searching'
                    ? t('malDownload.action.searching')
                    : t('malDownload.action.findReleases')}
                </button>
                {releases.length > 0 ? (
                  <button
                    type="button"
                    className="disc-btn disc-btn-primary"
                    disabled={busy || !sendable.length || !availableTargets.length}
                    onClick={() => void sendReleases()}
                  >
                    <Icon name="download" size={12} />
                    {sendState === 'sending'
                      ? t('malDownload.action.sending')
                      : t('malDownload.action.send', { count: sendable.length })}
                  </button>
                ) : null}
              </>
            ) : isManga ? (
              <button
                type="button"
                className="disc-btn disc-btn-primary"
                disabled={busy || !selected.length}
                onClick={() => void downloadChapters()}
              >
                <Icon name="download" size={12} />
                {sendState === 'sending'
                  ? t('malDownload.action.downloading')
                  : t('malDownload.action.downloadChapters', { count: selected.length })}
              </button>
            ) : !plan ? (
              <button
                type="button"
                className="disc-btn disc-btn-primary"
                disabled={busy || !selected.length}
                onClick={() => void findReleases()}
              >
                <Icon name="search" size={12} />
                {sendState === 'searching'
                  ? t('malDownload.action.searching')
                  : t('malDownload.action.findReleases')}
              </button>
            ) : (
              <button
                type="button"
                className="disc-btn disc-btn-primary"
                disabled={busy || !sendable.length || !availableTargets.length}
                onClick={() => void sendReleases()}
              >
                <Icon name="download" size={12} />
                {sendState === 'sending'
                  ? t('malDownload.action.sending')
                  : t('malDownload.action.send', { count: sendable.length })}
              </button>
            )}
          </div>
        </footer>

        {/* The live region has to exist before its content arrives, or the
            message is not reliably announced. */}
        <p
          className={`mal-dl-message${sendState === 'error' ? ' reading-source-error' : ''}`}
          aria-live="polite"
          hidden={!footnote}
        >
          {footnote}
        </p>
        {progress?.failures.length ? (
          <details className="mal-dl-failures">
            <summary>{t('malDownload.failures', { count: progress.failures.length })}</summary>
            <ul>
              {progress.failures.map((failure) => <li key={failure}>{failure}</li>)}
            </ul>
          </details>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
