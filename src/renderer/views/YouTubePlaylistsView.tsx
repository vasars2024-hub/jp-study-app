/**
 * YouTube immersion playlist manager — metadata sync, selective download, open in Video.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icons';
import VirtualList from '../components/VirtualList';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import { AnchorSurface, ContextualSurface } from '../components/liquid/LiquidSurface';
import { useT } from '../i18n';
import { setStudyLang } from '../studyEnvironment';
import { openExtensionSettings, openLibraryInbox } from '../extensionBridgeUi';
import { firstReason } from '../../shared/disabledReason';
import {
  diffNewVideos,
  emptyYtStore,
  filterUnlogged,
  isImmersionPlaylist,
  isVideoUnlogged,
  normalizeYtStore,
  pickSurpriseVideo,
  planToWatchVideos,
  sortYtVideos,
  type YtPlaylist,
  type YtChannel,
  type YtPlaylistFolder,
  type YtPlaylistSort,
  type YtPlaylistsStore,
  type YtStudyLang,
  type YtSubLang,
  type YtSubscriptionStatus,
  type YtVideo,
} from '../../shared/ytPlaylists';
import { setHandoff } from '../pendingHandoff';

const ROW_H = 64;
const SUB_OPTS: YtSubLang[] = ['ja', 'zh', 'en', 'ru'];
const LANG_OPTS: YtStudyLang[] = ['ja', 'zh', 'en'];
const SORT_OPTS: YtPlaylistSort[] = ['playlist', 'views', 'date', 'title', 'unlogged'];
const SUB_STATUS_OPTS: YtSubscriptionStatus[] = ['subscribed', 'watching', 'custom', 'unsubscribed'];

type MainTab = 'news' | 'playlist';
type SideSelection = { kind: 'playlist'; id: string } | { kind: 'plan' };

function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatViews(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function openInVideoPlayer(mediaItemId: string, whisperLang?: YtStudyLang): void {
  if (whisperLang === 'ja' || whisperLang === 'zh') {
    setStudyLang(whisperLang);
  }
  try {
    setHandoff('mediaId', mediaItemId);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('os:open', { detail: 'video' }));
}

export default function YouTubePlaylistsView() {
  const { t, lang } = useT();
  const [store, setStore] = useState<YtPlaylistsStore>(() => emptyYtStore());
  const [side, setSide] = useState<SideSelection | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>('news');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [addUrl, setAddUrl] = useState('');
  const [folderName, setFolderName] = useState('');
  const [onlyUnlogged, setOnlyUnlogged] = useState(false);
  const [sort, setSort] = useState<YtPlaylistSort>('playlist');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [newsIds, setNewsIds] = useState<string[]>([]);
  const [dlProgress, setDlProgress] = useState<{
    videoId: string;
    index: number;
    total: number;
    percent: number;
    stage: string;
  } | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{
    index: number;
    total: number;
    title: string;
    stage: string;
  } | null>(null);
  const newsBootstrapped = useRef(false);

  const applyStore = useCallback((s: YtPlaylistsStore) => {
    setStore(normalizeYtStore(s));
    setError('');
  }, []);

  const folders = store.folders ?? [];
  const channels = store.channels ?? [];
  const playlists = store.playlists ?? [];
  const videos = store.videos ?? [];
  const planToWatchIds = store.planToWatchIds ?? [];

  const runNewsRefresh = useCallback(async (): Promise<void> => {
    setBusy(t('yt.news.checking'));
    setError('');
    setRefreshProgress({ index: 0, total: 1, title: '', stage: 'syncing' });
    try {
      const before = store.lastNewsCheckedAt ?? 0;
      const r = await window.api.ytRefreshAll();
      const nextStore = normalizeYtStore(r.store);
      applyStore(nextStore);
      const newIds = Array.isArray(r.newVideoIds) ? r.newVideoIds : [];
      setNewsIds(newIds.length ? newIds : diffNewVideos(nextStore, before).map((v) => v.id));
      const errors = Array.isArray(r.errors) ? r.errors : [];
      if (errors.length) {
        setError(
          t('yt.news.partialErrors', {
            count: errors.length,
            first: errors[0]?.error ?? '',
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
      setRefreshProgress(null);
    }
  }, [applyStore, store.lastNewsCheckedAt, t]);

  useEffect(() => {
    void window.api.ytList().then((s) => {
      const next = normalizeYtStore(s);
      setStore(next);
      const first = next.playlists.find(isImmersionPlaylist);
      setSide((prev) => prev ?? (first ? { kind: 'playlist', id: first.id } : null));
    });
    const off = window.api.onYtChanged((s) => setStore(normalizeYtStore(s)));
    const offDl = window.api.onYtDownloadProgress((p) =>
      setDlProgress({
        videoId: p.videoId,
        index: p.index,
        total: p.total,
        percent: p.percent,
        stage: p.stage,
      }),
    );
    const offRf = window.api.onYtRefreshProgress((p) => {
      if (p.stage === 'done') {
        setRefreshProgress(null);
        return;
      }
      setRefreshProgress({
        index: p.index,
        total: p.total,
        title: p.title,
        stage: p.stage,
      });
    });
    return () => {
      off();
      offDl();
      offRf();
    };
  }, []);

  useEffect(() => {
    if (newsBootstrapped.current) return;
    newsBootstrapped.current = true;
    setMainTab('news');
    void runNewsRefresh();
  }, []);

  const playlist = useMemo(() => {
    if (side?.kind !== 'playlist') return null;
    return playlists.find((p) => p.id === side.id) ?? null;
  }, [playlists, side]);

  useEffect(() => {
    if (playlist) setSort(playlist.sortDefault);
  }, [playlist?.id]);

  const planVideos = useMemo(() => planToWatchVideos(store), [store]);

  const displayedNews = useMemo(() => {
    const byId = new Map(videos.map((v) => [v.id, v]));
    if (newsIds.length) {
      return newsIds.map((id) => byId.get(id)).filter((v): v is YtVideo => !!v);
    }
    return [];
  }, [newsIds, videos]);

  const listVideos = useMemo(() => {
    if (side?.kind === 'plan') {
      return sortYtVideos(filterUnlogged(planVideos, onlyUnlogged), sort);
    }
    if (!playlist) return [];
    const list = videos.filter((v) => v.playlistId === playlist.id);
    return sortYtVideos(filterUnlogged(list, onlyUnlogged), sort);
  }, [videos, playlist, onlyUnlogged, sort, side, planVideos]);

  const unloggedCount = useMemo(() => {
    if (side?.kind === 'plan') return planVideos.filter(isVideoUnlogged).length;
    if (!playlist) return 0;
    return videos.filter((v) => v.playlistId === playlist.id && isVideoUnlogged(v)).length;
  }, [videos, playlist, side, planVideos]);

  const playlistTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of playlists) m.set(p.id, p.title);
    return m;
  }, [playlists]);

  const addPlaylist = async (): Promise<void> => {
    const url = addUrl.trim();
    if (!url) return;
    setBusy(t('yt.status.syncing'));
    setError('');
    const r = await window.api.ytAddPlaylist(url);
    setBusy('');
    if ('error' in r) {
      setError(r.error);
      return;
    }
    applyStore(r.store);
    setSide({ kind: 'playlist', id: r.playlist.id });
    setMainTab('playlist');
    setAddUrl('');
  };

  const refresh = async (): Promise<void> => {
    if (!playlist) return;
    setBusy(t('yt.status.syncing'));
    setError('');
    const r = await window.api.ytRefreshPlaylist(playlist.id);
    setBusy('');
    if ('error' in r) {
      setError(r.error);
      return;
    }
    applyStore(r.store);
  };

  const downloadIds = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    setBusy(t('yt.status.downloading'));
    setError('');
    const r = await window.api.ytDownloadVideos(ids);
    setBusy('');
    setDlProgress(null);
    applyStore(r.store);
    const fail = r.results.find((x) => !x.ok);
    if (fail?.error) setError(fail.error);
    setSelectedVideoIds(new Set());
  };

  const logSelected = async (): Promise<void> => {
    const ids = [...selectedVideoIds];
    if (!ids.length) return;
    await downloadIds(ids);
  };

  const downloadAll = async (): Promise<void> => {
    if (!playlist) return;
    const ids = videos
      .filter((v) => v.playlistId === playlist.id && !v.downloaded)
      .map((v) => v.id);
    if (!ids.length) return;
    if (!window.confirm(t('yt.confirm.downloadAll', { count: ids.length }))) return;
    await downloadIds(ids);
  };

  const addToPlan = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    applyStore(await window.api.ytAddToPlanToWatch(ids));
  };

  const removeFromPlan = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    applyStore(await window.api.ytRemoveFromPlanToWatch(ids));
  };

  const surpriseMe = (): void => {
    const pick = pickSurpriseVideo(store);
    if (!pick) {
      setError(t('yt.surprise.empty'));
      return;
    }
    const pl = playlists.find((p) => p.id === pick.playlistId);
    if (planToWatchIds.includes(pick.id)) setSide({ kind: 'plan' });
    else if (pl) setSide({ kind: 'playlist', id: pl.id });
    setMainTab('playlist');
    setSelectedVideoIds(new Set([pick.id]));
    setHighlightId(pick.id);
    setTimeout(() => setHighlightId(null), 2500);
  };

  const toggleSub = async (sub: YtSubLang): Promise<void> => {
    if (!playlist) return;
    const current = playlist.preferSubs ?? [];
    const next = current.includes(sub)
      ? current.filter((s) => s !== sub)
      : [...current, sub];
    const r = await window.api.ytSetPlaylistPrefs(playlist.id, { preferSubs: next.length ? next : [sub] });
    if ('error' in r) setError(r.error);
    else applyStore(r);
  };

  const setLang = async (studyLang: YtStudyLang): Promise<void> => {
    if (!playlist) return;
    const r = await window.api.ytSetPlaylistPrefs(playlist.id, { lang: studyLang });
    if ('error' in r) setError(r.error);
    else applyStore(r);
  };

  const setAutoUpdate = async (autoUpdate: boolean): Promise<void> => {
    if (!playlist) return;
    const r = await window.api.ytSetPlaylistPrefs(playlist.id, { autoUpdate });
    if ('error' in r) setError(r.error);
    else applyStore(r);
  };

  const setPlaylistField = async (patch: Parameters<typeof window.api.ytSetPlaylistPrefs>[1]): Promise<void> => {
    if (!playlist) return;
    const r = await window.api.ytSetPlaylistPrefs(playlist.id, patch);
    if ('error' in r) setError(r.error);
    else applyStore(r);
  };

  const setSortPref = async (sortDefault: YtPlaylistSort): Promise<void> => {
    setSort(sortDefault);
    if (!playlist) return;
    const r = await window.api.ytSetPlaylistPrefs(playlist.id, { sortDefault });
    if ('error' in r) setError(r.error);
    else applyStore(r);
  };

  const addFolder = async (): Promise<void> => {
    const name = folderName.trim();
    if (!name) return;
    const folder: YtPlaylistFolder = { id: `ytf-${Date.now()}`, name };
    applyStore(await window.api.ytSaveFolder(folder));
    setFolderName('');
  };

  const moveToFolder = async (folderId: string | null): Promise<void> => {
    if (!playlist) return;
    const r = await window.api.ytSetPlaylistPrefs(playlist.id, { folderId });
    if ('error' in r) setError(r.error);
    else applyStore(r);
  };

  const removePlaylist = async (): Promise<void> => {
    if (!playlist) return;
    if (!window.confirm(t('yt.confirm.removePlaylist'))) return;
    const r = await window.api.ytRemovePlaylist(playlist.id);
    applyStore(r);
    const first = r.playlists.find(isImmersionPlaylist);
    setSide(first ? { kind: 'playlist', id: first.id } : null);
  };

  const refreshChannel = async (): Promise<void> => {
    if (!playlist?.channelId) return;
    setBusy(t('yt.status.syncing'));
    setError('');
    const r = await window.api.ytRefreshChannel(playlist.channelId);
    setBusy('');
    if ('error' in r) {
      setError(r.error);
      return;
    }
    applyStore(r.store);
  };

  const toggleSelect = (id: string, multi: boolean): void => {
    setSelectedVideoIds((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRowActivate = (v: YtVideo): void => {
    if (v.downloaded && v.mediaItemId) {
      openInVideoPlayer(v.mediaItemId, playlist?.lang);
      return;
    }
    toggleSelect(v.id, true);
  };

  const playlistsByFolder = useMemo(() => {
    const immersion = playlists.filter(isImmersionPlaylist);
    const root = immersion.filter((p) => !p.folderId);
    const byFolder = new Map<string, YtPlaylist[]>();
    for (const f of folders) byFolder.set(f.id, []);
    for (const p of immersion) {
      if (!p.folderId) continue;
      const list = byFolder.get(p.folderId) ?? [];
      list.push(p);
      byFolder.set(p.folderId, list);
    }
    return { root, byFolder };
  }, [playlists, folders]);

  const menus: MenuBarMenu[] = useMemo(
    () => [
      {
        id: 'yt',
        label: t('yt.menu.playlist'),
        items: [
          { id: 'news', label: t('yt.news.refreshAll'), onSelect: () => void runNewsRefresh() },
          { id: 'surprise', label: t('yt.action.surprise'), onSelect: () => surpriseMe() },
          { id: 'refresh', label: t('yt.action.refresh'), onSelect: () => void refresh() },
          { id: 'plan-add', label: t('yt.plan.add'), onSelect: () => void addToPlan([...selectedVideoIds]) },
          { id: 'dl-sel', label: t('yt.action.downloadSelected'), onSelect: () => void logSelected() },
          { id: 'dl-all', label: t('yt.action.downloadAll'), onSelect: () => void downloadAll() },
          { id: 'remove', label: t('yt.action.remove'), onSelect: () => void removePlaylist() },
        ],
      },
    ],
    [t, lang, playlist, selectedVideoIds, store],
  );

  const renderPlaylistBtn = (p: YtPlaylist) => (
    <button
      key={p.id}
      type="button"
      className={`yt-pl-item${side?.kind === 'playlist' && side.id === p.id ? ' active' : ''}`}
      // The rail entry selects what the main pane shows, so it is `aria-current`
      // rather than `aria-pressed` — the same idiom as the games rail.
      aria-current={side?.kind === 'playlist' && side.id === p.id ? 'true' : undefined}
      onClick={() => {
        setSide({ kind: 'playlist', id: p.id });
        setMainTab('playlist');
        setSelectedVideoIds(new Set());
      }}
    >
      <span className="yt-pl-item-title">{p.title}</span>
      {p.channelTitle ? <span className="yt-pl-item-meta">{p.channelTitle}</span> : null}
    </button>
  );

  const channelById = useMemo(() => {
    const m = new Map<string, YtChannel>();
    for (const c of channels) m.set(c.channelId, c);
    return m;
  }, [channels]);

  // Rubric category 8, honest states. This surface had SIX disabled controls that said
  // nothing about why — the harness's `mutePairs` term — and every one of them guards on more
  // than one condition, so a fixed caption per button would name the wrong cause whenever the
  // other clause is the one biting. `firstReason` returns the first failing clause and the
  // call site spends the SAME expression as both `disabled` and `title`, so they cannot drift.
  // `busy` is already a translated status sentence, so it is the reason verbatim rather than a
  // second string that would have to be kept in step with it.
  const whyBusy = firstReason([!!busy, busy]);
  const whyAdd = firstReason([!!busy, busy], [!addUrl.trim(), t('yt.why.needUrl')]);
  const whyBatch = firstReason([!!busy, busy], [selectedVideoIds.size === 0, t('yt.why.needSelection')]);

  const renderVideoRow = (
    v: YtVideo,
    opts?: { showPlaylist?: boolean; planMode?: boolean; index?: number },
  ) => {
    const selected = selectedVideoIds.has(v.id);
    const inPlan = planToWatchIds.includes(v.id);
    const planLabel = opts?.planMode || inPlan ? t('yt.plan.remove') : t('yt.plan.add');
    const whyLog = firstReason([!!busy, busy], [v.downloaded, t('yt.why.alreadyLogged')]);
    // Order is precedence: "log it first" is the actionable cause, and a video with no local
    // file has nothing to open regardless of what the row's chips claim.
    const whyOpen = firstReason(
      [!v.downloaded, t('yt.why.notLogged')],
      [!v.mediaItemId, t('yt.why.noMedia')],
    );
    return (
      <div
        className={`yt-row${selected ? ' selected' : ''}${isVideoUnlogged(v) ? ' unlogged' : ''}${highlightId === v.id ? ' yt-row-highlight' : ''}`}
        // D91: this row was the only interactive thing on the surface that Tab could
        // not reach, and selecting a video is the ONLY writer of `selectedVideoIds` —
        // so `Log` and `Add to Plan to watch` were permanently disabled for a
        // keyboard-only user while telling them to "Select at least one video first".
        // `row` rather than `button`: the row contains three real action buttons, and a
        // `button` makes its children presentational, which would trade this defect for
        // three newly-unreachable controls. The list is a `grid` for the same reason.
        role="row"
        tabIndex={0}
        aria-selected={selected}
        aria-rowindex={opts?.index === undefined ? undefined : opts.index + 1}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) toggleSelect(v.id, true);
          else onRowActivate(v);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          // Only when the row itself has focus — otherwise Enter on a nested action
          // button would fire the button AND activate the row.
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          if (e.shiftKey || e.metaKey || e.ctrlKey) toggleSelect(v.id, true);
          else onRowActivate(v);
        }}
      >
        <img className="yt-thumb" src={v.thumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        <div className="yt-row-body">
          <div className="yt-row-title">{v.title}</div>
          <div className="yt-row-meta">
            {opts?.showPlaylist ? <span>{playlistTitleById.get(v.playlistId) ?? '—'}</span> : null}
            <span>{formatViews(v.viewCount)}</span>
            <span>{formatDuration(v.durationSec)}</span>
          </div>
        </div>
        <div className="yt-chips yt-status-chips">
          {isVideoUnlogged(v) ? <span className="yt-chip status new">{t('yt.chip.new')}</span> : null}
          {v.downloaded ? <span className="yt-chip status dl">{t('yt.chip.downloaded')}</span> : null}
          {v.hasOfficialSubs ? <span className="yt-chip status subs">{t('yt.chip.subs')}</span> : null}
          {v.transcribed ? <span className="yt-chip status tr">{t('yt.chip.transcribed')}</span> : null}
        </div>
        <div className="yt-row-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn ghost small"
            title={whyBusy ?? planLabel}
            disabled={!!whyBusy}
            onClick={() => void (opts?.planMode || inPlan ? removeFromPlan([v.id]) : addToPlan([v.id]))}
          >
            <Icon name="bookmark" size={14} />
          </button>
          <button
            type="button"
            className="btn ghost small"
            title={whyLog ?? t('yt.action.log')}
            disabled={!!whyLog}
            onClick={() => void downloadIds([v.id])}
          >
            <Icon name="download" size={14} />
          </button>
          <button
            type="button"
            className="btn ghost small"
            title={whyOpen ?? t('yt.action.open')}
            disabled={!!whyOpen}
            onClick={() => v.mediaItemId && openInVideoPlayer(v.mediaItemId, playlist?.lang)}
          >
            <Icon name="player" size={14} />
          </button>
        </div>
      </div>
    );
  };

  const dlVideoTitle = dlProgress
    ? videos.find((v) => v.id === dlProgress.videoId)?.title ?? ''
    : '';

  const showPlaylistPane = mainTab === 'playlist' && (side?.kind === 'plan' || !!playlist);
  const showEmptyPlaylist = mainTab === 'playlist' && side?.kind !== 'plan' && !playlist;

  return (
    <AppChrome
      menus={menus}
      status={
        <>
          <StatusBarField>{busy || t('yt.status.ready')}</StatusBarField>
          {showPlaylistPane ? (
            <StatusBarField>
              {t('yt.status.counts', { total: listVideos.length, unlogged: unloggedCount })}
            </StatusBarField>
          ) : null}
          {mainTab === 'news' ? (
            <StatusBarField>{t('yt.news.summary', { count: displayedNews.length })}</StatusBarField>
          ) : null}
          <StatusBarSpacer />
          {error ? <StatusBarField className="yt-status-err">{error}</StatusBarField> : null}
        </>
      }
    >
      {/* The wrapper exists only to be the query container. `.yt-root` is the grid whose
          columns have to change, and an element cannot answer a `@container` condition against
          itself — the same reason `.jiten-novels-shell` and `.os-set-body` are wrappers. A
          media query is wrong here: this lives in a floating window, so the OS viewport says
          1264 while the window is 260. */}
      {/* `lq-hit-scope`: rubric category 1 measured 54 of this surface's 84 controls under
          the 32px pointer floor — the row-action buttons at 22.5, the sub-language chips at
          21.5, the side links at 26.5 — and they arrive in families, so the floor goes on the
          container rather than on ~40 call sites. The expander is transparent and centred, so
          no chrome grows (category 4's dead region is what pays for growth). `select` and
          `input` are replaced elements the scope cannot reach; their floor is the `min-height`
          on `.yt-pref`, which is the label a pointer actually aims at. */}
      <div className="yt-shell">
        <div className="yt-root lq-hit-scope">
          {/* The playlist rail and the two headers are navigation and contextual tools, which
              §2.3 says is what Liquid is FOR. `ContextualSurface` declares the role and paints
              nothing until the window opts into Liquid, so the conventional window is unchanged
              and reversal costs no component state. Dense work does NOT go here: the playlist
              preference form moved out of the header onto its own anchor below. */}
          <ContextualSurface as="aside" className="yt-side">
            {/* The two field rows in the rail are forms, so they anchor rather than ride the
                rail's material — §2.3 keeps editing on stable opaque surfaces, and an input
                floating on glass is the exact case it names. `bare` because the rail already
                draws the box; the fill and radius restore below. */}
            <AnchorSurface bare className="yt-add">
              <input
                className="gram-search"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addPlaylist()}
                placeholder={t('yt.add.placeholder')}
                disabled={!!whyBusy}
                title={whyBusy}
              />
              <button
                type="button"
                className="btn small primary"
                disabled={!!whyAdd}
                title={whyAdd}
                onClick={() => void addPlaylist()}
              >
                {t('yt.add.submit')}
              </button>
            </AnchorSurface>
            {/* Progressive disclosure, and it is the rubric's own words rather than a
                preference: category 5 asks for at least one collapsed disclosure AND no more
                than 12 controls to scan in the default state, and this surface presented 29.
                Paste-a-URL stays out here because it is the rail's one obvious way in;
                extension pairing, the inbox, Surprise me and folder creation are setup and
                management, done rarely, and they are what buried it. Nothing is removed —
                `<details>` is a native, keyboard-reachable, reversible disclosure, and the
                panel remembers nothing, so it opens the same way every time. */}
            <details className="yt-side-tools">
              <summary>{t('yt.side.tools')}</summary>
              <div className="yt-side-tools-body">
                <p className="yt-hint">{t('yt.add.extensionHint')}</p>
                <div className="yt-side-links">
                  <button type="button" className="btn small" onClick={() => openExtensionSettings()}>
                    {t('yt.link.extension')}
                  </button>
                  <button type="button" className="btn small" onClick={() => openLibraryInbox()}>
                    {t('yt.link.inbox')}
                  </button>
                  <button type="button" className="btn small" disabled={!!whyBusy} title={whyBusy} onClick={() => surpriseMe()}>
                    {t('yt.action.surprise')}
                  </button>
                </div>

                <AnchorSurface bare className="yt-folder-add">
                  <input
                    className="gram-search"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void addFolder()}
                    placeholder={t('yt.folder.placeholder')}
                  />
                  {/* Icon-only, and `Icon` is aria-hidden — without a label the one control
                      that commits the name beside it announces as a bare "button". */}
                  <button
                    type="button"
                    className="btn small"
                    aria-label={t('yt.folder.create')}
                    title={t('yt.folder.create')}
                    onClick={() => void addFolder()}
                  >
                    <Icon name="folder" size={14} />
                  </button>
                </AnchorSurface>
              </div>
            </details>

            <div className="yt-tree">
              <button
                type="button"
                className={`yt-pl-item yt-plan-item${side?.kind === 'plan' ? ' active' : ''}`}
                aria-current={side?.kind === 'plan' ? 'true' : undefined}
                onClick={() => {
                  setSide({ kind: 'plan' });
                  setMainTab('playlist');
                  setSelectedVideoIds(new Set());
                }}
              >
                <span className="yt-pl-item-title">{t('yt.plan.title')}</span>
                <span className="yt-pl-item-meta">{planVideos.length}</span>
              </button>

              {folders.map((f) => (
                <div key={f.id} className="yt-folder">
                  <div className="yt-folder-head">
                    <Icon name="folder" size={14} />
                    <span>{f.name}</span>
                    <button
                      type="button"
                      className="btn ghost small"
                      title={t('yt.folder.delete')}
                      // D93: this deleted the folder — and every folder nested inside it,
                      // which `ytPlaylists.ts:536` does silently — on a single click with
                      // no confirm and no undo. Its two destructive siblings in this file
                      // (`removePlaylist`, `downloadAll`) both guard with `window.confirm`,
                      // so this uses the same idiom and names what will be lost.
                      onClick={() => {
                        const affected = (playlistsByFolder.byFolder.get(f.id) ?? []).length;
                        if (!window.confirm(t('yt.confirm.deleteFolder', { name: f.name, count: affected }))) return;
                        void window.api.ytDeleteFolder(f.id).then(applyStore);
                      }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                  {(playlistsByFolder.byFolder.get(f.id) ?? []).map(renderPlaylistBtn)}
                </div>
              ))}
              <div className="yt-folder">
                <div className="yt-folder-head">
                  <span>{t('yt.folder.unfiled')}</span>
                </div>
                {playlistsByFolder.root.map(renderPlaylistBtn)}
              </div>
            </div>
          </ContextualSurface>

          <section className="yt-main">
            <div className="yt-tabs">
              <button
                type="button"
                className={`yt-tab${mainTab === 'news' ? ' active' : ''}`}
                aria-pressed={mainTab === 'news'}
                onClick={() => setMainTab('news')}
              >
                {t('yt.tab.news')}
              </button>
              <button
                type="button"
                className={`yt-tab${mainTab === 'playlist' ? ' active' : ''}`}
                aria-pressed={mainTab === 'playlist'}
                onClick={() => setMainTab('playlist')}
              >
                {side?.kind === 'plan' ? t('yt.plan.title') : t('yt.tab.playlist')}
              </button>
            </div>

            {(dlProgress || refreshProgress) && (
              <div className="yt-download-bar" role="status">
                {dlProgress ? (
                  <>
                    <div className="yt-download-bar-meta">
                      <span>
                        {t('yt.download.bar', {
                          current: dlProgress.index + 1,
                          total: dlProgress.total,
                          percent: Math.round(dlProgress.percent),
                        })}
                      </span>
                      <span className="yt-download-bar-title">{dlVideoTitle}</span>
                    </div>
                    <div className="yt-download-track">
                      <div
                        className="yt-download-fill"
                        style={{ width: `${Math.min(100, Math.max(0, dlProgress.percent))}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="yt-download-bar-meta">
                      <span>
                        {t('yt.news.refreshProgress', {
                          current: Math.min(
                            (refreshProgress?.index ?? 0) + 1,
                            refreshProgress?.total || 1,
                          ),
                          total: refreshProgress?.total || 1,
                        })}
                      </span>
                      <span className="yt-download-bar-title">{refreshProgress?.title}</span>
                    </div>
                    <div className="yt-download-track">
                      <div
                        className="yt-download-fill"
                        style={{
                          width: `${
                            refreshProgress?.total
                              ? Math.round(
                                  (((refreshProgress.index ?? 0) + 0.35) / refreshProgress.total) * 100,
                                )
                              : 10
                          }%`,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {mainTab === 'news' ? (
              <>
                <ContextualSurface as="header" className="yt-header">
                  <div className="yt-header-top">
                    <div className="yt-header-titles">
                      <div className="yt-header-title">{t('yt.tab.news')}</div>
                      <div className="yt-header-channel">
                        {store.lastNewsCheckedAt
                          ? t('yt.news.lastChecked', {
                              time: new Date(store.lastNewsCheckedAt).toLocaleString(),
                            })
                          : t('yt.news.neverChecked')}
                      </div>
                    </div>
                    <div className="yt-header-actions">
                      <button
                        type="button"
                        className="btn small"
                        disabled={!!whyBusy}
                        title={whyBusy}
                        onClick={() => void runNewsRefresh()}
                      >
                        <Icon name="refresh" size={14} /> {t('yt.news.refreshAll')}
                      </button>
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={!!whyBatch}
                        title={whyBatch}
                        onClick={() => void addToPlan([...selectedVideoIds])}
                      >
                        {t('yt.plan.add')}
                      </button>
                    </div>
                  </div>
                </ContextualSurface>
                <VirtualList
                  className="yt-list"
                  items={displayedNews}
                  itemHeight={ROW_H}
                  getKey={(v) => v.id}
                  gridRole="grid"
                  ariaRowCount={displayedNews.length}
                  emptyState={<div className="yt-empty">{t('yt.news.empty')}</div>}
                  renderItem={(v, index) => renderVideoRow(v, { showPlaylist: true, index })}
                />
              </>
            ) : showEmptyPlaylist ? (
              <div className="yt-empty">{t('yt.empty')}</div>
            ) : showPlaylistPane ? (
              <>
                <ContextualSurface as="header" className="yt-header">
                  <div className="yt-header-top">
                    <div className="yt-header-titles">
                      <div className="yt-header-title">
                        {side?.kind === 'plan' ? t('yt.plan.title') : playlist?.title ?? ''}
                      </div>
                      {side?.kind === 'playlist' && playlist?.channelTitle ? (
                        <div className="yt-header-channel">{playlist.channelTitle}</div>
                      ) : side?.kind === 'plan' ? (
                        <div className="yt-header-channel">{t('yt.plan.subtitle')}</div>
                      ) : null}
                    </div>
                    <div className="yt-header-actions">
                      {side?.kind === 'playlist' ? (
                        <button
                          type="button"
                          className="btn small"
                          disabled={!!whyBusy}
                          title={whyBusy}
                          onClick={() => void refresh()}
                        >
                          <Icon name="refresh" size={14} /> {t('yt.action.refresh')}
                        </button>
                      ) : null}
                      {side?.kind === 'playlist' && playlist?.channelId ? (
                        <button
                          type="button"
                          className="btn small"
                          disabled={!!whyBusy}
                          title={whyBusy}
                          onClick={() => void refreshChannel()}
                        >
                          <Icon name="refresh" size={14} /> Channel
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={!!whyBatch}
                        title={whyBatch}
                        onClick={() => void logSelected()}
                      >
                        <Icon name="download" size={14} /> {t('yt.action.log')}
                      </button>
                      {side?.kind === 'playlist' ? (
                        <button
                          type="button"
                          className="btn small"
                          disabled={!!whyBusy}
                          title={whyBusy}
                          onClick={() => void downloadAll()}
                        >
                          {t('yt.action.downloadAll')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn small"
                        disabled={!!whyBatch}
                        title={whyBatch}
                        onClick={() =>
                          void (side?.kind === 'plan'
                            ? removeFromPlan([...selectedVideoIds])
                            : addToPlan([...selectedVideoIds]))
                        }
                      >
                        {side?.kind === 'plan' ? t('yt.plan.remove') : t('yt.plan.add')}
                      </button>
                    </div>
                  </div>
                </ContextualSurface>

                {side?.kind === 'playlist' && playlist ? (
                  <AnchorSurface bare className="yt-prefs">
                    {/* Fourteen controls that configure a playlist once and are then read
                        rather than used. They sat between the header and the video list in
                        the default state, which is category 5's clutter term exactly. The
                        anchor stays where it is so category 3's "dense work on an opaque
                        surface" is unchanged; only the default openness moves. */}
                    <details className="yt-prefs-disclosure">
                      <summary>{t('yt.prefs.summary')}</summary>
                      <div className="yt-prefs-body">
                    {playlist.channelId ? (
                      <div className="yt-pref yt-channel-card">
                        <span>Channel tracking</span>
                        <div className="yt-channel-card-body">
                          <div>{channelById.get(playlist.channelId)?.title ?? playlist.channelTitle ?? playlist.channelId}</div>
                          <div>{playlist.subscriptionStatus}</div>
                          <div>{channelById.get(playlist.channelId)?.videoCount ?? 0} videos tracked</div>
                        </div>
                      </div>
                    ) : null}
                    <label className="yt-pref">
                      <span>{t('yt.pref.lang')}</span>
                      <select
                        value={playlist.lang}
                        onChange={(e) => void setLang(e.target.value as YtStudyLang)}
                      >
                        {LANG_OPTS.map((l) => (
                          <option key={l} value={l}>
                            {t(`yt.lang.${l}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="yt-pref">
                      <span>{t('yt.pref.subs')}</span>
                      <div className="yt-chips">
                        {SUB_OPTS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`yt-chip${(playlist.preferSubs ?? []).includes(s) ? ' active' : ''}`}
                            aria-pressed={(playlist.preferSubs ?? []).includes(s)}
                            onClick={() => void toggleSub(s)}
                          >
                            {s.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="yt-pref yt-pref-check">
                      <input
                        type="checkbox"
                        checked={playlist.autoUpdate}
                        onChange={(e) => void setAutoUpdate(e.target.checked)}
                      />
                      {t('yt.pref.autoUpdate')}
                    </label>
                    <label className="yt-pref">
                      <span>Channel id</span>
                      <input
                        value={playlist.channelId ?? ''}
                        onChange={(e) => void setPlaylistField({ channelId: e.currentTarget.value })}
                        placeholder="UC..."
                      />
                    </label>
                    <label className="yt-pref">
                      <span>Channel title</span>
                      <input
                        value={playlist.channelTitle ?? ''}
                        onChange={(e) => void setPlaylistField({ channelTitle: e.currentTarget.value })}
                        placeholder="Channel name"
                      />
                    </label>
                    <label className="yt-pref">
                      <span>Channel icon URL</span>
                      <input
                        value={playlist.channelIconUrl ?? ''}
                        onChange={(e) => void setPlaylistField({ channelIconUrl: e.currentTarget.value })}
                        placeholder="https://..."
                      />
                    </label>
                    <label className="yt-pref">
                      <span>Subscription status</span>
                      <select
                        value={playlist.subscriptionStatus}
                        onChange={(e) =>
                          void setPlaylistField({
                            subscriptionStatus: e.currentTarget.value as YtSubscriptionStatus,
                          })
                        }
                      >
                        {SUB_STATUS_OPTS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="yt-pref">
                      <span>Update frequency (hours)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={playlist.updateFrequencyHours}
                        onChange={(e) =>
                          void setPlaylistField({ updateFrequencyHours: Number(e.currentTarget.value) })
                        }
                      />
                    </label>
                    <label className="yt-pref">
                      <span>{t('yt.pref.folder')}</span>
                      <select
                        value={playlist.folderId ?? ''}
                        onChange={(e) => void moveToFolder(e.target.value || null)}
                      >
                        <option value="">{t('yt.folder.unfiled')}</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="yt-pref">
                      <span>{t('yt.pref.sort')}</span>
                      <select
                        value={sort}
                        onChange={(e) => void setSortPref(e.target.value as YtPlaylistSort)}
                      >
                        {SORT_OPTS.map((s) => (
                          <option key={s} value={s}>
                            {t(`yt.sort.${s}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="yt-pref yt-pref-check">
                      <input
                        type="checkbox"
                        checked={onlyUnlogged}
                        onChange={(e) => setOnlyUnlogged(e.target.checked)}
                      />
                      {t('yt.pref.unloggedOnly')}
                    </label>
                      </div>
                    </details>
                  </AnchorSurface>
                ) : null}

                <VirtualList
                  className="yt-list"
                  items={listVideos}
                  itemHeight={ROW_H}
                  getKey={(v) => v.id}
                  gridRole="grid"
                  ariaRowCount={listVideos.length}
                  emptyState={
                    <div className="yt-empty">
                      {side?.kind === 'plan' ? t('yt.plan.empty') : t('yt.list.empty')}
                    </div>
                  }
                  renderItem={(v, index) =>
                    renderVideoRow(v, {
                      planMode: side?.kind === 'plan',
                      showPlaylist: side?.kind === 'plan',
                      index,
                    })
                  }
                />
              </>
            ) : null}
          </section>
        </div>
      </div>
    </AppChrome>
  );
}
