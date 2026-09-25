import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MediaItem } from '../../shared/types';
import { MEDIA_STUDY_EVENT } from '../../shared/mediaStudyIntegration';
import Icon, { type IconName } from '../components/Icons';
import {
  GlobalSearchField,
  GLOBAL_SEARCH_COMMIT_MS,
  useStableCallback,
} from './GlobalSearchField';
import { AnchorSurface, ContextualSurface } from '../components/liquid/LiquidSurface';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  useWiredMaterials,
  type MenuBarMenu,
} from '../components/ui';
import {
  MediaGenerationStatus,
  MediaLookupPopup,
  MediaTranscriptionControls,
  MediaWatchFolder,
  MediaYoutubeBar,
  useMedia,
  malUrl,
  type MediaState,
} from '../components/media/MediaContent';
import SeanimeStudyLibraryPanel from '../components/reading/SeanimeStudyLibraryPanel';
import SeanimeWatchLoopPanel from '../components/reading/SeanimeWatchLoopPanel';
import { onMediaCenterIntent, onMediaCenterPlay, takeMediaCenterIntent, takeMediaCenterPlay } from '../mediaCenterIntent';
import { useStudyReadiness } from '../useStudyReadiness';
import MediaLibraryShell from '../components/media/library/MediaLibraryShell';
import MediaArtwork from '../components/media/library/MediaArtwork';
import MediaStudyMode from '../components/media/MediaStudyMode';
import StudyOrchestratorWorkspace from '../components/media/StudyOrchestratorWorkspace';
import { useLegacyStudyMediaSurface } from '../components/media/legacyStudyMediaSurface';
import { orderUpNext, isStarted } from '../components/media/upNext';
import {
  continueWatchingOpenRequest,
  mediaEpisodeBadge,
  useContinueWatchingRows,
  type ContinueWatchingRow,
} from '../components/media/ContinueWatchingShelf';
import GumHome, { type GumBrowseRequest } from '../components/media/gum/GumHome';
import GumLibrary from '../components/media/gum/GumLibrary';
import GumTitlePage from '../components/media/gum/GumTitlePage';
import GumImport from '../components/media/gum/GumImport';
import GumDownloads from '../components/media/gum/GumDownloads';
import GumArrivalToast from '../components/media/gum/GumArrivalToast';
import GumPopover from '../components/media/gum/GumPopover';
import GumIcon from '../components/media/gum/GumIcons';
import { buildGumTitles, nextEpisodeOf, type GumTitle } from '../components/media/gum/gumModel';
import {
  useArrivals,
  useIngestState,
  useWatchLibrary,
} from '../components/media/gum/gumBackend';
import { useHomeLayout, useLibraryPrefs, useSavedViews } from '../components/media/gum/useGumPrefs';
import { useGumRoutePersistence } from '../components/media/gum/gumRoute';
import { fitTopNav } from '../components/media/gum/gumTopNav';
import '../components/media/gum/gum.css';
import MalDownloadDialog from '../components/discover/MalDownloadDialog';
import { isWatched, type LibraryEntry } from '../../shared/mediaLibraryEntries';
import { navigateScraperShell } from '../scraperShellStore';
import { openSectionSurface } from '../sectionSurface';
import { studyPlaybackPosition } from '../../shared/studyMediaSurface';
import { dispatchMediaStudyAction } from '../components/media/MediaStudyActions';
import {
  DiscoveryControls,
  DiscoveryInspector,
  DiscoveryResults,
  DiscoveryTabs,
  useDiscovery,
  type DiscoveryState,
} from '../components/discover/DiscoverContent';
import type { DiscoveryCandidate, DiscoveryFeedProvenance } from '../../shared/mediaDiscovery';
import { loadExternalPlayerPreferences } from '../externalPlayerStore';
import { loadVideoServerProfilesDocument } from '../videoServerProfilesStore';
import { isLiked, toggleLiked } from '../likedSongs';
import {
  MusicLyricsPane,
  MusicNowPlaying,
  MusicSearchBox,
  MusicSongList,
  MusicYoutubeRow,
  fmt,
  toggleUseAlbumInSearch,
  useMusic,
  type MusicState,
} from '../components/music/MusicContent';
import { useT } from '../i18n';
import { openMediaWorkspace } from '../mediaWorkspaceBridge';
import {
  subtitleChoiceDestination,
  useMediaWorkspaceAvailability,
  videoStageFor,
  type MediaWorkspaceAvailability,
} from '../mediaWorkspaceAvailability';
import {
  mediaWorkspaceHostExists,
  type MediaWorkspaceOpenRequest,
  type StudyReviewFocusRequest,
} from '../../shared/mediaWorkspace';
import * as player from '../playerBus';
import {
  videoGenerateDisabledReason,
  videoSubtitlesDisabledReason,
} from '../../shared/mediaVideoActionReason';
import {
  subtitleSweepWentNowhere,
  type SubtitleProviderCredentialState,
} from '../../shared/subtitleDiscoveryIpc';
import { showToast } from '../components/ui';
import './mediaCenter.css';

export type MediaCenterTab =
  | 'home'
  | 'library'
  | 'downloads'
  | 'title'
  | 'import'
  | 'files'
  | 'video'
  | 'music'
  | 'study'
  | 'readiness'
  | 'review'
  | 'discover'
  | 'settings';

interface MediaCenterViewProps {
  initialTab?: MediaCenterTab;
}

type OpenSeanimeWorkspace = (request?: MediaWorkspaceOpenRequest) => boolean;

const NAV: Array<{ id: MediaCenterTab; labelKey: string; icon: IconName; hintKey: string }> = [
  { id: 'home', labelKey: 'mediaCenter.nav.home', icon: 'app', hintKey: 'mediaCenter.nav.homeHint' },
  { id: 'library', labelKey: 'mediaCenter.nav.library', icon: 'library', hintKey: 'gum.nav.libraryHint' },
  { id: 'downloads', labelKey: 'gum.nav.downloads', icon: 'download', hintKey: 'gum.nav.downloadsHint' },
  { id: 'discover', labelKey: 'mediaCenter.nav.discover', icon: 'globe', hintKey: 'mediaCenter.nav.discoverHint' },
  { id: 'music', labelKey: 'mediaCenter.nav.music', icon: 'music', hintKey: 'mediaCenter.nav.musicHint' },
  { id: 'video', labelKey: 'mediaCenter.nav.video', icon: 'video', hintKey: 'mediaCenter.nav.videoHint' },
  { id: 'study', labelKey: 'mediaCenter.nav.study', icon: 'sparkle', hintKey: 'mediaCenter.nav.studyHint' },
  /*
    Readiness and Review existed only inside the adopted workspace overlay, which covers this
    shell entirely — so the shell that owns Media navigation could not reach two of its own
    destinations. They sit after Study because the three are one arc: prepare, watch, come back.

    Their labels are the overlay's own keys, deliberately: the same destination reached from
    two shells must not be called two things, and reusing them adds no key to translate. The
    hints are each panel's own headline, for the same reason.

    Neither panel needs the media server. `SeanimeStudyLibraryPanel` reads
    `window.api.seanimeStudyLibrary()` plus the local library, and `SeanimeWatchLoopPanel`
    reads mining history and Anki — which is why the overlay already renders Review outside
    its own sidecar gate.
  */
  { id: 'readiness', labelKey: 'mediaWorkspace.viewReadiness', icon: 'check', hintKey: 'studyLibrary.title' },
  { id: 'review', labelKey: 'mediaWorkspace.viewReview', icon: 'repeat', hintKey: 'studyLoop.eyebrow' },
  // Every file, audio included, with the per-file tools — the previous library, kept whole.
  { id: 'files', labelKey: 'gum.nav.files', icon: 'folder', hintKey: 'gum.nav.filesHint' },
  { id: 'import', labelKey: 'gum.nav.import', icon: 'download', hintKey: 'gum.nav.importHint' },
  { id: 'settings', labelKey: 'mediaCenter.nav.settings', icon: 'settings', hintKey: 'mediaCenter.nav.settingsHint' },
];

/**
 * The top bar shows the four places a viewer goes (the approved design's Home · Library ·
 * Downloads · Discover); everything else — Music, the Video study player, Study, Readiness,
 * Review, All files, Import, Media settings — sits in one "More" menu. Disclosure, not
 * removal: `Ctrl+1..9` still reach the first nine `NAV` entries whatever is open, because the
 * shortcut is a root `keydown` handler that indexes `NAV` directly.
 */
const PRIMARY_NAV: MediaCenterTab[] = ['home', 'library', 'downloads', 'discover'];
const SECONDARY_NAV: MediaCenterTab[] = ['music', 'video', 'study', 'readiness', 'review', 'files', 'import', 'settings'];

/**
 * The apps downstream of the Media Center — the ones that receive what mining
 * an episode produces. Module-level, so the labels are i18n *keys* resolved at
 * render time rather than strings frozen at module evaluation.
 */
const STUDY_HANDOFFS: Array<{ app: string; labelKey: string; hintKey: string; icon: IconName }> = [
  { app: 'files', labelKey: 'mediaCenter.home.handoffFiles', hintKey: 'mediaCenter.home.handoffFilesHint', icon: 'folder' },
  { app: 'anki', labelKey: 'mediaCenter.home.handoffAnki', hintKey: 'mediaCenter.home.handoffAnkiHint', icon: 'anki' },
  { app: 'stats', labelKey: 'mediaCenter.home.handoffStats', hintKey: 'mediaCenter.home.handoffStatsHint', icon: 'chart-bar' },
];

function mediaKindLabel(item: MediaItem): string {
  if (item.kind === 'audio' || item.kind === 'audiobook') return 'Audio';
  if (item.category === 'movie') return 'Movie';
  if (item.episode != null) return `Episode ${item.episode}`;
  return item.format ?? 'Video';
}

function progress(item: MediaItem): number {
  if (!item.durationSec || !item.positionSec) return 0;
  return Math.max(0, Math.min(100, Math.round((item.positionSec / item.durationSec) * 100)));
}

function itemSubtitle(item: MediaItem): string {
  return [
    item.seriesTitle && item.seriesTitle !== item.title ? item.seriesTitle : null,
    item.artist,
    item.year,
    item.jlptLevel,
  ].filter(Boolean).join(' · ') || mediaKindLabel(item);
}

function openSettings(): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: 'settings' }));
}

/**
 * Open Settings *at* a specific card rather than at the top of the app.
 *
 * A row labelled "Subtitle providers" that dumps you at the front of Settings is
 * technically a working action and practically a dead end. The Settings app
 * already listens for `settings:navigate` (the extension bridge and the companion
 * menu both use it); the short delay is what those callers use too, so the
 * listener exists by the time the event fires.
 */
function openSettingsAt(page: 'scraper' | 'api-keys', settingId?: string): void {
  openSettings();
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page, settingId } }));
  }, 80);
}

/**
 * The Scraper's Torrent Manager — where transfers (qBittorrent) and torrent search live.
 * The shell state is written before the section opens, the same order
 * `openScraperSettings` documents, so a cold Scraper mount still lands on the page.
 */
function openTorrentManager(): void {
  navigateScraperShell('torrents');
  openSectionSurface('scraper');
}

type NetworkSubtitleProviderId = 'jimaku' | 'opensubtitles';

const NETWORK_SUBTITLE_PROVIDER_IDS: NetworkSubtitleProviderId[] = ['jimaku', 'opensubtitles'];
const SUBTITLE_PROVIDER_KEY_URLS: Record<NetworkSubtitleProviderId, string> = {
  jimaku: 'https://jimaku.cc/login',
  opensubtitles: 'https://www.opensubtitles.com/consumers',
};

/**
 * Keeps the credentials required by Media Library discovery beside the action
 * that uses them. Keys still cross the preload bridge directly into encrypted
 * main-process storage; this surface only receives the has-key flags back.
 */
