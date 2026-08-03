import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MediaItem } from '../../shared/types';
import { MEDIA_STUDY_EVENT } from '../../shared/mediaStudyIntegration';
import Icon, { type IconName } from '../components/Icons';
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
import MediaLibraryShell from '../components/media/library/MediaLibraryShell';
import MediaArtwork from '../components/media/library/MediaArtwork';
import MediaStudyMode from '../components/media/MediaStudyMode';
import StudyOrchestratorWorkspace from '../components/media/StudyOrchestratorWorkspace';
import { useLegacyStudyMediaSurface } from '../components/media/legacyStudyMediaSurface';
import { orderUpNext, isStarted } from '../components/media/upNext';
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
import type { DiscoveryFeedProvenance } from '../../shared/mediaDiscovery';
import { loadExternalPlayerPreferences } from '../externalPlayerStore';
import { loadVideoServerProfilesDocument } from '../videoServerProfilesStore';
import {
  MusicControls,
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
import { useMediaWorkspaceAvailability } from '../mediaWorkspaceAvailability';
import * as player from '../playerBus';
import type { SubtitleProviderCredentialState } from '../../shared/subtitleDiscoveryIpc';
import './mediaCenter.css';

export type MediaCenterTab =
  | 'home'
  | 'library'
  | 'video'
  | 'music'
  | 'study'
  | 'discover'
  | 'settings';

interface MediaCenterViewProps {
  initialTab?: MediaCenterTab;
}

const NAV: Array<{ id: MediaCenterTab; labelKey: string; icon: IconName; hintKey: string }> = [
  { id: 'home', labelKey: 'mediaCenter.nav.home', icon: 'app', hintKey: 'mediaCenter.nav.homeHint' },
  { id: 'library', labelKey: 'mediaCenter.nav.library', icon: 'library', hintKey: 'mediaCenter.nav.libraryHint' },
  { id: 'video', labelKey: 'mediaCenter.nav.video', icon: 'video', hintKey: 'mediaCenter.nav.videoHint' },
  { id: 'music', labelKey: 'mediaCenter.nav.music', icon: 'music', hintKey: 'mediaCenter.nav.musicHint' },
  { id: 'study', labelKey: 'mediaCenter.nav.study', icon: 'sparkle', hintKey: 'mediaCenter.nav.studyHint' },
  { id: 'discover', labelKey: 'mediaCenter.nav.discover', icon: 'globe', hintKey: 'mediaCenter.nav.discoverHint' },
  { id: 'settings', labelKey: 'mediaCenter.nav.settings', icon: 'settings', hintKey: 'mediaCenter.nav.settingsHint' },
];

/**
 * The apps downstream of the Media Center — the ones that receive what mining
 * an episode produces. Module-level, so the labels are i18n *keys* resolved at
 * render time rather than strings frozen at module evaluation.
 */
const STUDY_HANDOFFS: Array<{ app: string; labelKey: string; hintKey: string; icon: IconName }> = [
  { app: 'notebook', labelKey: 'mediaCenter.home.handoffNotebook', hintKey: 'mediaCenter.home.handoffNotebookHint', icon: 'note' },
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
function openSettingsAt(page: 'scraper', settingId: string): void {
  openSettings();
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page, settingId } }));
  }, 80);
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

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: IconName;
}) {
  return (
    <div className="mc-stat-card">
      <div className="mc-stat-icon"><Icon name={icon} size={16} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
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
  const episode = item.episode != null
    ? `${item.season != null && item.season !== 1 ? `S${item.season} ` : ''}E${String(item.episode).padStart(2, '0')}`
    : null;
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
  return (
    <div className="mc-empty-shelf">
      <span className="mc-empty-shelf-icon"><Icon name="folder-open" size={24} /></span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <button type="button" className="mc-button mc-button-primary" onClick={action}>
        <Icon name="plus" size={13} /> Add media
      </button>
    </div>
  );
}

function HomePanel({
  state,
  music,
  onNavigate,
}: {
  state: MediaState;
  music: MusicState;
  onNavigate: (tab: MediaCenterTab) => void;
}) {
  const { t } = useT();
  const videos = state.items.filter((item) => item.kind !== 'audio' && item.kind !== 'audiobook');
  const audio = state.items.filter((item) => item.kind === 'audio' || item.kind === 'audiobook');
  const continueItems = [...state.items]
    .filter((item) => (item.positionSec ?? 0) > 0)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  const recent = [...state.items].sort((a, b) => b.addedAt - a.addedAt);
  const queue = state.items.filter((item) => item.studyQueue);
  const subtitleReady = state.items.filter((item) => (item.subtitles?.length ?? 0) > 0).length;
  const minutes = Math.round(state.items.reduce((sum, item) => sum + (item.durationSec ?? 0), 0) / 60);

  return (
    <div className="mc-page mc-home">
      <section className="mc-hero">
        <div className="mc-hero-copy">
          <span className="mc-eyebrow">{t('mediaCenter.home.eyebrow')}</span>
          <h1>{t('mediaCenter.home.title')}</h1>
          <p>{t('mediaCenter.home.detail')}</p>
          <div className="mc-hero-actions">
            <button type="button" className="mc-button mc-button-primary" onClick={() => void state.openFile()}>
              <Icon name="folder-open" size={14} /> {t('mediaCenter.action.openMedia')}
            </button>
            <button type="button" className="mc-button" onClick={() => onNavigate('discover')}>
              <Icon name="globe" size={14} /> {t('mediaCenter.action.findStudy')}
            </button>
          </div>
        </div>
        <div className="mc-hero-art">
          {continueItems[0] || recent[0] ? (
            <MediaArtwork
              id={(continueItems[0] ?? recent[0]).id}
              title={(continueItems[0] ?? recent[0]).title}
              variant="banner"
              ratio="16 / 9"
              // The hero copy sits INSIDE this element — the `strong` below is a
              // child of the artwork — so the title is announced from the same
              // block the image is in.
              decorative
            >
              <span className="mc-hero-art-shade" />
              <span className="mc-hero-art-copy">
                <small>{continueItems[0] ? t('mediaCenter.home.continueStudying') : t('mediaCenter.home.recent')}</small>
                <strong>{(continueItems[0] ?? recent[0]).title}</strong>
              </span>
            </MediaArtwork>
          ) : (
            <div className="mc-hero-art-empty">
              <Icon name="video" size={34} />
              <span>{t('mediaCenter.home.emptyHero')}</span>
            </div>
          )}
        </div>
      </section>

      <section className="mc-stat-grid" aria-label={t('mediaCenter.home.libraryOverview')}>
        <StatCard label={t('mediaCenter.nav.library')} value={state.items.length} detail={t('mediaCenter.home.mediaCounts', { videos: videos.length, audio: audio.length })} icon="library" />
        <StatCard label={t('mediaCenter.home.studyReady')} value={subtitleReady} detail={t('mediaCenter.home.subtitleTitles')} icon="caption" />
        <StatCard label={t('mediaCenter.common.studyQueue')} value={queue.length} detail={t('mediaCenter.home.savedLater')} icon="bookmark" />
        <StatCard label={t('mediaCenter.home.runtime')} value={minutes ? `${minutes}m` : '—'} detail={t('mediaCenter.home.indexedMedia')} icon="chart-bar" />
      </section>

      <div className="mc-home-columns">
        <div className="mc-home-main">
          <section className="mc-shelf">
            <div className="mc-section-head">
              <div><span className="mc-eyebrow">{t('mediaCenter.home.continueEyebrow')}</span><h2>{t('mediaCenter.home.continue')}</h2></div>
              <button type="button" onClick={() => onNavigate('library')}>{t('mediaCenter.action.viewLibrary')} <Icon name="chevron" size={11} /></button>
            </div>
            {continueItems.length > 0 ? (
              <div className="mc-tile-row">
                {continueItems.slice(0, 5).map((item) => (
                  <MediaTile
                    key={item.id}
                    item={item}
                    active={state.current?.id === item.id}
                    onPlay={() => {
                      if (item.kind === 'audio' || item.kind === 'audiobook') {
                        void music.play(item);
                        onNavigate('music');
                      } else {
                        void state.playItem(item.id);
                        onNavigate('video');
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyShelf
                title={t('mediaCenter.home.nothingInProgress')}
                detail={t('mediaCenter.home.progressEmptyDetail')}
                action={() => void state.openFile()}
              />
            )}
          </section>

          <section className="mc-shelf">
            <div className="mc-section-head">
              <div><span className="mc-eyebrow">{t('mediaCenter.home.recentEyebrow')}</span><h2>{t('mediaCenter.home.recent')}</h2></div>
              <button type="button" onClick={() => onNavigate('library')}>{t('mediaCenter.action.seeAll')} <Icon name="chevron" size={11} /></button>
            </div>
            {recent.length > 0 ? (
              <div className="mc-tile-row">
                {recent.slice(0, 5).map((item) => (
                  <MediaTile
                    key={item.id}
                    item={item}
                    onPlay={() => {
                      if (item.kind === 'audio' || item.kind === 'audiobook') {
                        void music.play(item);
                        onNavigate('music');
                      } else {
                        void state.playItem(item.id);
                        onNavigate('video');
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyShelf title={t('mediaCenter.home.buildLibrary')} detail={t('mediaCenter.home.buildLibraryDetail')} action={() => void state.openFolder()} />
            )}
          </section>
        </div>

        <aside className="mc-home-aside">
          <div className="mc-aside-card">
            <div className="mc-section-head">
              <div><span className="mc-eyebrow">{t('mediaCenter.home.studyEyebrow')}</span><h2>{t('mediaCenter.common.studyQueue')}</h2></div>
              <button type="button" onClick={() => onNavigate('study')}>{t('common.open')}</button>
            </div>
            {queue.length > 0 ? queue.slice(0, 4).map((item, index) => (
              <button
                type="button"
                className="mc-queue-row"
                key={item.id}
                onClick={() => {
                  dispatchMediaStudyAction(item, 'study-episode');
                  onNavigate('study');
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{item.title}</strong><small>{item.jlptLevel ?? t('mediaCenter.study.levelUnknown')} · {mediaKindLabel(item)}</small></div>
                <Icon name="chevron" size={11} />
              </button>
            )) : (
              <div className="mc-aside-empty">
                <Icon name="bookmark" size={21} />
                <p>{t('mediaCenter.home.studyEmpty')}</p>
              </div>
            )}
          </div>

          {/*
            * This slot used to hold a "browse catalogues" card whose only
            * action was `onNavigate('discover')` — the row directly below it in
            * the sidebar. A duplicate route dressed as a destination.
            *
            * The Media Center produces mined sentences, cards and study time,
            * and until now none of the three apps that consume them was
            * reachable from here: the whole surface deep-linked to exactly one
            * other app in the desktop, Settings. These are the handoffs a
            * learner actually needs after finishing an episode.
            */}
          <div className="mc-aside-card">
            <div className="mc-section-head">
              <div>
                <span className="mc-eyebrow">{t('mediaCenter.home.handoffEyebrow')}</span>
                <h2>{t('mediaCenter.home.handoffTitle')}</h2>
              </div>
            </div>
            {STUDY_HANDOFFS.map(({ app, labelKey, hintKey, icon }) => (
              <button
                type="button"
                className="mc-queue-row"
                key={app}
                onClick={() => window.dispatchEvent(new CustomEvent('os:open', { detail: app }))}
              >
                <span><Icon name={icon} size={14} /></span>
                <div><strong>{t(labelKey)}</strong><small>{t(hintKey)}</small></div>
                <Icon name="external" size={11} />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LibraryPanel({
  state,
  music,
  onNavigate,
}: {
  state: MediaState;
  music: MusicState;
  onNavigate: (tab: MediaCenterTab) => void;
}) {
  const { t } = useT();
  return (
    <div className="mc-page mc-library-page">
      <MediaLibraryShell
        items={state.items}
        currentId={state.current?.id ?? null}
        onPlay={(id) => {
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
        }}
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

function VideoPanel({ state, onStudy }: { state: MediaState; onStudy: () => void }) {
  const { t } = useT();
  const videos = useMemo(() => orderUpNext(state.items), [state.items]);
  const current = state.current;
  return (
    <div className="mc-page mc-video-page">
      <div className="mc-video-topbar">
        <div>
          <span className="mc-eyebrow">{t('mediaCenter.video.eyebrow')}</span>
          <strong>{current?.title ?? t('mediaCenter.video.openPrompt')}</strong>
        </div>
        <div className="mc-video-actions">
          <button type="button" className="mc-button mc-button-primary" onClick={() => void state.openFile()}>
            <Icon name="folder-open" size={13} /> {t('mediaCenter.action.openVideo')}
          </button>
          <button type="button" className="mc-button" onClick={() => void state.openSubs()} disabled={!state.src}>
            <Icon name="caption" size={13} /> {t('mediaCenter.video.subtitles')}
          </button>
          <button type="button" className="mc-button" onClick={() => state.src && void state.runGeneration(state.src)} disabled={!state.src || state.generating}>
            <Icon name="sparkle" size={13} /> {t('mediaCenter.video.generate')}
          </button>
        </div>
      </div>

      {state.error && (
        <div className="mc-inline-error" role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={() => state.setError('')}><Icon name="close" size={12} /></button>
        </div>
      )}

      <div className="mc-video-layout">
        <div className="mc-video-stage">
          {/*
            Slice 16 deleted `MediaPlayerStage`. This tab is only ever reachable when the
            sidecar is `disabled` (`SEANIME_SIDECAR=0`) — with the workspace present it is
            filtered out of the nav entirely — so the honest thing here is to say that
            video playback needs the media server, not to leave a stage-shaped hole.

            This is the documented cost of the deletion: the rollback keeps the library,
            transcription and study surfaces, and loses playback. It is stated rather than
            discovered.
          */}
          <div className="mc-video-empty" role="status">
            <span><Icon name="video" size={30} /></span>
            <strong>{t('mediaCenter.video.needsServerTitle')}</strong>
            <p>{t('mediaCenter.video.needsServerDetail')}</p>
          </div>
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
            </div>
          )}
          <MediaGenerationStatus state={state} />
        </div>

        <aside className="mc-video-inspector">
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
                <button type="button" className="mc-button mc-button-primary mc-wide" onClick={() => {
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

          <section className="mc-inspector-block">
            <span className="mc-eyebrow">{t('mediaCenter.video.subtitleTranscription')}</span>
            <MediaTranscriptionControls state={state} />
            <MediaWatchFolder state={state} />
          </section>
          <section className="mc-inspector-block mc-video-source">
            <span className="mc-eyebrow">{t('mediaCenter.video.youtube')}</span>
            <MediaYoutubeBar state={state} />
          </section>
        </aside>
      </div>

      <section className="mc-shelf mc-up-next">
        <div className="mc-section-head">
          <div><span className="mc-eyebrow">{t('mediaCenter.video.libraryQueue')}</span><h2>{t('mediaCenter.common.upNext')}</h2></div>
          <span>{t('mediaCenter.video.videoCount', { count: videos.length })}</span>
        </div>
        {videos.length > 0 ? (
          <div className="mc-tile-row mc-tile-row-small">
            {videos.slice(0, 7).map((item) => (
              <MediaTile key={item.id} item={item} compact active={state.current?.id === item.id} onPlay={() => void state.playItem(item.id)} />
            ))}
          </div>
        ) : (
          <EmptyShelf title={t('mediaCenter.video.noVideos')} detail={t('mediaCenter.video.noVideosDetail')} action={() => void state.openFile()} />
        )}
      </section>
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
        <div className="mc-music-window-actions">
          <button type="button" className="mc-button" onClick={() => void window.api.popOut('music')}>
            <Icon name="window" size={13} /> {t('mediaCenter.music.detachPlayer')}
          </button>
          <button type="button" className="mc-button" onClick={() => void window.api.popOut('musicwidget')}>
            <Icon name="widgets" size={13} /> {t('mediaCenter.music.detachMini')}
          </button>
        </div>
      </div>

      <div className="mc-music-layout">
        <aside className="mc-music-library">
          <div className="mc-panel-title">
            <div><strong>{t('mediaCenter.music.library')}</strong><small>{t('mediaCenter.music.trackCount', { count: state.baseSongs.length })}</small></div>
            <div className="mc-panel-actions">
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
          <MusicYoutubeRow state={state} />
        </aside>

        <main className="mc-music-now">
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
          <MusicControls state={state} onOpenWidget={() => void window.api.popOut('musicwidget')} />
          <MusicNowPlaying state={state} />
        </main>

        <aside className="mc-music-queue">
          <div className="mc-panel-title">
            <div><strong>{t('mediaCenter.common.upNext')}</strong><small>{t('mediaCenter.music.playbackQueue')}</small></div>
            <Icon name="music" size={15} />
          </div>
          <div className="mc-track-queue">
            {queue.length > 0 ? queue.map((item, index) => (
              <button type="button" key={item.id} className={ps.current?.id === item.id ? 'is-active' : ''} onClick={() => void state.play(item)}>
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
        </aside>
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

function SettingsPanel({ state, provenance }: { state: MediaState; provenance: DiscoveryFeedProvenance | null }) {
  const { t } = useT();
  const currentRate = state.playbackRate;
  const { catalogueRows, profileRows } = useSourceRows(provenance);
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
            <select value={currentRate} onChange={(event) => state.setPlaybackRate(Number(event.target.value))}>
              {[0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </div>
          <Toggle label={t('mediaCenter.settings.autoPause')} detail={t('mediaCenter.settings.autoPauseDetail')} checked={state.autoPause} onChange={state.setAutoPause} />
          <Toggle label={t('mediaCenter.settings.loopSubtitle')} detail={t('mediaCenter.settings.loopSubtitleDetail')} checked={state.loopLine} onChange={state.setLoopLine} />
          <Toggle label={t('mediaCenter.settings.normalization')} detail={t('mediaCenter.settings.normalizationDetail')} checked={state.volumeNormalization} onChange={(value) => void state.applyVolumeNormalization(value)} />
          <div className="mc-settings-actions">
            <button type="button" onClick={() => void state.runPlayerDiagnostics()}><Icon name="wrench" size={12} /> {t('mediaCenter.settings.runDiagnostics')}</button>
            <button type="button" onClick={() => state.setDiagnosticsOpen(true)}><Icon name="info" size={12} /> {t('mediaCenter.settings.viewReport')}</button>
          </div>
        </SettingsSection>

        <SettingsSection icon="caption" title={t('mediaCenter.settings.subtitles')} detail={t('mediaCenter.settings.subtitlesDetail')}>
          <Toggle label={t('mediaCenter.settings.primarySubs')} detail={t('mediaCenter.settings.primarySubsDetail')} checked={state.primarySubs} onChange={state.setPrimarySubs} />
          <Toggle label={t('mediaCenter.settings.dualSubs')} detail={t('mediaCenter.settings.dualSubsDetail')} checked={state.dualSubs} onChange={state.setDualSubs} />
          <Toggle label={t('video.furigana')} detail={t('mediaCenter.settings.furiganaDetail')} checked={state.furigana} onChange={state.setFurigana} />
          <Toggle label={t('mediaCenter.settings.overlay')} detail={t('mediaCenter.settings.overlayDetail')} checked={state.subtitleOverlay} onChange={state.setSubtitleOverlay} />
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.subtitleSize')}</strong><small>{state.subtitleFontSize}px</small></span>
            <input type="range" min={18} max={54} value={state.subtitleFontSize} onChange={(event) => state.setSubtitleFontSize(Number(event.target.value))} aria-label={t('mediaCenter.settings.subtitleSize')} />
          </div>
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.subtitlePosition')}</strong><small>{t('mediaCenter.settings.subtitlePositionDetail')}</small></span>
            <select value={state.subtitlePosition} onChange={(event) => state.setSubtitlePosition(event.target.value as typeof state.subtitlePosition)}>
              <option value="bottom">{t('mediaCenter.settings.bottom')}</option>
              <option value="middle">{t('mediaCenter.settings.middle')}</option>
              <option value="top">{t('mediaCenter.settings.top')}</option>
            </select>
          </div>
        </SettingsSection>

        <SettingsSection icon="library" title={t('mediaCenter.settings.library')} detail={t('mediaCenter.settings.libraryDetail')}>
          <div className="mc-setting-summary">
            <span><strong>{state.items.length}</strong><small>{t('mediaCenter.settings.mediaItems')}</small></span>
            <span><strong>{state.watchFolder ? t('mediaCenter.settings.on') : t('mediaCenter.settings.off')}</strong><small>{t('mediaCenter.settings.folderWatching')}</small></span>
            <span><strong>{state.items.filter((item) => item.posterPath).length}</strong><small>{t('mediaCenter.settings.providerPosters')}</small></span>
          </div>
          <div className="mc-settings-actions mc-settings-actions-stack">
            <button type="button" onClick={() => void state.openFile()}><Icon name="file" size={12} /> {t('mediaCenter.settings.importFiles')}</button>
            <button type="button" onClick={() => void state.openFolder()}><Icon name="folder-open" size={12} /> {t('mediaCenter.settings.importFolder')}</button>
            <button type="button" onClick={() => void state.chooseWatchFolder()}><Icon name="eye" size={12} /> {state.watchFolder ? t('mediaCenter.settings.changeWatch') : t('mediaCenter.settings.chooseWatch')}</button>
            <button type="button" onClick={() => void window.api.runMediaMetadata()}><Icon name="refresh" size={12} /> {t('mediaCenter.settings.refreshMetadata')}</button>
            <button type="button" onClick={() => void window.api.runSubtitleDiscovery()}><Icon name="caption" size={12} /> {t('mediaCenter.settings.findSubtitles')}</button>
          </div>
          {state.watchFolder && <p className="mc-path-note" title={state.watchFolder}>{state.watchFolder}</p>}
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
            <select value={state.subLang} onChange={(event) => state.setSubLang(event.target.value as 'ja' | 'zh')}>
              <option value="ja">{t('mediaCenter.settings.japanese')}</option>
              <option value="zh">{t('mediaCenter.settings.chinese')}</option>
            </select>
          </div>
          <div className="mc-setting-row">
            <span><strong>{t('mediaCenter.settings.whisperModel')}</strong><small>{t('mediaCenter.settings.whisperModelDetail')}</small></span>
            <select value={state.modelTier} onChange={(event) => state.setModelTier(event.target.value as typeof state.modelTier)}>
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
  return (
    <footer className="mc-playerbar">
      <button type="button" className="mc-player-info" onClick={onMusic}>
        <span className="mc-player-thumb">
          {state.art ? <img src={state.art} alt="" /> : <Icon name="music" size={16} />}
        </span>
        <span><strong>{currentMeta?.title ?? t('mediaCenter.player.nothing')}</strong><small>{currentMeta?.artist ?? t('mediaCenter.player.chooseMusic')}</small></span>
      </button>
      <div className="mc-player-transport">
        <button type="button" onClick={player.toggleShuffle} className={ps.shuffle ? 'is-active' : ''} title={t('mediaCenter.player.shuffle')}><Icon name="shuffle" size={14} /></button>
        <button type="button" onClick={player.prev} disabled={!ps.current} title={t('mediaCenter.player.previous')}><Icon name="skip-back" size={15} /></button>
        <button type="button" className="mc-player-play" onClick={player.toggle} disabled={!ps.current} title={ps.playing ? t('mediaCenter.player.pause') : t('mediaCenter.player.play')}>
          <Icon name={ps.playing ? 'pause' : 'player'} size={15} />
        </button>
        <button type="button" onClick={player.next} disabled={!ps.current} title={t('mediaCenter.player.next')}><Icon name="skip-forward" size={15} /></button>
        <button type="button" onClick={player.cycleRepeat} className={ps.repeat !== 'off' ? 'is-active' : ''} title={`Repeat: ${ps.repeat}`}><Icon name="repeat" size={14} /></button>
      </div>
      <div className="mc-player-progress">
        <span>{fmt(ps.time)}</span>
        <input type="range" min={0} max={ps.duration || 1} step={0.1} value={Math.min(ps.time, ps.duration || 1)} onChange={(event) => player.seek(Number(event.target.value))} disabled={!ps.current} aria-label={t('a11y.slider.trackPosition')} />
        <span>{fmt(ps.duration)}</span>
      </div>
      <div className="mc-player-volume">
        <Icon name="volume" size={14} />
        <input type="range" min={0} max={1} step={0.05} value={ps.volume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label={t('music.controls.volume')} />
        <button type="button" title={t('mediaCenter.music.detachMini')} onClick={() => void window.api.popOut('musicwidget')}><Icon name="window" size={14} /></button>
      </div>
    </footer>
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
  const discovery = useDiscovery(tab === 'discover');
  /**
   * Old-player retirement, 2026-07-31. Video and Library are the two surfaces the adopted
   * workspace owns, and `AppSection` no longer routes to them — but this component's own
   * nav still did, so the legacy player and library stayed one click away from the Music
   * app. They are hidden whenever the workspace exists.
   *
   * They are *kept* when it does not, because that is exactly the `SEANIME_SIDECAR=0`
   * fallback `MediaWorkspaceSectionView` renders: hiding them there would leave the app
   * with no video or library surface at all, which is the failure the fallback prevents.
   */
  const workspace = useMediaWorkspaceAvailability();
  const legacyMediaTabsHidden = workspace === 'available';
  const nav = useMemo(
    () => NAV
      .filter((item) => !(legacyMediaTabsHidden && (item.id === 'video' || item.id === 'library')))
      .map((item) => ({ ...item, label: t(item.labelKey), hint: t(item.hintKey) })),
    [legacyMediaTabsHidden, t, lang],
  );

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
    if (next === 'video') {
      openMediaWorkspace({ localFilePath: media.current?.path });
    }
    // Hand off without also selecting the legacy panel behind the overlay. Before this,
    // `video` opened the workspace AND set the tab, so closing the workspace revealed the
    // retired player; `library` did not hand off at all.
    if (legacyMediaTabsHidden && (next === 'video' || next === 'library')) {
      if (next === 'library') openMediaWorkspace();
      return;
    }
    setTab(next);
  };

  useEffect(() => {
    navigate(initialTab);
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
   * at all. Ctrl+1…7 follow the sidebar order; Alt+Left/Right walk the history
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
      if (!Number.isInteger(index) || index < 0 || index >= NAV.length) return;
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
      : t('mediaCenter.search.library');

  const mediaMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('mediaCenter.menu.file'),
      items: [
        { id: 'open', label: t('mediaCenter.menu.openMedia'), icon: <Icon name="folder-open" size={14} />, onSelect: media.openFile },
        { id: 'folder', label: t('mediaCenter.menu.addFolder'), icon: <Icon name="folder" size={14} />, onSelect: media.openFolder },
        { id: 'watch', label: media.watchFolder ? t('mediaCenter.menu.changeWatch') : t('mediaCenter.menu.setWatch'), onSelect: media.chooseWatchFolder },
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

  const status = (
    <>
      <StatusBarField>Media Center</StatusBarField>
      <StatusBarField>{t('mediaCenter.shell.itemCount', { count: media.items.length })}</StatusBarField>
      <StatusBarField>{t('mediaCenter.shell.songCount', { count: music.baseSongs.length })}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{nav.find((item) => item.id === tab)?.label ?? tab}</StatusBarField>
      {media.watchFolder && <StatusBarField>{t('mediaCenter.shell.watchingFolder')}</StatusBarField>}
    </>
  );

  const body = useMemo(() => {
    if (tab === 'home') return <HomePanel state={media} music={music} onNavigate={navigate} />;
    if (tab === 'library') return <LibraryPanel state={media} music={music} onNavigate={navigate} />;
    if (tab === 'video') return <VideoPanel state={media} onStudy={() => setTab('study')} />;
    if (tab === 'music') return <MusicPanel state={music} />;
    if (tab === 'study') return <StudyPanel state={media} />;
    if (tab === 'discover') return <DiscoverPanel state={discovery} />;
    return <SettingsPanel state={media} provenance={discovery.provenance} />;
  }, [tab, media, music, discovery]);

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
        className="mc-root"
        ref={rootRef}
        tabIndex={-1}
        onPointerDown={() => {
          queueMicrotask(() => {
            const root = rootRef.current;
            if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
          });
        }}
      >
        <aside className="mc-sidebar">
          <div className="mc-brand">
            <span className="mc-brand-mark"><Icon name="player" size={16} /></span>
            <span><strong>Media Center</strong><small>日本語 immersion</small></span>
          </div>

          <nav className="mc-nav" aria-label={t('mediaCenter.nav.label')}>
            <span className="mc-nav-label">{t('mediaCenter.shell.browse')}</span>
            {/*
              Filtered by id, not `slice(0, 6)`. That count silently meant "everything
              except Settings", which has its own control below — so the moment retirement
              hid Video and Library the slice stopped excluding anything and Settings
              rendered twice.
            */}
            {nav.filter((item) => item.id !== 'settings').map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? 'is-active' : ''}
                onClick={() => navigate(item.id)}
                title={`${item.hint} (Ctrl+${index + 1})`}
              >
                <Icon name={item.icon} size={15} />
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                {item.id === 'study' && media.items.filter((entry) => entry.studyQueue).length > 0 && (
                  <em>{media.items.filter((entry) => entry.studyQueue).length}</em>
                )}
              </button>
            ))}
          </nav>

          <div className="mc-sidebar-spacer" />

          <div className="mc-sidebar-library">
            <span className="mc-nav-label">{t('mediaCenter.shell.libraryStatus')}</span>
            <div><span className="mc-storage-ring">{media.items.length}</span><p><strong>{t('mediaCenter.shell.localItems')}</strong><small>{media.watchFolder ? t('mediaCenter.shell.watchActive') : t('mediaCenter.shell.manualImports')}</small></p></div>
          </div>

          <button type="button" className={`mc-settings-link${tab === 'settings' ? ' is-active' : ''}`} onClick={() => setTab('settings')}>
            <Icon name="settings" size={15} /><span><strong>{t('mediaCenter.nav.settings')}</strong><small>{t('mediaCenter.nav.settingsHint')}</small></span>
          </button>
        </aside>

        <div className="mc-workspace">
          <header className="mc-topbar">
            <div className="mc-history-buttons">
              <button
                type="button"
                title={t('mediaCenter.shell.back')}
                aria-label={t('mediaCenter.shell.back')}
                disabled={history.at === 0}
                onClick={() => step(-1)}
              >
                <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button
                type="button"
                title={t('mediaCenter.shell.forward')}
                aria-label={t('mediaCenter.shell.forward')}
                disabled={history.at >= history.trail.length - 1}
                onClick={() => step(1)}
              >
                <Icon name="chevron" size={12} />
              </button>
            </div>
            <div className="mc-breadcrumb">
              <span>Media Center</span><Icon name="chevron" size={9} /><strong>{nav.find((item) => item.id === tab)?.label}</strong>
            </div>
            <label className="mc-global-search">
              <Icon name="search" size={13} />
              <input
                type="search"
                value={tab === 'music' ? music.query : tab === 'discover' ? discovery.query : media.query}
                onChange={(event) => {
                  if (tab === 'music') music.setQuery(event.target.value);
                  else if (tab === 'discover') discovery.setQuery(event.target.value);
                  else media.setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (tab === 'discover' && event.key === 'Enter') discovery.submitQuery();
                }}
                onFocus={() => {
                  // Scoping search to Library is meaningless when that tab is hidden — it
                  // would strand the user on a panel with no nav entry to leave by.
                  if (legacyMediaTabsHidden) return;
                  if (!['music', 'discover', 'library'].includes(tab)) setTab('library');
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </label>
            <button type="button" className="mc-top-action" title={t('mediaCenter.action.openMedia')} onClick={() => void media.openFile()}><Icon name="plus" size={14} /></button>
            <button type="button" className="mc-top-action" title={t('mediaCenter.nav.settings')} onClick={() => setTab('settings')}><Icon name="settings" size={14} /></button>
          </header>

          <main className="mc-content">{body}</main>
          {/*
            * A "persistent" player with nothing in it is not persistent, it is
            * furniture. It was spending 60px at the bottom of Settings,
            * Discover, Study and Video to say "Nothing playing / Choose music
            * from your library" beside five disabled transport buttons and two
            * dead sliders. It appears the moment there is a track — and then it
            * genuinely does follow you across every tab — and on Music, where
            * the transport is the point of the page.
            */}
          {(music.ps.current || tab === 'music') && (
            <PersistentPlayer state={music} onMusic={() => setTab('music')} />
          )}
        </div>

        <MediaLookupPopup state={media} />
      </div>
    </AppChrome>
  );
}
