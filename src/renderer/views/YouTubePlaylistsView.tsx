/**
 * YouTube immersion playlist manager — metadata sync, selective download, open in Video.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icons';
import VirtualList from '../components/VirtualList';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import { useT } from '../i18n';
import { setStudyLang } from '../studyEnvironment';
import { openExtensionSettings, openLibraryInbox } from '../extensionBridgeUi';
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

  const renderVideoRow = (v: YtVideo, opts?: { showPlaylist?: boolean; planMode?: boolean }) => {
    const selected = selectedVideoIds.has(v.id);
    const inPlan = planToWatchIds.includes(v.id);
    return (
      <div
        className={`yt-row${selected ? ' selected' : ''}${isVideoUnlogged(v) ? ' unlogged' : ''}${highlightId === v.id ? ' yt-row-highlight' : ''}`}
        onClick={(e) => {
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
            title={opts?.planMode || inPlan ? t('yt.plan.remove') : t('yt.plan.add')}
            disabled={!!busy}
            onClick={() => void (opts?.planMode || inPlan ? removeFromPlan([v.id]) : addToPlan([v.id]))}
          >
            <Icon name="bookmark" size={14} />
          </button>
          <button
            type="button"
            className="btn ghost small"
            title={t('yt.action.log')}
            disabled={!!busy || v.downloaded}
            onClick={() => void downloadIds([v.id])}
          >
            <Icon name="download" size={14} />
          </button>
          <button
            type="button"
            className="btn ghost small"
            title={t('yt.action.open')}
            disabled={!v.downloaded || !v.mediaItemId}
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
      <div className="yt-root">
        <aside className="yt-side">
          <div className="yt-add">
            <input
              className="gram-search"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addPlaylist()}
              placeholder={t('yt.add.placeholder')}
              disabled={!!busy}
            />
            <button
              type="button"
              className="btn small primary"
              disabled={!!busy || !addUrl.trim()}
              onClick={() => void addPlaylist()}
            >
              {t('yt.add.submit')}
            </button>
          </div>
          <p className="yt-hint">{t('yt.add.extensionHint')}</p>
          <div className="yt-side-links" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className="btn small" onClick={() => openExtensionSettings()}>
              {t('yt.link.extension')}
            </button>
            <button type="button" className="btn small" onClick={() => openLibraryInbox()}>
              {t('yt.link.inbox')}
            </button>
            <button type="button" className="btn small" disabled={!!busy} onClick={() => surpriseMe()}>
              {t('yt.action.surprise')}
            </button>
          </div>

          <div className="yt-folder-add">
            <input
              className="gram-search"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addFolder()}
              placeholder={t('yt.folder.placeholder')}
            />
            <button type="button" className="btn small" onClick={() => void addFolder()}>
              <Icon name="folder" size={14} />
            </button>
          </div>

          <div className="yt-tree">
            <button
              type="button"
              className={`yt-pl-item yt-plan-item${side?.kind === 'plan' ? ' active' : ''}`}
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
                    onClick={() => void window.api.ytDeleteFolder(f.id).then(applyStore)}
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
        </aside>

        <section className="yt-main">
          <div className="yt-tabs">
            <button
              type="button"
              className={`yt-tab${mainTab === 'news' ? ' active' : ''}`}
              onClick={() => setMainTab('news')}
            >
              {t('yt.tab.news')}
            </button>
            <button
              type="button"
              className={`yt-tab${mainTab === 'playlist' ? ' active' : ''}`}
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
              <header className="yt-header">
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
                      disabled={!!busy}
                      onClick={() => void runNewsRefresh()}
                    >
                      <Icon name="refresh" size={14} /> {t('yt.news.refreshAll')}
                    </button>
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={!!busy || selectedVideoIds.size === 0}
                      onClick={() => void addToPlan([...selectedVideoIds])}
                    >
                      {t('yt.plan.add')}
                    </button>
                  </div>
                </div>
              </header>
              <VirtualList
                className="yt-list"
                items={displayedNews}
                itemHeight={ROW_H}
                getKey={(v) => v.id}
                emptyState={<div className="yt-empty">{t('yt.news.empty')}</div>}
                renderItem={(v) => renderVideoRow(v, { showPlaylist: true })}
              />
            </>
          ) : showEmptyPlaylist ? (
            <div className="yt-empty">{t('yt.empty')}</div>
          ) : showPlaylistPane ? (
            <>
              <header className="yt-header">
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
                        disabled={!!busy}
                        onClick={() => void refresh()}
                      >
                        <Icon name="refresh" size={14} /> {t('yt.action.refresh')}
                      </button>
                    ) : null}
                    {side?.kind === 'playlist' && playlist?.channelId ? (
                      <button
                        type="button"
                        className="btn small"
                        disabled={!!busy}
                        onClick={() => void refreshChannel()}
                      >
                        <Icon name="refresh" size={14} /> Channel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={!!busy || selectedVideoIds.size === 0}
                      onClick={() => void logSelected()}
                    >
                      <Icon name="download" size={14} /> {t('yt.action.log')}
                    </button>
                    {side?.kind === 'playlist' ? (
                      <button
                        type="button"
                        className="btn small"
                        disabled={!!busy}
                        onClick={() => void downloadAll()}
                      >
                        {t('yt.action.downloadAll')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn small"
                      disabled={!!busy || selectedVideoIds.size === 0}
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

                {side?.kind === 'playlist' && playlist ? (
                  <div className="yt-prefs">
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
                ) : null}
              </header>

              <VirtualList
                className="yt-list"
                items={listVideos}
                itemHeight={ROW_H}
                getKey={(v) => v.id}
                emptyState={
                  <div className="yt-empty">
                    {side?.kind === 'plan' ? t('yt.plan.empty') : t('yt.list.empty')}
                  </div>
                }
                renderItem={(v) =>
                  renderVideoRow(v, {
                    planMode: side?.kind === 'plan',
                    showPlaylist: side?.kind === 'plan',
                  })
                }
              />
            </>
          ) : null}
        </section>
      </div>
    </AppChrome>
  );
}