function SubtitleProviderQuickSetup() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState<SubtitleProviderCredentialState[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<NetworkSubtitleProviderId, string>>>({});
  const [busy, setBusy] = useState<NetworkSubtitleProviderId | null>(null);
  const [results, setResults] = useState<Partial<Record<NetworkSubtitleProviderId, { ok: boolean; detail?: string }>>>({});
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void window.api.subtitleProviderCredentials()
      .then((next) => {
        if (active) setCredentials(next);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const credentialFor = (id: NetworkSubtitleProviderId) =>
    credentials.find((credential) => credential.id === id);
  const configuredCount = NETWORK_SUBTITLE_PROVIDER_IDS.filter((id) => credentialFor(id)?.hasKey).length;

  const saveKey = async (id: NetworkSubtitleProviderId): Promise<void> => {
    setBusy(id);
    setResults((current) => ({ ...current, [id]: undefined }));
    try {
      const next = await window.api.setSubtitleProviderKey(id, drafts[id] ?? '');
      setCredentials(next);
      setDrafts((current) => ({ ...current, [id]: '' }));
      setLoadFailed(false);
    } catch {
      setResults((current) => ({ ...current, [id]: { ok: false, detail: 'error' } }));
    } finally {
      setBusy(null);
    }
  };

  const testProvider = async (id: NetworkSubtitleProviderId): Promise<void> => {
    setBusy(id);
    try {
      const result = await window.api.testSubtitleProvider(id);
      setResults((current) => ({ ...current, [id]: result }));
    } catch {
      setResults((current) => ({ ...current, [id]: { ok: false, detail: 'error' } }));
    } finally {
      setBusy(null);
    }
  };

  const testMessage = (result: { ok: boolean; detail?: string }): string => {
    if (result.ok) return t('subtitle.testOk');
    const detail = result.detail === 'no-key' || result.detail === 'unreachable'
      ? result.detail
      : 'error';
    return t(`subtitle.testFail.${detail}`);
  };

  return (
    <div className={`mc-subtitle-provider-setup${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="mc-source-row"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`mc-source-dot${configuredCount < NETWORK_SUBTITLE_PROVIDER_IDS.length ? ' is-warning' : ''}`} />
        <div>
          <strong>{t('mediaCenter.settings.subtitleProviders')}</strong>
          <small>{t('mediaCenter.settings.subtitleProvidersDetail')}</small>
        </div>
        <em>{configuredCount} / {NETWORK_SUBTITLE_PROVIDER_IDS.length}</em>
        <Icon name="chevron" size={11} />
      </button>

      {open && (
        <div className="mc-subtitle-provider-panel">
          {NETWORK_SUBTITLE_PROVIDER_IDS.map((id) => {
            const credential = credentialFor(id);
            const hasKey = credential?.hasKey ?? false;
            const draft = drafts[id] ?? '';
            const result = results[id];
            return (
              <div className="mc-subtitle-provider" key={id}>
                <div className="mc-subtitle-provider-heading">
                  <span className={`mc-source-dot${hasKey ? '' : ' is-warning'}`} />
                  <span>
                    <strong>{t(`subtitle.provider.${id}`)}</strong>
                    <small>{hasKey ? t('subtitle.keyStored') : t('subtitle.keyMissing')}</small>
                  </span>
                </div>
                <div className="mc-subtitle-provider-key">
                  <input
                    id={`media-center-subtitle-key-${id}`}
                    type="password"
                    autoComplete="off"
                    aria-label={`${t(`subtitle.provider.${id}`)} ${t('subtitle.keyMissing')}`}
                    placeholder={hasKey ? '••••••••' : t('subtitle.keyPlaceholder')}
                    value={draft}
                    onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.currentTarget.value }))}
                  />
                  <button
                    type="button"
                    disabled={busy !== null || (!draft.trim() && !hasKey)}
                    onClick={() => void saveKey(id)}
                  >
                    {draft.trim() || !hasKey ? t('subtitle.keySave') : t('subtitle.keyClear')}
                  </button>
                </div>
                <div className="mc-subtitle-provider-actions">
                  <button
                    type="button"
                    disabled={busy !== null || !hasKey}
                    onClick={() => void testProvider(id)}
                  >
                    {busy === id ? t('subtitle.testing') : t('subtitle.test')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void window.api.openExternal(SUBTITLE_PROVIDER_KEY_URLS[id])}
                  >
                    {t('subtitle.getKey')}
                  </button>
                  {result && (
                    <span role="status" className={result.ok ? 'is-ok' : 'is-error'}>
                      {testMessage(result)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {loadFailed && <p role="status" className="mc-subtitle-provider-load-error">{t('subtitle.testFail.error')}</p>}
          <button
            type="button"
            className="mc-subtitle-provider-advanced"
            onClick={() => openSettingsAt('scraper', 'subtitle-providers')}
          >
            {t('mediaCenter.settings.advanced')} <Icon name="external" size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

function MediaTile({
  item,
  active,
  onPlay,
  compact = false,
}: {
  item: MediaItem;
  active?: boolean;
  onPlay: () => void;
  compact?: boolean;
}) {
  const { t } = useT();
  const percent = progress(item);
  // A folder of one series produces a shelf of identical posters. The episode
  // number is the only thing that tells two of those tiles apart, so it goes on
  // the artwork rather than in the caption underneath it — the caption is the
  // series name, which is the part that is already the same on every tile.
  const episode = mediaEpisodeBadge(item);
  return (
    <button
      type="button"
      className={`mc-media-tile${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      onClick={onPlay}
      title={t('mediaCenter.tile.openTitled', { title: item.title })}
    >
      {/* The tile is a button whose own content prints the title below the art,
          so the button's accessible name is already the title. */}
      <MediaArtwork id={item.id} title={item.title} variant="poster" decorative>
        <span className="mc-tile-play"><Icon name="player" size={15} /></span>
        {episode && <span className="mc-tile-episode">{episode}</span>}
        {item.jlptLevel && <span className="mc-tile-level">{item.jlptLevel}</span>}
        {percent > 0 && <span className="mc-tile-progress"><i style={{ width: `${percent}%` }} /></span>}
      </MediaArtwork>
      <span className="mc-tile-copy">
        <strong>{item.title}</strong>
        <small>{isStarted(item) ? t('mediaCenter.tile.resumeAt', { percent }) : itemSubtitle(item)}</small>
      </span>
    </button>
  );
}

function EmptyShelf({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action: () => void;
}) {
  const { t } = useT();
  return (
    <div className="mc-empty-shelf">
      <span className="mc-empty-shelf-icon"><Icon name="folder-open" size={24} /></span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <button type="button" className="mc-button mc-button-primary" onClick={action}>
        <Icon name="plus" size={13} /> {t('study.empty.addMedia')}
      </button>
    </div>
  );
}

function LibraryPanel({
  state,
  music,
  onNavigate,
  onOpenSeanime,
  workspace,
}: {
  state: MediaState;
  music: MusicState;
  onNavigate: (tab: MediaCenterTab) => void;
  onOpenSeanime: OpenSeanimeWorkspace;
  workspace: MediaWorkspaceAvailability;
}) {
  const { t } = useT();
  // Where a chosen track has to be delivered. See `subtitleChoiceDestination`.
  const destination = subtitleChoiceDestination(workspace);
  // Stable so the grid's card memo survives a keystroke — see `useStableCallback`.
  const play = useStableCallback((id: string) => {
    // Loading the item is only half of it: the player lives on another tab,
    // so without the navigation a card click looks like it did nothing.
    const item = state.items.find((entry) => entry.id === id);
    if (item?.kind === 'audio' || item?.kind === 'audiobook') {
      void music.play(item);
      onNavigate('music');
    } else {
      void state.playItem(id);
      onNavigate('video');
    }
  });
  return (
    <div className="mc-page mc-library-page">
      <MediaLibraryShell
        items={state.items}
        /*
         * The top bar's search box wrote to `state.query` and NOTHING on this
         * page ever read it. Measured live 2026-08-25 in both presentations:
         * a term matching no title left the shelf at the same 5 cards, so the
         * control rendered, accepted text and did nothing.
         *
         * It narrows the grid, not `items`: the sidebar's shelf counts and the
         * "your library is empty, import something" branch are both keyed off
         * `items`, so handing the shell a filtered list would make an unmatched
         * search claim the library is empty — a false state, and a worse defect
         * than the dead control it replaced.
         */
        query={state.debouncedQuery}
        currentId={state.current?.id ?? null}
        onPlay={play}
        onImportFiles={state.openFile}
        onImportFolder={() => void state.openFolder()}
        onRemove={async (id) => {
          const next = await window.api.removeMedia(id);
          state.setItems(next);
          if (state.current?.id === id) state.clearPlayback();
        }}
        activeSubtitleName={state.subName}
        onUseSubtitle={async (mediaId, recordId) => {
          const pick = await window.api.readSubtitleRecord(mediaId, recordId);
          if (!pick) throw new Error(t('mediaCenter.library.subtitleMissing'));
          // Recorded before either branch runs, and for both of them: the choice is the
          // user's answer to "which of these tracks", and the player that renders it is
          // resolved separately (`pickPlaybackSubtitle` honours this id). Without it the
          // workspace re-picks by its own ranking and opens a different track than the
          // one just clicked.
          const stored = await window.api.setMediaItemState(mediaId, {
            preferredSubtitleId: recordId,
          });
          if (!stored) throw new Error(t('mediaCenter.library.itemMissing'));
          state.setItems(state.items.map((item) => (
            item.id === mediaId ? { ...item, preferredSubtitleId: recordId } : item
          )));
          if (destination === 'workspace') {
            const item = state.items.find((entry) => entry.id === mediaId);
            if (!item?.path) throw new Error(t('mediaCenter.library.itemMissing'));
            onOpenSeanime({ localFilePath: item.path });
            return;
          }
          // Make sure the player holds the episode the track belongs to, or the
          // cues would be laid over whatever happened to be open.
          if (state.current?.id !== mediaId) await state.playItem(mediaId);
          state.applySubtitleFile(pick.name, pick.text);
          onNavigate('video');
        }}
        onSetItemState={async (id, patch) => {
          const updated = await window.api.setMediaItemState(id, patch);
          if (!updated) throw new Error(t('mediaCenter.library.itemMissing'));
          state.setItems(state.items.map((item) => item.id === id ? { ...item, ...patch } : item));
          return updated;
        }}
      />
    </div>
  );
}

function VideoPanel({
  state,
  onStudy,
  onOpenSeanime,
  workspace,
}: {
  state: MediaState;
  onStudy: () => void;
  onOpenSeanime: OpenSeanimeWorkspace;
  workspace: MediaWorkspaceAvailability;
}) {
  const { t } = useT();
  const videos = useMemo(() => orderUpNext(state.items), [state.items]);
  const current = state.current;
  const stage = videoStageFor(workspace);
  /*
   * ONE shelf, in one of two places — it moves INTO the empty stage while nothing is
   * loaded and sits below the layout once something is. Not a copy: rendering it twice
   * would put the same seven posters on screen twice.
   *
   * Rubric category 4 measured why. Maximized at 1264x765 the stage is a 668x668 void
   * with a 179px message block centred in it, leaving a 694x256 dead rectangle —
   * `deadRegion 17.1%` of the viewport against a 15% bar. (At the window's own default
   * size the same layout reads 13.0% and passes, so this is the maximized case: the
   * stage grows with the window and the message does not.) Meanwhile the shelf that
   * answers the message's own question — "Choose what to watch" — sat at y=855 in a
   * 650px-tall scroller, below the fold, on a surface whose entire visible height was
   * the emptiness. The space and the content were both there; they were in the wrong
   * order.
   */
  const upNext = (
    <section className="mc-shelf mc-up-next">
      <div className="mc-section-head">
        <div><span className="mc-eyebrow">{t('mediaCenter.video.libraryQueue')}</span><h2>{t('mediaCenter.common.upNext')}</h2></div>
        <span>{t('mediaCenter.video.videoCount', { count: videos.length })}</span>
      </div>
      {videos.length > 0 ? (
        <div className="mc-tile-row mc-tile-row-small">
          {videos.slice(0, 7).map((item) => (
            <MediaTile
              key={item.id}
              item={item}
              compact
              active={state.current?.id === item.id}
              onPlay={() => void state.playItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyShelf title={t('mediaCenter.video.noVideos')} detail={t('mediaCenter.video.noVideosDetail')} action={() => void state.openFile()} />
      )}
    </section>
  );
  const subtitlesReason = videoSubtitlesDisabledReason({ hasSource: !!state.src });
  const generateReason = videoGenerateDisabledReason({
    hasSource: !!state.src,
    generating: state.generating,
  });
  return (
    <div className="mc-page mc-video-page">
      <div className="mc-video-topbar">
        <div>
          <span className="mc-eyebrow">{t('mediaCenter.video.eyebrow')}</span>
          <strong>{current?.title ?? t('mediaCenter.video.openPrompt')}</strong>
        </div>
        <div className="mc-video-actions">
          {/* The empty stage already offers Select video and Browse folder. Repeating Open
              video here made Video's default view cross the clarity bar at 13 visible
              controls; once a source is loaded the stage entries disappear, so this action
              returns here contextually and the replace-video flow remains one click away. */}
          {/* Secondary by the comment directly above: a control that "returns here
              contextually" so a replace-video flow stays one click away is by definition not
              this page's dominant task, and accent is the one signal that says it is. */}
          {state.src && (
            <button type="button" className="mc-button" onClick={() => void state.openFile()}>
              <Icon name="folder-open" size={13} /> {t('mediaCenter.action.openVideo')}
            </button>
          )}
          {/* A workspace launcher used to sit here too, and it was the same feature in a
              third control system. Its handler was byte-for-byte the stage CTA's
              (`onOpenSeanime(current ? { localFilePath: current.path } : undefined)`), it
              was enabled on exactly the condition that renders that CTA — `stage ===
              'workspace'` — so it was never the only route, and it wore the rail entry's
              own name: L10 bullet 4's sweep read "Media workspace" in nav-rail and
              app-toolbar at once. The rail names the destination, the stage acts on the
              current item; a third copy in the toolbar only made the two disagree. */}
          {/* Both were greyed out with a caption and no reason — two of Video's three
              mute pairs. `disabled` derives from the reason rather than repeating the
              condition, so the grey and the explanation cannot disagree. */}
          <button
            type="button"
            className="mc-button"
            onClick={() => void state.openSubs()}
            title={subtitlesReason ? t(subtitlesReason) : undefined}
            disabled={!!subtitlesReason}
          >
            <Icon name="caption" size={13} /> {t('mediaCenter.video.subtitles')}
          </button>
          <button
            type="button"
            className="mc-button"
            onClick={() => state.src && void state.runGeneration(state.src)}
            title={generateReason ? t(generateReason) : undefined}
            disabled={!!generateReason}
          >
            <Icon name="sparkle" size={13} /> {t('mediaCenter.video.generate')}
          </button>
        </div>
      </div>

      {state.error && (
        <div className="mc-inline-error" role="alert">
          <span>{state.error}</span>
          {/* The only control inside a `role="alert"`, and its icon is aria-hidden — with no
              label a screen reader reads the error and then an unidentified "button". */}
          <button
            type="button"
            aria-label={t('mediaCenter.video.dismissError')}
            onClick={() => state.setError('')}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      <div className="mc-video-layout">
        <div className="mc-video-stage">
          {/*
            Slice 16 deleted `MediaPlayerStage`, and the note here used to say this tab was
            "only ever reachable when the sidecar is disabled — with the workspace present it
            is filtered out of the nav entirely". That stopped being true at `f258ef77`, which
            deliberately restored the Video and Library tabs so the shell keeps one surface.
            The message did not follow, so the *available* machine — the normal one — was told
            to enable a media server this same window reports as present, with no route to the
            player it names. L4's first job is a coherent Media shell; this is that seam.

            Three states, each said in its own words rather than one text for all of them:
            `available` names the workspace as the destination and hands off to it (carrying
            the current file when there is one); `pending` says the status is still resolving;
            `unavailable` keeps the original rollback text verbatim, because that is exactly
            the `SEANIME_SIDECAR=0` case it was written for — the rollback keeps the library,
            transcription and study surfaces and loses playback, stated rather than discovered.

            The available copy does NOT claim the server is running: `available` only means the
            sidecar is not `disabled` (`mediaWorkspaceAvailability.ts`), and the workspace host
            renders `stopped`/`starting`/`offline`/`failed` itself once it opens.
          */}
          {/* Only with a source. Without one this block shared grid cell 1/1 with "Choose what
              to watch" below, so its text showed through as ghost lines and the up-next shelf
              covered its button (audit 2026-09-23). No video chosen → one message, one choice. */}
          {!state.src ? null : stage === 'workspace' ? (
            <div className="mc-video-empty" role="status">
              <span><Icon name="player" size={30} /></span>
              <strong>{t('mediaCenter.video.workspacePlayerTitle')}</strong>
              <p>{t('mediaCenter.video.workspacePlayerDetail')}</p>
              <div>
                {/* Accent only with a source: without one this status block shares grid-area
                    1/1 with "Choose what to watch", whose up-next shelf makes the cell 1051px
                    in a 665px body, dropping this button to y=807 — below the fold — while
                    that block's own action sits at y=402. See LIQUID_SCORECARD 2026-09-03. */}
                <button
                  type="button"
                  className={state.src ? 'mc-button mc-button-primary' : 'mc-button'}
                  onClick={() => onOpenSeanime(current ? { localFilePath: current.path } : undefined)}
                >
                  <Icon name="player" size={13} /> {t('mediaCenter.video.openInWorkspace')}
                </button>
              </div>
            </div>
          ) : stage === 'connecting' ? (
            <div className="mc-video-empty" role="status">
              <span><Icon name="video" size={30} /></span>
              <strong>{t('mediaWorkspace.connectingServer')}</strong>
            </div>
          ) : (
            <div className="mc-video-empty" role="status">
              <span><Icon name="video" size={30} /></span>
              <strong>{t('mediaCenter.video.needsServerTitle')}</strong>
              <p>{t('mediaCenter.video.needsServerDetail')}</p>
            </div>
          )}
          {!state.src && (
            <div className="mc-video-empty">
              <span><Icon name="video" size={30} /></span>
              <strong>{t('mediaCenter.video.emptyTitle')}</strong>
              <p>{t('mediaCenter.video.emptyDetail')}</p>
              <div>
                <button type="button" className="mc-button mc-button-primary" onClick={() => void state.openFile()}>
                  <Icon name="file-video" size={13} /> {t('mediaCenter.video.selectFile')}
                </button>
                <button type="button" className="mc-button" onClick={() => void state.openFolder()}>
                  <Icon name="folder-open" size={13} /> {t('mediaCenter.video.browseFolder')}
                </button>
              </div>
              {upNext}
            </div>
          )}
          <MediaGenerationStatus state={state} />
        </div>

        {/*
          §2.3 names "temporary inspectors" as what Liquid is FOR, and category 3 measured
          this rail as the one eligible region of four with no treatment and no shared
          primitive (`liquidTreatedEligible 3/4`, `sharedPrimitiveEligible 3/4`) while the
          sidebar, nav and topbar next to it already carried it. It takes the primitive
          plainly rather than an exception: unlike `.medialib-rail` it is not flush — the
          page insets it 20px on the right and the grid holds a 12px gutter to the stage —
          so it really is an inset sheet, which is the geometry the shared rule draws.
          The blocks inside stay OPAQUE anchors, because they hold the forms.
        */}
        <ContextualSurface as="aside" className="mc-video-inspector">
          <section className="mc-inspector-block">
            <div className="mc-section-head">
              <div><span className="mc-eyebrow">{t('mediaCenter.video.nowStudying')}</span><h2>{current?.title ?? t('mediaCenter.video.noneLoaded')}</h2></div>
              {current && (
                <button type="button" title={t('mediaCenter.video.searchMal')} onClick={() => void window.api.openExternal(malUrl(current.title))}>
                  MAL
                </button>
              )}
            </div>
            {current ? (
              <>
                <p className="mc-video-meta">{[
                  current.format ?? mediaKindLabel(current),
                  current.year,
                  current.resolution ? `${current.resolution}p` : null,
                  current.jlptLevel,
                ].filter(Boolean).join(' · ')}</p>
                <div className="mc-inspector-score-row">
                  <span><strong>{state.cues.length}</strong><small>{t('mediaCenter.video.subtitleLines')}</small></span>
                  <span><strong>{current.vocabularyCount ?? '—'}</strong><small>{t('mediaCenter.video.vocabulary')}</small></span>
                  <span><strong>{current.rating?.toFixed(1) ?? '—'}</strong><small>{t('mediaCenter.video.malScore')}</small></span>
                </div>
                {/* Secondary: the inspector rail is a contextual tool surface, and this is a
                    follow-on to a source that is already loaded. It keeps mc-wide, its icon,
                    its label and its handler — only the accent fill moves. */}
                <button type="button" className="mc-button mc-wide" onClick={() => {
                  dispatchMediaStudyAction(current, 'analyze-japanese');
                  onStudy();
                }}>
                  <Icon name="sparkle" size={13} /> {t('mediaCenter.video.openStudy')}
                </button>
              </>
            ) : (
              <p className="mc-muted">{t('mediaCenter.video.inspectorEmpty')}</p>
            )}
          </section>

          <section className="mc-inspector-block">
            <span className="mc-eyebrow">{t('mediaCenter.video.learningControls')}</span>
            <div className="mc-toggle-list">
              <Toggle label={t('video.autoPause')} checked={state.autoPause} onChange={state.setAutoPause} />
              <Toggle label={t('video.loopLine')} checked={state.loopLine} onChange={state.setLoopLine} />
              <Toggle label={t('video.furigana')} checked={state.furigana} onChange={state.setFurigana} />
              <Toggle label={t('video.dualSubs')} checked={state.dualSubs} onChange={state.setDualSubs} />
              <Toggle label={t('mediaCenter.study.dictation')} checked={state.dictationMode} onChange={state.setDictationMode} />
              <Toggle label={t('mediaCenter.study.shadowing')} checked={state.shadowingMode} onChange={state.setShadowingMode} />
            </div>
          </section>

          {/*
            §10.4's Q4 — "advanced tools discoverable without cluttering" — measured this rail
            at `collapsedDisclosures 0, scannedControls 34` against a bar of `>=1 collapsed AND
            <=12`. Fetching a Whisper model, choosing its language, arming an auto-add watch
            folder and pasting a download link are each an occasional setup task; none of them
            is part of watching or studying the video this pane is about, and all fourteen of
            their controls were painted at once above the fold. One disclosure, same shape and
            same uncontrolled semantics as `.mc-music-import` (`da07ac39`), for the same reason
            given there: nothing is persisted, so opening it is not a settings write, and every
            field stays mounted either way — a disclosure hides, it does not unmount, so the
            watch folder keeps watching and a running transcription keeps reporting.
          */}
          <details className="mc-inspector-advanced">
            <summary><Icon name="wrench" size={12} /> {t('mediaCenter.video.advancedTools')}</summary>
            <section className="mc-inspector-block">
              <span className="mc-eyebrow">{t('mediaCenter.video.subtitleTranscription')}</span>
              <MediaTranscriptionControls state={state} />
              <MediaWatchFolder state={state} />
            </section>
            <section className="mc-inspector-block mc-video-source">
              <span className="mc-eyebrow">{t('mediaCenter.video.youtube')}</span>
              <MediaYoutubeBar state={state} />
            </section>
          </details>
        </ContextualSurface>
      </div>

      {state.src ? upNext : null}
    </div>
  );
}

function MusicPanel({ state }: { state: MusicState }) {
  const { t } = useT();
  const { ps } = state;
  const queue = (ps.queue.length > 0 ? ps.queue : state.baseSongs).slice(0, 8);
  return (
    <div className="mc-page mc-music-page">
      <div className="mc-music-head">
        <div><span className="mc-eyebrow">{t('mediaCenter.music.eyebrow')}</span><h1>{state.currentMeta?.title ?? t('mediaCenter.nav.music')}</h1><p>{state.currentMeta?.artist ?? t('mediaCenter.music.libraryCount', { count: state.baseSongs.length })}</p></div>
        <div className="mc-music-window-actions lq-hit-scope">
          <button type="button" className="mc-button" onClick={() => void window.api.popOut('music')}>
            <Icon name="window" size={13} /> {t('mediaCenter.music.detachPlayer')}
          </button>
          <button type="button" className="mc-button" onClick={() => void window.api.popOut('musicwidget')}>
            <Icon name="widgets" size={13} /> {t('mediaCenter.music.detachMini')}
          </button>
        </div>
      </div>

      <div className="mc-music-layout">
        <ContextualSurface as="aside" className="mc-music-library">
          <div className="mc-panel-title">
            <div><strong>{t('mediaCenter.music.library')}</strong><small>{t('mediaCenter.music.trackCount', { count: state.baseSongs.length })}</small></div>
            <div className="mc-panel-actions lq-hit-scope">
              <button
                type="button"
                title={state.useAlbumInSearch ? t('mediaCenter.music.albumSearchOn') : t('mediaCenter.music.albumSearchOff')}
                aria-pressed={state.useAlbumInSearch}
                onClick={toggleUseAlbumInSearch}
              >
                <Icon name="folder" size={13} />
              </button>
              <button type="button" title={t('mediaCenter.music.likedOnly')} aria-pressed={state.likedOnly} onClick={() => state.setLikedOnly((value) => !value)}>
                <Icon name="heart" size={14} fill={state.likedOnly} />
              </button>
            </div>
          </div>
          <MusicSearchBox state={state} />
          <label className="mc-music-sort">
            <span>{t('mediaCenter.music.sort')}</span>
            <select value={state.sortBy} onChange={(event) => state.setSortBy(event.target.value as MusicState['sortBy'])}>
              <option value="recent">{t('mediaCenter.music.sortRecent')}</option>
              <option value="title">{t('mediaCenter.music.sortTitle')}</option>
              <option value="artist">{t('mediaCenter.music.sortArtist')}</option>
              <option value="folder">{t('mediaCenter.music.sortFolder')}</option>
            </select>
          </label>
          <div className="mc-music-list"><MusicSongList state={state} /></div>
          {/*
            Importing audio from a link is an occasional tool, not part of browsing a
            library you already have, so it is the "advanced tools tucked away" half of
            §10.4's Q4 rather than a default-state control. Uncontrolled `<details>`:
            nothing here is persisted, so opening it is not a settings write, and the
            field and its action stay in the DOM either way — a disclosure hides, it
            does not unmount.
          */}
          <details className="mc-music-import">
            <summary><Icon name="download" size={12} /> {t('music.yt.getAudio')}</summary>
            <MusicYoutubeRow state={state} />
          </details>
        </ContextualSurface>

        <AnchorSurface as="main" bare className="mc-music-now">
          <div className="mc-album-stage">
            <div className="mc-album-art">
              {state.art ? <img src={state.art} alt="" /> : <div><Icon name="music" size={54} /></div>}
              <span className={`mc-album-disc${ps.playing ? ' is-playing' : ''}`} />
            </div>
            <div className="mc-album-copy">
              <span className="mc-eyebrow">{t('mediaCenter.music.nowPlaying')}</span>
              <h2>{state.currentMeta?.title ?? t('mediaCenter.music.chooseTrack')}</h2>
              <p>{state.currentMeta?.artist ?? t('mediaCenter.music.lyricsHint')}</p>
            </div>
          </div>
          {state.error && <div className="mc-inline-error">{state.error}</div>}
          <div className="mc-lyrics-frame"><MusicLyricsPane state={state} /></div>
          {/*
            The inline `MusicControls` transport used to sit here and it duplicated
            `.mc-playerbar` control for control — same track, same shuffle/prev/play/
            next/repeat/seek/volume — one above the other in the same window. Two
            complete transports for one player is the clutter category 4 flagged and
            category 5's Q4 measured; the shell's persistent bar is the one that
            follows the user to Library, Video and Settings, so it is the survivor.
            The only capability the bar lacked was Like, which moved onto it (see
            `PersistentPlayer`), so nothing is reachable-from-fewer-places than before.
            The shared component itself is untouched: Blanc and the mini widget host it
            without any player bar of their own and still need it.
          */}
          <MusicNowPlaying state={state} />
        </AnchorSurface>

        <ContextualSurface as="aside" className="mc-music-queue">
          <div className="mc-panel-title">
            <div><strong>{t('mediaCenter.common.upNext')}</strong><small>{t('mediaCenter.music.playbackQueue')}</small></div>
            <Icon name="music" size={15} />
          </div>
          <div className="mc-track-queue">
            {queue.length > 0 ? queue.map((item, index) => (
              // `mc-track-row` is the same admission the library list already makes with
              // `music-row`: these are repeating rows of one kind of thing, not chrome.
              <button type="button" key={item.id} className={`mc-track-row${ps.current?.id === item.id ? ' is-active' : ''}`} onClick={() => void state.play(item)}>
                <span className="mc-track-index">{ps.current?.id === item.id && ps.playing ? <Icon name="volume" size={11} /> : String(index + 1).padStart(2, '0')}</span>
                <div><strong>{state.metaMap.get(item.id)?.title ?? item.title}</strong><small>{state.metaMap.get(item.id)?.artist ?? item.artist ?? t('mediaCenter.music.unknownArtist')}</small></div>
                <span>{item.durationSec ? fmt(item.durationSec) : '—'}</span>
              </button>
            )) : (
              <div className="mc-aside-empty"><Icon name="music" size={22} /><p>{t('mediaCenter.music.queueEmpty')}</p></div>
            )}
          </div>
          <div className="mc-queue-summary">
            <span><strong>{state.baseSongs.length}</strong> {t('mediaCenter.music.tracks')}</span>
            <span><strong>{state.baseSongs.reduce((sum, item) => sum + (item.listenCount ?? 0), 0)}</strong> {t('mediaCenter.music.plays')}</span>
          </div>
        </ContextualSurface>
      </div>
    </div>
  );
}

function StudyPanel({ state }: { state: MediaState }) {
  const source = state.src;
  // Study no longer receives the legacy player object — only the five members
  // the contract names. See shared/studyMediaSurface.ts.
  const surface = useLegacyStudyMediaSurface(state);

  return (
    <div className="mc-page mc-study-page">
      <StudyOrchestratorWorkspace surface={surface} />

      {/*
        `isPlayerVisible` and `onSeek` are GONE — slice 19. This tab passed the first as a
        bare `true` and the second as a write to `state.videoRef.current`, and slice 16
        deleted the only component that ever attached that ref. So the seek was a no-op and
        the `true` suppressed both of the branches that hand the episode to a player. The
        component opens the adopted workspace itself now; there has never been an inline
        player on this tab and there is no longer one anywhere for it to claim.
      */}
      <MediaStudyMode
        items={state.items}
        current={state.current}
        cues={state.cues}
        activeCue={state.active}
        positionSec={studyPlaybackPosition(surface)}
        onOpen={state.openItem}
        onLoadSubtitles={state.openSubs}
        onTranscribe={source ? () => void state.runGeneration(source) : undefined}
        isTranscribing={state.generating}
      />
    </div>
  );
}

function DiscoveryPosterArt({
  posterUrl,
  title,
  score,
  level,
}: {
  posterUrl?: string;
  title: string;
  score: number;
  level: string;
}) {
  const [failed, setFailed] = useState(false);
  let hash = 0;
  for (const char of title) hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  const hue = hash % 360;
  const initial = [...title.trim()].find((char) => /[\p{L}\p{N}]/u.test(char)) ?? '?';

  return (
    <span className="mc-discover-poster">
      {posterUrl && !failed ? (
        <img
          src={posterUrl}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="mc-discover-noart"
          style={{ background: `linear-gradient(145deg, hsl(${hue} 32% 24%), hsl(${(hue + 28) % 360} 30% 13%))` }}
          aria-hidden="true"
        >
          <strong>{initial}</strong>
          <Icon name="image" size={18} />
        </span>
      )}
      <em>{Math.round(score)}%</em>
      <i>{level}</i>
    </span>
  );
}

/**
 * Says which catalogue actually filled the shelf.
 *
 * This used to be a static "MyAnimeList · AniList" pair, which meant a
 * MyAnimeList outage — Jikan answers one with a 504 — was indistinguishable
 * from a healthy feed: the rows silently came from AniList and the header still
 * credited MyAnimeList. Now each source is marked live or unreachable, and a
 * seasonal shelf that had to fall back to an earlier season says which one, so
 * "This season" never quietly means a season that has already ended.
 */
function DiscoverProviderChips({ state }: { state: DiscoveryState }) {
  const { t } = useT();
  const { provenance, searching } = state;

  // A search hits both providers at once and merges them, so there is no single
  // "who answered" to report; the static pair is honest there.
  if (searching || !provenance) {
    return (
      <div className="mc-provider-chips">
        <span>MyAnimeList</span>
        <span>AniList</span>
        <span>{t('mediaCenter.discover.jlptRanked')}</span>
      </div>
    );
  }

  const chip = (id: 'jikan' | 'anilist', label: string) => {
    const down = provenance.failures.includes(id);
    return (
      <span
        key={id}
        data-state={down ? 'down' : provenance.servedBy === id ? 'live' : 'idle'}
        title={down ? t('mediaCenter.discover.providerDown', { provider: label }) : undefined}
      >
        {label}
        {down && ` — ${t('mediaCenter.discover.unreachable')}`}
      </span>
    );
  };

  return (
    <div className="mc-provider-chips">
      {chip('jikan', 'MyAnimeList')}
      {chip('anilist', 'AniList')}
      {provenance.fallbackSeason && (
        <span data-state="warn">
          {t('mediaCenter.discover.seasonFallback', {
            season: t(`mediaCenter.discover.season.${provenance.fallbackSeason.season.toLowerCase()}`),
            year: provenance.fallbackSeason.year,
          })}
        </span>
      )}
      <span>{t('mediaCenter.discover.jlptRanked')}</span>
    </div>
  );
}

function DiscoverPanel({ state }: { state: DiscoveryState }) {
  const { t } = useT();
  return (
    <div className="mc-page mc-discover-page">
      <div className="mc-discover-head">
        <div><span className="mc-eyebrow">{t('mediaCenter.discover.eyebrow')}</span><h1>{t('mediaCenter.discover.title')}</h1><p>{t('mediaCenter.discover.detail')}</p></div>
        <DiscoverProviderChips state={state} />
      </div>
      <DiscoveryControls state={state} />
      {state.results.length > 0 && (
        <section className="mc-discover-featured">
          <div className="mc-section-head">
            <div><span className="mc-eyebrow">{t('mediaCenter.discover.recommended', { level: state.level })}</span><h2>{t('mediaCenter.discover.topMatches')}</h2></div>
            <span>{t('mediaCenter.discover.rankedCount', { count: state.results.length })}</span>
          </div>
          <div className="mc-discover-posters">
            {state.results.slice(0, 7).map((entry) => (
              <button
                type="button"
                key={`${entry.candidate.provider}:${entry.candidate.id}`}
                onClick={() => state.select(entry)}
                title={t('mediaCenter.discover.inspectTitled', { title: entry.candidate.title })}
              >
                <DiscoveryPosterArt
                  posterUrl={entry.candidate.posterUrl}
                  title={entry.candidate.title}
                  score={entry.matchScore}
                  level={entry.estimatedLevel}
                />
                <strong>{entry.candidate.title}</strong>
                <small>{[entry.candidate.format, entry.candidate.year, entry.candidate.rating?.toFixed(1)].filter(Boolean).join(' · ')}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <DiscoveryTabs state={state} />
      <div className="mc-discovery-layout">
        <div className="mc-discovery-results"><DiscoveryResults state={state} /></div>
        <DiscoveryInspector state={state} />
      </div>
    </div>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="mc-toggle">
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function SettingsSection({
  icon,
  title,
  detail,
  children,
}: {
  icon: IconName;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="mc-settings-section">
      <header>
        <span><Icon name={icon} size={17} /></span>
        <div><h2>{title}</h2><p>{detail}</p></div>
      </header>
      <div className="mc-settings-section-body">{children}</div>
    </section>
  );
}

/**
 * Sources & tracking used to render `Connected`, `Ready`, `Available` and
 * `Configured` as four string literals under four identical green dots. None of
 * them was a check of anything: the same session could show "Connected" beside
 * MyAnimeList here while the Discover tab, one click away, was reporting
 * `MyAnimeList — unreachable` from the same Jikan 504.
 *
 * Every status below is now read from something the app actually knows:
 * catalogue rows from the last Discover feed's provenance, profile rows from
 * the stores that own those profiles. Where nothing has been observed yet, the
 * row says so rather than inventing a reassuring word.
 */
function useSourceRows(provenance: DiscoveryFeedProvenance | null) {
  const { t, lang } = useT();

  const catalogueRows = useMemo(() => {
    const row = (id: 'jikan' | 'anilist', name: string, detail: string) => {
      if (!provenance) return { id, name, detail, status: t('mediaCenter.settings.notChecked'), tone: 'idle' as const };
      if (provenance.failures.includes(id)) return { id, name, detail, status: t('mediaCenter.discover.unreachable'), tone: 'error' as const };
      if (provenance.servedBy === id) return { id, name, detail, status: t('mediaCenter.settings.answering'), tone: 'ok' as const };
      return { id, name, detail, status: t('mediaCenter.settings.standby'), tone: 'idle' as const };
    };
    return [
      row('jikan', 'MyAnimeList / Jikan', t('mediaCenter.settings.malDetail')),
      row('anilist', 'AniList', t('mediaCenter.settings.anilistDetail')),
    ];
  }, [provenance, lang]);

  // Both stores read synchronously from localStorage, the same source the
  // Settings panels that own them write to — no new persistence, no new IPC.
  const profileRows = useMemo(() => [
    {
      id: 'external-players',
      name: t('mediaCenter.settings.externalPlayers'),
      detail: t('mediaCenter.settings.externalPlayersDetail'),
      count: loadExternalPlayerPreferences().profiles.length,
    },
    {
      id: 'video-servers',
      name: t('mediaCenter.settings.videoServers'),
      detail: t('mediaCenter.settings.videoServersDetail'),
      count: loadVideoServerProfilesDocument().profiles.length,
    },
  ], [lang]);

  return { catalogueRows, profileRows };
}

function SettingsPanel({
  state,
  provenance,
  onOpenAutomation,
}: {
  state: MediaState;
  provenance: DiscoveryFeedProvenance | null;
  /** Watch folders and auto-import moved to Import & automation (`MediaWatchFoldersPanel`). */
  onOpenAutomation: () => void;
}) {
  const { t } = useT();
  const currentRate = state.playbackRate;
  const { catalogueRows, profileRows } = useSourceRows(provenance);
  const ingest = useIngestState().state;
  const activeFolders = ingest?.folders.filter((folder) => folder.active).length ?? 0;

  /**
   * Which whole-library job is in flight, or null.
   *
   * Both of these used to be `onClick={() => void window.api.x()}` — the `void`
   * WAS the handler. Measured on the user's own 39-item library: the subtitle
   * sweep runs 14.9 s online and 71.2 s offline, and `subtitleDiscoveryStatus()`
   * reports `{running: false}` throughout, so there was nothing to poll either.
   * A user clicked, waited a minute, saw nothing change, and clicked again.
   * One job at a time: both sweeps walk the whole library and a second pass
   * started on top of the first only fights it.
   */
  const [libraryJob, setLibraryJob] = useState<'metadata' | 'subtitles' | null>(null);

  const refreshMetadata = useCallback(async () => {
    setLibraryJob('metadata');
    try {
      const result = await window.api.runMediaMetadata();
      showToast(result.ok
        ? {
            message: t('mediaCenter.settings.metadataDone', { count: result.matched, unmatched: result.unmatched }),
            kind: result.matched ? 'success' : 'default',
          }
        : { message: result.error ?? t('mediaCenter.settings.metadataFailed'), kind: 'error' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error), kind: 'error' });
    } finally {
      setLibraryJob(null);
    }
  }, [t]);

  const findSubtitles = useCallback(async () => {
    setLibraryJob('subtitles');
    try {
      const result = await window.api.runSubtitleDiscovery();
      // `ok` alone is not "we got an answer" — a sweep with no network returns
      // ok:true and zero files, indistinguishable from a library that genuinely
      // has none. Same predicate the per-episode button uses (D247).
      const wentNowhere = subtitleSweepWentNowhere(result);
      showToast(result.ok && !wentNowhere
        ? { message: t('media.subtitles.searchDone', { count: result.files }), kind: result.files ? 'success' : 'default' }
        : { message: result.error ?? t('media.subtitles.searchFailed'), kind: 'error' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error), kind: 'error' });
    } finally {
      setLibraryJob(null);
    }
  }, [t]);

  return (
    <div className="mc-page mc-settings-page">
      <div className="mc-settings-head">
        <div><span className="mc-eyebrow">{t('mediaCenter.settings.eyebrow')}</span><h1>{t('mediaCenter.settings.title')}</h1><p>{t('mediaCenter.settings.detail')}</p></div>
        <button type="button" className="mc-button" onClick={openSettings}><Icon name="external" size={13} /> {t('mediaCenter.settings.advanced')}</button>
      </div>

      <div className="mc-settings-grid">
        <SettingsSection icon="player" title={t('mediaCenter.settings.playback')} detail={t('mediaCenter.settings.playbackDetail')}>
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.defaultSpeed')}</strong><small>{t('mediaCenter.settings.defaultSpeedDetail')}</small></span>
            {/* Every `mc-setting-row` select needs its own `aria-label`: the visible label
                lives in a sibling `<span>`, so it is not a `<label>` and the control
                announces only its value. The range input two sections down already did
                this and was the control that proved the omission. */}
            <select
              value={currentRate}
              aria-label={t('mediaCenter.settings.defaultSpeed')}
              onChange={(event) => state.setPlaybackRate(Number(event.target.value))}
            >
              {[0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </div>
          <Toggle label={t('mediaCenter.settings.autoPause')} detail={t('mediaCenter.settings.autoPauseDetail')} checked={state.autoPause} onChange={state.setAutoPause} />
          <Toggle label={t('mediaCenter.settings.loopSubtitle')} detail={t('mediaCenter.settings.loopSubtitleDetail')} checked={state.loopLine} onChange={state.setLoopLine} />
          <Toggle label={t('mediaCenter.settings.normalization')} detail={t('mediaCenter.settings.normalizationDetail')} checked={state.volumeNormalization} onChange={(value) => void state.applyVolumeNormalization(value)} />
          {/* Both of these buttons used to do nothing a user could see. `runPlayerDiagnostics`
              built a real report into `playerDiagnostics` and NOTHING rendered it;
              `diagnosticsOpen` had no consumer anywhere in the tree, so "View report" set a
              boolean and returned. Measured live 2026-09-06: clicking each changed the pane's
              text length by 0, opened no dialog and raised no toast.

              The result is now reported where it is produced, and the checks are about the
              player that actually plays (round-2 audit B): the Seanime server and its
              transcoder, the playback path and tracks of the video on screen, the GPU and
              the decoders. Each check is translated keys, so "View report" lists them in the
              UI language; the export carries the same checks. */}
          <div className="mc-settings-actions">
            <button type="button" onClick={() => void state.runPlayerDiagnostics()} disabled={state.diagnosticsRunning}>
              <Icon name="wrench" size={12} />
              {' '}
              {state.diagnosticsRunning ? t('mediaCenter.settings.diagnosticsRunning') : t('mediaCenter.settings.runDiagnostics')}
            </button>
            <button
              type="button"
              // `aria-disabled`, not `disabled`: a disabled button is not focusable, so the
              // reason it will not respond would be unreachable from the keyboard — the
              // sentence beside it says so, and the status line below repeats it.
              onClick={() => { if (state.playerDiagnostics) state.setDiagnosticsOpen(!state.diagnosticsOpen); }}
              aria-expanded={state.diagnosticsOpen}
              aria-disabled={!state.playerDiagnostics}
              title={state.playerDiagnostics ? undefined : t('mediaCenter.settings.noReportYet')}
            >
              <Icon name="info" size={12} />
              {' '}
              {t('mediaCenter.settings.viewReport')}
            </button>
          </div>
          <p className="mc-setting-note" role="status">
            {state.playerDiagnostics
              ? t('mediaCenter.settings.diagnosticsSummary', {
                pass: state.playerDiagnostics.passCount,
                warning: state.playerDiagnostics.warningCount,
                fail: state.playerDiagnostics.failCount,
              })
              : t('mediaCenter.settings.noReportYet')}
          </p>
          {state.diagnosticsOpen && state.playerDiagnostics && (
            <ul className="mc-diagnostics-list">
              {state.playerDiagnostics.checks.map((check) => (
                <li key={check.id} data-status={check.status}>
                  <span className={`mc-diagnostics-status mc-diagnostics-${check.status}`}>
                    {t(`playerDiag.status.${check.status}`)}
                  </span>
                  <strong>{t(check.labelKey, check.vars)}</strong>
                  <small>{t(check.detailKey, check.vars)}</small>
                </li>
              ))}
            </ul>
          )}
          {state.diagnosticsOpen && state.playerDiagnostics && (
            <div className="mc-settings-actions">
              <button type="button" onClick={state.exportPlayerDiagnostics}>
                <Icon name="download" size={12} />
                {' '}
                {t('mediaCenter.settings.exportReport')}
              </button>
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon="caption" title={t('mediaCenter.settings.subtitles')} detail={t('mediaCenter.settings.subtitlesDetail')}>
          <Toggle label={t('mediaCenter.settings.primarySubs')} detail={t('mediaCenter.settings.primarySubsDetail')} checked={state.primarySubs} onChange={state.setPrimarySubs} />
          <Toggle label={t('mediaCenter.settings.dualSubs')} detail={t('mediaCenter.settings.dualSubsDetail')} checked={state.dualSubs} onChange={state.setDualSubs} />
          <Toggle label={t('video.furigana')} detail={t('mediaCenter.settings.furiganaDetail')} checked={state.furigana} onChange={state.setFurigana} />
          <Toggle label={t('mediaCenter.settings.overlay')} detail={t('mediaCenter.settings.overlayDetail')} checked={state.subtitleOverlay} onChange={state.setSubtitleOverlay} />
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.subtitleSize')}</strong><small>{state.subtitleFontSize}px</small></span>
            {/* 16–48: the range the store keeps. 49–54 used to be offered and then
                clamped to 48 on save, so the slider and the player disagreed. */}
            <input type="range" min={16} max={48} value={state.subtitleFontSize} onChange={(event) => state.setSubtitleFontSize(Number(event.target.value))} aria-label={t('mediaCenter.settings.subtitleSize')} />
          </div>
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.subtitlePosition')}</strong><small>{t('mediaCenter.settings.subtitlePositionDetail')}</small></span>
            {/* `center`, not `middle`. `SubtitleVerticalPosition` is
                `'top' | 'center' | 'bottom'` and `center` is the DEFAULT
                (`playerPreferences.ts:34`), so the mismatch broke this control in both
                directions: writing `middle` was rejected by `normalizePlayerPreferences`
                and persisted nothing, and a stored `center` matched no option, so the
                select silently showed `Bottom` — a position the user never chose — to
                everyone who had not changed it. */}
            <select
              value={state.subtitlePosition}
              aria-label={t('mediaCenter.settings.subtitlePosition')}
              onChange={(event) => state.setSubtitlePosition(event.target.value as typeof state.subtitlePosition)}
            >
              <option value="bottom">{t('mediaCenter.settings.bottom')}</option>
              <option value="center">{t('mediaCenter.settings.middle')}</option>
              <option value="top">{t('mediaCenter.settings.top')}</option>
            </select>
          </div>
        </SettingsSection>

        <SettingsSection icon="library" title={t('mediaCenter.settings.library')} detail={t('mediaCenter.settings.libraryDetail')}>
          <div className="mc-setting-summary">
            <span><strong>{state.items.length}</strong><small>{t('mediaCenter.settings.mediaItems')}</small></span>
            {/* Read from the ingest pipeline's own state (`onMediaIngestState`), not the
                legacy single `watchFolder`, which the folder list replaced. */}
            <span><strong>{activeFolders}</strong><small>{t('gum.settings.watchedFolders')}</small></span>
            <span><strong>{state.items.filter((item) => item.posterPath).length}</strong><small>{t('mediaCenter.settings.providerPosters')}</small></span>
          </div>
          <div className="mc-settings-actions mc-settings-actions-stack">
            <button type="button" onClick={() => void state.openFile()}><Icon name="file" size={12} /> {t('mediaCenter.settings.importFiles')}</button>
            <button type="button" onClick={() => void state.openFolder()}><Icon name="folder-open" size={12} /> {t('mediaCenter.settings.importFolder')}</button>
            <button type="button" onClick={onOpenAutomation}><Icon name="eye" size={12} /> {t('gum.settings.automation')}</button>
            <button type="button" onClick={() => void refreshMetadata()} disabled={libraryJob !== null} aria-busy={libraryJob === 'metadata'}>
              <Icon name="refresh" size={12} /> {libraryJob === 'metadata' ? t('mediaCenter.settings.working') : t('mediaCenter.settings.refreshMetadata')}
            </button>
            <button type="button" onClick={() => void findSubtitles()} disabled={libraryJob !== null} aria-busy={libraryJob === 'subtitles'}>
              <Icon name="caption" size={12} /> {libraryJob === 'subtitles' ? t('media.subtitles.searching') : t('mediaCenter.settings.findSubtitles')}
            </button>
          </div>
        </SettingsSection>

        <SettingsSection icon="globe" title={t('mediaCenter.settings.sources')} detail={t('mediaCenter.settings.sourcesDetail')}>
          {catalogueRows.map(({ id, name, detail, status, tone }) => (
            <button
              type="button"
              className="mc-source-row"
              key={id}
              onClick={() => openSettingsAt('scraper', 'media-providers')}
            >
              <span className={`mc-source-dot is-${tone}`} />
              <div><strong>{name}</strong><small>{detail}</small></div>
              <em>{status}</em>
              <Icon name="chevron" size={11} />
            </button>
          ))}
          <SubtitleProviderQuickSetup />
          {profileRows.map(({ id, name, detail, count }) => (
            <button type="button" className="mc-source-row" key={id} onClick={openSettings}>
              <span className={`mc-source-dot is-${count > 0 ? 'ok' : 'idle'}`} />
              <div><strong>{name}</strong><small>{detail}</small></div>
              <em>{count > 0 ? t('mediaCenter.settings.profileCount', { count }) : t('mediaCenter.settings.noProfiles')}</em>
              <Icon name="chevron" size={11} />
            </button>
          ))}
        </SettingsSection>

        <SettingsSection icon="sparkle" title={t('mediaCenter.settings.study')} detail={t('mediaCenter.settings.studyDetail')}>
          <Toggle label={t('mediaCenter.study.dictation')} detail={t('mediaCenter.settings.dictationDetail')} checked={state.dictationMode} onChange={state.setDictationMode} />
          <Toggle label={t('mediaCenter.study.shadowing')} detail={t('mediaCenter.settings.shadowingDetail')} checked={state.shadowingMode} onChange={state.setShadowingMode} />
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.transcriptionLanguage')}</strong><small>{t('mediaCenter.settings.transcriptionLanguageDetail')}</small></span>
            <select
              value={state.subLang}
              aria-label={t('mediaCenter.settings.transcriptionLanguage')}
              onChange={(event) => state.setSubLang(event.target.value as 'ja' | 'zh')}
            >
              <option value="ja">{t('mediaCenter.settings.japanese')}</option>
              <option value="zh">{t('mediaCenter.settings.chinese')}</option>
            </select>
          </div>
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.whisperModel')}</strong><small>{t('mediaCenter.settings.whisperModelDetail')}</small></span>
            <select
              value={state.modelTier}
              aria-label={t('mediaCenter.settings.whisperModel')}
              onChange={(event) => state.setModelTier(event.target.value as typeof state.modelTier)}
            >
              <option value="tiny">Tiny</option>
              <option value="base">Base</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
            </select>
          </div>
        </SettingsSection>

        <SettingsSection icon="window" title={t('mediaCenter.settings.windows')} detail={t('mediaCenter.settings.windowsDetail')}>
          <div className="mc-window-preview">
            <div className="mc-window-preview-art"><Icon name="music" size={24} /></div>
            <div><strong>{t('mediaCenter.settings.sharedPlayback')}</strong><p>{t('mediaCenter.settings.sharedPlaybackDetail')}</p></div>
          </div>
          <div className="mc-settings-actions mc-settings-actions-stack">
            <button type="button" onClick={() => void window.api.popOut('music')}><Icon name="window" size={12} /> {t('mediaCenter.settings.detachMusic')}</button>
            <button type="button" onClick={() => void window.api.popOut('musicwidget')}><Icon name="widgets" size={12} /> {t('mediaCenter.settings.detachMini')}</button>
            <button type="button" onClick={() => void window.api.popOut('video')}><Icon name="video" size={12} /> {t('mediaCenter.settings.detachVideo')}</button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function PersistentPlayer({ state, onMusic }: { state: MusicState; onMusic: () => void }) {
  const { t } = useT();
  const { ps, currentMeta } = state;
  // Same idiom as the library filter at MusicContent.tsx:157 — `likedSongs` is module
  // state, so the tick is what makes a heart toggle repaint rather than go stale.
  void state.likedTick;
  const liked = !!ps.current && isLiked(ps.current.id);
  return (
    <ContextualSurface as="footer" className="mc-playerbar">
      <button type="button" className="mc-player-info" onClick={onMusic}>
        <span className="mc-player-thumb">
          {state.art ? <img src={state.art} alt="" /> : <Icon name="music" size={16} />}
        </span>
        <span><strong>{currentMeta?.title ?? t('mediaCenter.player.nothing')}</strong><small>{currentMeta?.artist ?? t('mediaCenter.player.chooseMusic')}</small></span>
      </button>
      <div className="mc-player-transport lq-hit-scope">
        {/*
          Same contract `MusicWidget` already documents for the same transport: a real
          toggle keeps a CONSTANT name and puts its state in `aria-pressed`, and a
          three-way cycle states its mode in its name instead. `is-active` alone reaches
          nobody, and the Like button two lines down was already doing it right.
        */}
        <button type="button" onClick={player.toggleShuffle} className={ps.shuffle ? 'is-active' : ''} aria-pressed={ps.shuffle} title={t('mediaCenter.player.shuffle')}><Icon name="shuffle" size={14} /></button>
        <button type="button" onClick={player.prev} disabled={!ps.current} title={t('mediaCenter.player.previous')}><Icon name="skip-back" size={15} /></button>
        <button type="button" className="mc-player-play" onClick={player.toggle} disabled={!ps.current} title={ps.playing ? t('mediaCenter.player.pause') : t('mediaCenter.player.play')}>
          <Icon name={ps.playing ? 'pause' : 'player'} size={15} />
        </button>
        <button type="button" onClick={player.next} disabled={!ps.current} title={t('mediaCenter.player.next')}><Icon name="skip-forward" size={15} /></button>
        {/* Icon-only, so this `title` IS the button's accessible name. It was
            the one raw literal left in this bar, and the same control in
            MusicContent.tsx:816 and MusicWidget.tsx:155 already resolved the
            mode through the catalog — so the Music window said "Repeat: off"
            in Japanese while the mini-player said リピート：オフ. */}
        <button type="button" onClick={player.cycleRepeat} className={ps.repeat !== 'off' ? 'is-active' : ''} title={t('music.controls.repeatTitle', { mode: t(`music.repeat.${ps.repeat}`) })}><Icon name="repeat" size={14} /></button>
        {/*
          Like is the one thing the page's now-deleted inline transport could do that this
          bar could not, so it moves here rather than disappearing. `likedTick` is read (not
          just bumped) so the fill re-renders: the store is module state, so without a state
          read this button would toggle the heart in `likedSongs` and paint the old fill.
        */}
        <button
          type="button"
          onClick={() => { if (ps.current) { toggleLiked(ps.current.id); state.bumpLikedTick(); } }}
          disabled={!ps.current}
          className={`mc-player-like${ps.current && liked ? ' is-active' : ''}`}
          aria-pressed={!!ps.current && liked}
          title={t('music.controls.addToLiked')}
        >
          <Icon name="heart" size={14} fill={liked} />
        </button>
      </div>
      {/* Transport, which §2.3 names as what Liquid is FOR. The seek row holds a
          range input, so without the role it classifies as dense work sitting on
          the player bar's own backdrop-filter and reads as a category-3 failure. */}
      <ContextualSurface className="mc-player-progress">
        <span>{fmt(ps.time)}</span>
        {/* Named so probes and the parity ledger can address the surviving seek — the
            page's `.music-seek` was the duplicate that went away with the inline row. */}
        <input type="range" className="mc-player-seek" min={0} max={ps.duration || 1} step={0.1} value={Math.min(ps.time, ps.duration || 1)} onChange={(event) => player.seek(Number(event.target.value))} disabled={!ps.current} aria-label={t('a11y.slider.trackPosition')} />
        <span>{fmt(ps.duration)}</span>
      </ContextualSurface>
      <ContextualSurface className="mc-player-volume lq-hit-scope">
        <Icon name="volume" size={14} />
        <input type="range" min={0} max={1} step={0.05} value={ps.volume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label={t('music.controls.volume')} />
        <button type="button" title={t('mediaCenter.music.detachMini')} onClick={() => void window.api.popOut('musicwidget')}><Icon name="window" size={14} /></button>
      </ContextualSurface>
    </ContextualSurface>
  );
}

export default function MediaCenterView({ initialTab = 'home' }: MediaCenterViewProps) {
  const { t, lang } = useT();
  const wired = useWiredMaterials();
  const media = useMedia('full', wired);
  const music = useMusic();
  /*
   * Real navigation history.
   *
   * The two chevrons in the top bar looked exactly like browser back/forward
   * and were wired to `setTab('home')` and `setTab('library')`. Pressing "back"
   * from Settings landed you on Home whether or not you had ever been there,
   * and "forward" went to Library from anywhere — a control that describes one
   * thing with its shape and does another. They now walk an actual trail of the
   * tabs this window has visited, and disable at each end so their state is
   * honest.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<{ trail: MediaCenterTab[]; at: number }>(
    () => ({ trail: [initialTab], at: 0 }),
  );
  const tab = history.trail[history.at];
  // Named here rather than inline in the arrows' `disabled=`, so the reason shown in the
  // tooltip and the reason the button is dead are the same expression and cannot drift apart.
  const noBack = history.at === 0;
  const noForward = history.at >= history.trail.length - 1;
  const discovery = useDiscovery(tab === 'discover');
  // Deferred exactly like `useDiscovery` above: the orchestrator read reaches the known-words
  // store and the frequency lists, so a shell that merely offers the destination pays nothing.
  const readiness = useStudyReadiness(tab === 'readiness');
  const workspace = useMediaWorkspaceAvailability();
  const seanimeAvailable = workspace === 'available';

  /**
   * The local library and the adopted Seanime library are two providers of the
   * same Media shell. Opening the adopted surface is an explicit action from
   * this shell; it must never replace the sidebar or auto-open during mount.
   *
   * A Media Center pop-out has no desktop shell, so it may not have a host of
   * its own. In that case, open the dedicated player pop-out, whose App tree
   * mounts the host. The main window and the player pop-out dispatch directly.
   */
  const openSeanime = useCallback<OpenSeanimeWorkspace>((request = {}) => {
    if (!seanimeAvailable) return false;
    if (mediaWorkspaceHostExists()) {
      openMediaWorkspace(request);
      return true;
    }
    void window.api.popOut('player').catch(() => undefined);
    return true;
  }, [seanimeAvailable]);

  const nav = useMemo(
    () => NAV.map((item) => ({ ...item, label: t(item.labelKey), hint: t(item.hintKey) })),
    [t, lang],
  );

  /*
   * The media library's data: tracked titles (`watch:list`, re-read on `watch:changed`)
   * joined with the local files `useMedia` already holds, plus the viewer's arrangement.
   * One `titles` list feeds Home, Library, the title page and the toast.
   */
  const watch = useWatchLibrary();
  const arrivalFeed = useArrivals();
  const ingestState = useIngestState().state;
  const [savedViews, setSavedViews] = useSavedViews();
  const homeLayout = useHomeLayout(savedViews.map((view) => view.id));
  const [libraryPrefs, setLibraryPrefs] = useLibraryPrefs();
  // Metadata sweeps land through `media:changed` (the items) and `watch:changed` (the
  // tracked titles); replaced artwork re-asks through `useMediaArtwork`'s own listener.
  const titles = useMemo(() => buildGumTitles(watch.views, media.items), [watch.views, media.items]);
  const continueRows = useContinueWatchingRows(media.items);
  const [titleId, setTitleId] = useState<string | null>(null);
  const [downloadFor, setDownloadFor] = useState<DiscoveryCandidate | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const topnavRef = useRef<HTMLElement>(null);
  const navMeasureRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const [navFit, setNavFit] = useState({ visible: PRIMARY_NAV.length, searchCollapsed: false });
  const [searchOpen, setSearchOpen] = useState(false);

  /** Jump to a tab, truncating any forward trail — the browser convention. */
  const setTab = (next: MediaCenterTab): void => {
    setHistory((current) => {
      if (current.trail[current.at] === next) return current;
      const trail = [...current.trail.slice(0, current.at + 1), next];
      return { trail, at: trail.length - 1 };
    });
  };

  const step = (delta: number): void => {
    setHistory((current) => {
      const at = current.at + delta;
      if (at < 0 || at >= current.trail.length) return current;
      return { ...current, at };
    });
  };

  const navigate = (next: MediaCenterTab): void => {
    setTab(next);
  };

  /*
   * Hand-offs from elsewhere in the window (`renderer/mediaCenterIntent.ts`): the player
   * workspace no longer has its own Library / Review panes, so "open the library" and
   * "review this file" (a readiness row, the desktop Continue-watching widget) land here.
   * Taken once on mount — the request may have opened this window — and on every new one.
   */
  const [reviewFocus, setReviewFocus] = useState<StudyReviewFocusRequest | null>(null);
  useEffect(() => {
    const apply = (): void => {
      const intent = takeMediaCenterIntent();
      if (!intent) return;
      if (intent.tab === 'review') setReviewFocus(intent.focus ?? null);
      setTab(intent.tab);
    };
    apply();
    return onMediaCenterIntent(apply);
    // `setTab` only ever writes through a functional state update, so the first one is enough.
  }, []);

  /**
   * One destination button, rendered identically whichever group it lands in — the top bar
   * or the More menu. The `Ctrl+N` hint is derived from the item's index in `NAV`, never
   * from its index within a group, because the shortcut handler indexes `NAV`.
   */
  const navLink = (item: typeof nav[number], onPick?: () => void) => {
    const shortcut = NAV.findIndex((entry) => entry.id === item.id) + 1;
    const queued = item.id === 'study' ? media.items.filter((entry) => entry.studyQueue).length : 0;
    return (
      <button
        type="button"
        key={item.id}
        className={tab === item.id ? 'is-active' : ''}
        // These choose the destination the shell is showing, so the state is
        // `aria-current="page"`, not a pressed toggle. Without it every destination
        // announces identically and the bar's only account of where you are is a class name.
        aria-current={tab === item.id ? 'page' : undefined}
        onClick={() => {
          navigate(item.id);
          onPick?.();
        }}
        title={shortcut <= 9 ? `${item.hint} (Ctrl+${shortcut})` : item.hint}
      >
        <span>{item.label}</span>
        {queued > 0 && <em>{queued}</em>}
      </button>
    );
  };

  useEffect(() => {
    setHistory((current) => (
      current.trail[current.at] === initialTab
        ? current
        : { trail: [initialTab], at: 0 }
    ));
  }, [initialTab]);

  useEffect(() => {
    const openStudy = () => setTab('study');
    window.addEventListener(MEDIA_STUDY_EVENT, openStudy);
    return () => window.removeEventListener(MEDIA_STUDY_EVENT, openStudy);
  }, []);

  /*
   * Keyboard navigation for the tabs.
   *
   * The Navigate menu was the only keyboard route between sections, and
   * `AppChrome` renders the menu bar only under the Aero and Wired material
   * sets — so in the default theme there was no keyboard way to change section
   * at all. Ctrl+1…9 follow `NAV`'s order; Alt+Left/Right walk the history
   * trail, matching the arrows in the top bar.
   *
   * The listener is on this instance's own root, not on `window`. Media, Video
   * and Music each mount a whole `MediaCenterView`, so a window-level listener
   * fires in all three at once and Ctrl+3 would silently retab every open Media
   * Center. Key events bubble from the focused element, so binding to the root
   * scopes the shortcut to the window the user is actually in.
   *
   * Typing is never intercepted: the handler bails out inside any field or
   * contenteditable, so Ctrl+1 in the search box stays the browser's.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (typeof target?.closest === 'function'
        && target.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= Math.min(9, NAV.length)) return;
      event.preventDefault();
      navigate(NAV[index].id);
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  });

  const searchPlaceholder = tab === 'music'
    ? t('mediaCenter.search.music')
    : tab === 'discover'
      ? t('mediaCenter.search.discover')
      : t('gum.search.placeholder');

  /*
   * Stable by construction, or `GlobalSearchField`'s memo is decorative: the whole point is that
   * the field survives the renders its own commits cause. The closure genuinely reads `tab`, so
   * `useCallback` is not an option here — the same reason `LibraryPanel`'s `onPlay` uses a ref.
   */
  const commitSearch = useStableCallback((next: string) => {
    if (tab === 'music') music.setQuery(next);
    else if (tab === 'discover') discovery.setQuery(next);
    else {
      media.setQuery(next);
      // Focusing a global control must not change context (keyboard users encounter it while
      // tabbing). The first actual library query owns the navigation instead, so search remains
      // immediate without a focus trap. All files keeps its own search, so it stays put.
      if (tab !== 'library' && tab !== 'files' && next.trim()) setTab('library');
    }
  });

  // -------------------------------------------------------------------------
  // Playing and opening
  // -------------------------------------------------------------------------

  /**
   * Play one file. Video goes to the player workspace with `startAtSec` when resuming;
   * audio stays in this window's music player. Without a workspace the file loads into
   * the Video tab's legacy stage, said rather than swallowed.
   */
  const playItem = useStableCallback((item: MediaItem, startAtSec?: number) => {
    if (item.kind === 'audio' || item.kind === 'audiobook') {
      void music.play(item);
      setTab('music');
      return;
    }
    if (openSeanime(startAtSec && startAtSec > 0 ? { localFilePath: item.path, startAtSec } : { localFilePath: item.path })) return;
    showToast({
      message: t(workspace === 'pending' ? 'mediaWorkspace.connecting' : 'mediaWorkspace.resumeLast.unavailable'),
      kind: 'warning',
    });
    void media.playItem(item.id);
    setTab('video');
  });

  // A single video dropped on the window (`DropRouter`) plays, rather than only landing in
  // the library. Taken on mount too: the drop may be what opened this window.
  useEffect(() => {
    const apply = (): void => {
      const item = takeMediaCenterPlay();
      if (item) playItem(item);
    };
    apply();
    return onMediaCenterPlay(apply);
  }, [playItem]);

  /** A file's resume position from the shared resume store (the workspace writes it). */
  const resumeAt = useStableCallback((item: MediaItem): number | undefined => {
    const row = continueRows.find((candidate) => candidate.item?.id === item.id);
    if (row) return continueWatchingOpenRequest(row.entry).startAtSec;
    return item.positionSec && !isWatched(item) ? item.positionSec : undefined;
  });

  /**
   * Resume a Continue-watching row through the same open path every other workspace
   * handoff in this view uses, carrying the rewound position explicitly. Audio is the
   * exception: its position comes from the library's own music player.
   */
  const resumeRow = useStableCallback((row: ContinueWatchingRow) => {
    const { entry, item } = row;
    if (item && (item.kind === 'audio' || item.kind === 'audiobook')) {
      playItem(item);
      return;
    }
    if (openSeanime(continueWatchingOpenRequest(entry))) return;
    // Said, not swallowed: a tile that silently does nothing reads as a broken shelf.
    showToast({
      message: t(workspace === 'pending'
        ? 'mediaWorkspace.connecting'
        : 'mediaWorkspace.resumeLast.unavailable'),
      kind: 'warning',
    });
  });

  const playTitle = useStableCallback((title: GumTitle) => {
    const next = nextEpisodeOf(title);
    if (next) playItem(next, resumeAt(next));
  });

  const openTitle = useStableCallback((title: GumTitle) => {
    setTitleId(title.id);
    setTab('title');
  });

  // A restart comes back to the title page that was open (and playing), not the grid.
  useGumRoutePersistence({
    enabled: initialTab === 'library' || initialTab === 'home',
    tab,
    titleId,
    titles,
    restore: openTitle,
  });

  const browse = useStableCallback((request: GumBrowseRequest) => {
    setLibraryPrefs((current) => {
      const status = request.status ?? 'all';
      return {
        ...current,
        status,
        type: request.type ?? 'all',
        byStatus: request.filters
          ? { ...current.byStatus, [status]: { ...current.byStatus[status], filters: request.filters } }
          : current.byStatus,
      };
    });
    setTab('library');
  });

  /**
   * "Find download": an anime with a MyAnimeList id opens the Scraper's download chooser
   * for exactly that show (the same dialog Discover uses); anything else opens the
   * Scraper's Torrent Manager, where the search lives.
   */
  const findDownload = useStableCallback((title: GumTitle) => {
    if (title.anime && title.malId) {
      setDownloadFor({
        provider: 'jikan',
        id: title.malId,
        mediaType: 'anime',
        title: title.title,
        nativeTitle: title.originalTitle,
        year: title.year,
        episodeCount: title.episodeCount,
        genres: title.genres,
      });
      return;
    }
    openTorrentManager();
  });

  const current = titleId ? titles.find((title) => title.id === titleId) ?? null : null;
  // An untracked title that just got tracked changes id (`local:…` → the watch id): follow
  // it through its first file, so setting a status does not strand the page.
  const [lastTitle, setLastTitle] = useState<GumTitle | null>(null);
  useEffect(() => {
    if (current) setLastTitle(current);
  }, [current]);
  useEffect(() => {
    if (current || !lastTitle) return;
    const firstItem = lastTitle.items[0]?.id;
    const replacement = firstItem ? titles.find((title) => title.items.some((item) => item.id === firstItem)) : undefined;
    if (replacement && replacement.id !== titleId) setTitleId(replacement.id);
  }, [titles, current, lastTitle, titleId]);
  const shownTitle = current ?? (lastTitle && lastTitle.id === titleId ? lastTitle : null);

  const previousTab = history.at > 0 ? history.trail[history.at - 1] : 'library';
  const backLabel = t(previousTab === 'home' ? 'gum.back.home' : previousTab === 'title' ? 'gum.back.title' : 'gum.back.library');
  const goBack = (): void => {
    if (history.at > 0) step(-1);
    else setTab('library');
  };

  // The title page draws only the study-queue switch; the other per-file tools
  // (re-match, notes, subtitle tracks) are in All files, which it links to.
  const fileTools = {
    currentId: media.current?.id ?? null,
    activeSubtitleName: media.subName,
    onToggleStudyQueue: async (entry: LibraryEntry, next: boolean) => {
      await Promise.all([...entry.items, ...entry.extras].map((item) => window.api.setMediaItemState(item.id, { studyQueue: next })));
      showToast({ message: t(next ? 'media.toast.queued' : 'media.toast.dequeued', { title: entry.title }), kind: 'success' });
    },
  };

  const mediaMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('mediaCenter.menu.file'),
      items: [
        { id: 'open', label: t('mediaCenter.menu.openMedia'), icon: <Icon name="folder-open" size={14} />, onSelect: media.openFile },
        { id: 'folder', label: t('mediaCenter.menu.addFolder'), icon: <Icon name="folder" size={14} />, onSelect: media.openFolder },
        { id: 'watch', label: t('gum.menu.watchFolders'), onSelect: () => setTab('import') },
        { id: 'import', label: t('gum.nav.import'), onSelect: () => setTab('import') },
      ],
    },
    {
      id: 'navigate',
      label: t('mediaCenter.menu.navigate'),
      items: nav.map((item) => ({
        id: item.id,
        label: item.label,
        disabled: tab === item.id,
        onSelect: () => navigate(item.id),
      })),
    },
    {
      id: 'window',
      label: t('mediaCenter.menu.window'),
      items: [
        { id: 'detach-music', label: t('mediaCenter.settings.detachMusic'), onSelect: () => void window.api.popOut('music') },
        { id: 'detach-mini', label: t('mediaCenter.settings.detachMini'), onSelect: () => void window.api.popOut('musicwidget') },
        { id: 'detach-video', label: t('mediaCenter.settings.detachVideo'), onSelect: () => void window.api.popOut('video') },
      ],
    },
  ];

  const activeFolders = ingestState?.folders.filter((folder) => folder.active).length ?? 0;
  const status = (
    <>
      <StatusBarField>{t('mediaCenter.nav.label')}</StatusBarField>
      <StatusBarField>{t('gum.library.titleCount', { count: titles.length })}</StatusBarField>
      <StatusBarField>{t('mediaCenter.shell.songCount', { count: music.baseSongs.length })}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{nav.find((item) => item.id === tab)?.label ?? shownTitle?.title ?? tab}</StatusBarField>
      {activeFolders > 0 && <StatusBarField>{t('gum.status.watchingFolders', { count: activeFolders })}</StatusBarField>}
    </>
  );

  /*
   * The top bar collapses progressively instead of overlapping itself: primary
   * destinations move into More from the end (Discover first) as the bar narrows,
   * then the search field shrinks to an icon that expands over the bar. Measured,
   * not container-queried, because the widths are the labels' — "More" ran into the
   * search box in Japanese at 1280px, and in English at 100% zoom.
   */
  const primaryNav = nav.filter((item) => PRIMARY_NAV.includes(item.id));
  const shownPrimary = primaryNav.slice(0, navFit.visible);
  const foldedPrimary = primaryNav.slice(navFit.visible);
  // Import has its own button, which already shows it is current; More does not
  // repeat it ("Import ▾" beside "Import").
  const moreActive = (SECONDARY_NAV.includes(tab) && tab !== 'import') || foldedPrimary.some((item) => item.id === tab);
  const moreLabel = moreActive ? nav.find((item) => item.id === tab)?.label ?? t('gum.nav.more') : t('gum.nav.more');
  // Whether a search is filtering, for the folded search icon's dot. The field's own
  // `value` below spells the same partition out in place (pinned by a source test).
  const searchActive = (tab === 'music' ? music.query : tab === 'discover' ? discovery.query : media.query).trim() !== '';
  // Re-measured on resize, on a language switch and when More's label changes.
  useLayoutEffect(() => {
    const bar = topnavRef.current;
    const probe = navMeasureRef.current;
    if (!bar || !probe) return undefined;
    const apply = (): void => {
      const next = fitTopNav(bar, probe, PRIMARY_NAV.length);
      setNavFit((prev) => (prev.visible === next.visible && prev.searchCollapsed === next.searchCollapsed ? prev : next));
    };
    apply();
    // A window resize too: the bar can be re-laid-out without its own box changing size
    // first (zoom), and ResizeObserver alone missed that in a backgrounded window.
    window.addEventListener('resize', apply);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    ro?.observe(bar);
    return () => {
      window.removeEventListener('resize', apply);
      ro?.disconnect();
    };
  }, [lang, moreLabel]);

  useEffect(() => {
    if (!navFit.searchCollapsed) setSearchOpen(false);
  }, [navFit.searchCollapsed]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.querySelector('input')?.focus();
  }, [searchOpen]);

  const loading = !watch.ready;
  // Home and the title page run their backdrop under the translucent top bar.
  const bleed = tab === 'home' || (tab === 'title' && !!shownTitle);

  const body = (() => {
    if (tab === 'home') return (
      <GumHome
        titles={titles}
        continueRows={continueRows}
        arrivals={arrivalFeed.arrivals}
        savedViews={savedViews}
        layout={homeLayout.layout}
        setLayout={homeLayout.setLayout}
        onResetLayout={homeLayout.reset}
        loading={loading}
        ratingDisplay={libraryPrefs.ratingDisplay}
        onOpenTitle={openTitle}
        onPlayTitle={playTitle}
        onPlayItem={playItem}
        onResumeRow={resumeRow}
        onBrowse={browse}
        onFindDownload={findDownload}
        onAddFiles={() => void media.openFile()}
        onAddFolder={() => void media.openFolder()}
        onImport={() => setTab('import')}
      />
    );
    if (tab === 'library') return (
      <GumLibrary
        titles={titles}
        loading={loading}
        search={media.query}
        prefs={libraryPrefs}
        setPrefs={setLibraryPrefs}
        savedViews={savedViews}
        setSavedViews={setSavedViews}
        homeLayout={homeLayout.layout}
        setHomeLayout={homeLayout.setLayout}
        onOpenTitle={openTitle}
        onPlayTitle={playTitle}
        onClearSearch={() => media.setQuery('')}
        onImport={() => setTab('import')}
        onAddFolder={() => void media.openFolder()}
      />
    );
    if (tab === 'title') return shownTitle ? (
      <GumTitlePage
        title={shownTitle}
        onBack={goBack}
        backLabel={backLabel}
        onPlayItem={playItem}
        resumeAt={resumeAt}
        onFindDownload={findDownload}
        onOpenSubtitleSettings={() => openSettingsAt('scraper', 'subtitle-providers')}
        onOpenApiKeys={() => openSettingsAt('api-keys')}
        fileTools={fileTools}
        onOpenFiles={() => setTab('files')}
        ratingDisplay={libraryPrefs.ratingDisplay}
        onOpenExternalPlayerSettings={() => openSettingsAt('scraper', 'external-players')}
      />
    ) : (
      <div className="gum-page gum-empty" role="status">
        <strong>{t('gum.title.gone')}</strong>
        <button type="button" className="gum-btn gum-btn--ghost" onClick={() => setTab('library')}>{t('gum.back.library')}</button>
      </div>
    );
    if (tab === 'downloads') return (
      <GumDownloads
        titles={titles}
        arrivals={arrivalFeed.arrivals}
        onOpenTorrents={openTorrentManager}
        onOpenTitle={openTitle}
        onPlayItem={(item) => playItem(item)}
        onImport={() => setTab('import')}
      />
    );
    if (tab === 'import') return (
      <GumImport
        titles={titles}
        onBack={goBack}
        backLabel={backLabel}
        onOpenSettings={(settingId) => openSettingsAt('scraper', settingId)}
      />
    );
    if (tab === 'files') return (
      <LibraryPanel
        state={media}
        music={music}
        onNavigate={navigate}
        onOpenSeanime={openSeanime}
        workspace={workspace}
      />
    );
    if (tab === 'video') return (
      <VideoPanel
        state={media}
        onStudy={() => setTab('study')}
        onOpenSeanime={openSeanime}
        workspace={workspace}
      />
    );
    if (tab === 'music') return <MusicPanel state={music} />;
    if (tab === 'study') return <StudyPanel state={media} />;
    if (tab === 'readiness') return (
      <SeanimeStudyLibraryPanel
        orchestrator={readiness.document}
        fingerprints={readiness.fingerprints}
        onAnalyse={readiness.analyse}
      />
    );
    // No `focus` prop here, and that is a decision rather than an omission: the focused
    // handoff is raised as a window event with no way to say which shell should answer it
    // (`new CustomEvent(…, { detail })`, not cancelable), and `MediaWorkspaceHost` already
    // answers it. Two shells answering one event would open the overlay on top of this one.
    // So the focused route stays exactly where it is, and this is the browsable destination.
    if (tab === 'review') return (
      <SeanimeWatchLoopPanel focus={reviewFocus} onClearFocus={() => setReviewFocus(null)} />
    );
    if (tab === 'discover') return <DiscoverPanel state={discovery} />;
    return <SettingsPanel state={media} provenance={discovery.provenance} onOpenAutomation={() => setTab('import')} />;
  })();


  return (
    <AppChrome menus={mediaMenus} status={status} className="mc-app-chrome">
      {/*
        * `tabIndex={-1}` plus focus-on-pointerdown is what puts this element in
        * the focus path, so the shortcut listener above actually receives the
        * bubbling keydown. Clicking a control inside focuses that control, which
        * is still a descendant — the fallback only runs when the click landed on
        * something unfocusable.
        */}
      <div
        className="mc-root gum-root"
        ref={rootRef}
        tabIndex={-1}
        onPointerDown={() => {
          queueMicrotask(() => {
            const root = rootRef.current;
            if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
          });
        }}
      >
        <div className="mc-workspace gum-workspace" data-bleed={bleed ? 'true' : undefined} data-scrolled={scrolled ? 'true' : undefined}>
          {/*
            The approved design's top bar replaces the 206px sidebar: four destinations, a
            More menu for the rest, search, and Import. It is a Liquid contextual surface —
            glass in Liquid presentation, the shell's own translucent bar otherwise.
          */}
          <ContextualSurface as="header" className="gum-topnav" ref={topnavRef}>
            <div className="gum-brand" data-topnav-fixed="">
              <span className="gum-brand__mark" aria-hidden="true"><Icon name="player" size={13} /></span>
              {/* One name: the window, Start and the taskbar call this app Watch. */}
              <span className="gum-brand__name">{t('palette.section.watch')}</span>
            </div>
            {/* Both are icon-only and disabled on a fresh trail, so the title carries the
                REASON while disabled and the label while enabled; `aria-label` holds the
                name either way. The trail walks Media Center SECTIONS, not web pages. */}
            <div className="mc-history-buttons gum-history" data-topnav-fixed="">
              <button
                type="button"
                title={noBack ? t('mediaCenter.shell.reason.noBack') : t('mediaCenter.shell.back')}
                aria-label={t('mediaCenter.shell.back')}
                disabled={noBack}
                onClick={() => step(-1)}
              >
                <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button
                type="button"
                title={noForward ? t('mediaCenter.shell.reason.noForward') : t('mediaCenter.shell.forward')}
                aria-label={t('mediaCenter.shell.forward')}
                disabled={noForward}
                onClick={() => step(1)}
              >
                <Icon name="chevron" size={12} />
              </button>
            </div>
            <nav className="gum-nav" aria-label={t('palette.section.watch')}>
              {shownPrimary.map((item) => navLink(item))}
              <GumPopover
                className="gum-nav-more"
                label={<span>{moreLabel}</span>}
                active={moreActive}
              >
                {(close) => (
                  <div className="gum-menu gum-menu--nav">
                    {foldedPrimary.map((item) => navLink(item, close))}
                    {foldedPrimary.length > 0 && <div className="gum-menu__sep" role="separator" />}
                    {nav.filter((item) => SECONDARY_NAV.includes(item.id)).map((item) => navLink(item, close))}
                    <div className="gum-menu__sep" role="separator" />
                    <span className="gum-menu__label">{t('mediaCenter.home.handoffTitle')}</span>
                    {STUDY_HANDOFFS.map(({ app, labelKey }) => (
                      <button
                        type="button"
                        key={app}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('os:open', { detail: app }));
                          close();
                        }}
                      >
                        <span>{t(labelKey)}</span>
                        <Icon name="external" size={11} />
                      </button>
                    ))}
                  </div>
                )}
              </GumPopover>
            </nav>
            {/* The primary destinations and More at their natural widths, off screen, so
                the fit is measured from real labels in the current language. */}
            <div className="gum-nav gum-nav--measure" ref={navMeasureRef} aria-hidden="true">
              {primaryNav.map((item) => <span key={item.id} className="gum-nav__probe" data-measure-item="">{item.label}</span>)}
              <span className="gum-nav-more" data-measure-more="">
                <span className="gum-pop__trigger">{moreLabel}<GumIcon name="chevron-down" size={12} /></span>
              </span>
            </div>
            <div className="gum-topnav__spacer" />
            <div
              ref={searchRef}
              className="gum-search"
              data-collapsed={navFit.searchCollapsed ? 'true' : undefined}
              data-open={searchOpen ? 'true' : undefined}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !navFit.searchCollapsed || !searchOpen) return;
                setSearchOpen(false);
                searchToggleRef.current?.focus();
              }}
            >
              {navFit.searchCollapsed && (
                <button
                  ref={searchToggleRef}
                  type="button"
                  className="gum-search__toggle"
                  aria-label={t('gum.search.open')}
                  title={t('gum.search.open')}
                  aria-expanded={searchOpen}
                  data-active={searchActive ? 'true' : undefined}
                  onClick={() => setSearchOpen(true)}
                >
                  <Icon name="search" size={15} />
                </button>
              )}
              <GlobalSearchField
                value={tab === 'music' ? music.query : tab === 'discover' ? discovery.query : media.query}
                // Which store owns `value` right now. Three tabs read three different queries, so
                // this is the only thing that changes when the owner does but the text does not.
                contextKey={tab === 'music' ? 'music' : tab === 'discover' ? 'discover' : 'media'}
                placeholder={searchPlaceholder}
                deferMs={tab === 'music' || tab === 'discover' ? 0 : GLOBAL_SEARCH_COMMIT_MS}
                onCommit={commitSearch}
                onEnter={tab === 'discover' ? discovery.submitQuery : undefined}
              />
            </div>
            <button
              type="button"
              className="gum-btn gum-btn--outline gum-topnav__import"
              data-topnav-fixed=""
              aria-current={tab === 'import' ? 'page' : undefined}
              onClick={() => setTab('import')}
            >
              <GumIcon name="import" size={14} /> <span>{t('gum.nav.import')}</span>
            </button>
          </ContextualSurface>

          <main
            className="mc-content gum-content"
            onScroll={(event) => {
              const next = event.currentTarget.scrollTop > 24;
              if (next !== scrolled) setScrolled(next);
            }}
          >
            {body}
          </main>
          {/*
            * A "persistent" player with nothing in it is not persistent, it is
            * furniture. It appears the moment there is a track — and then it
            * genuinely does follow you across every tab — and on Music, where
            * the transport is the point of the page.
            */}
          {(music.ps.current || tab === 'music') && (
            <PersistentPlayer state={music} onMusic={() => setTab('music')} />
          )}
        </div>

        <GumArrivalToast
          event={arrivalFeed.latest}
          titles={titles}
          onDismiss={arrivalFeed.dismiss}
          onPlay={(item) => playItem(item)}
          onOpenTitle={openTitle}
        />
        {downloadFor && <MalDownloadDialog candidate={downloadFor} onClose={() => setDownloadFor(null)} />}
        <MediaLookupPopup state={media} />
      </div>
    </AppChrome>
  );
}
