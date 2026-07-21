import DictionaryPopup from '../components/DictionaryPopup';
import Icon from '../components/Icons';
import MediaLibraryActions from '../components/MediaLibraryActions';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
  useWiredMaterials,
} from '../components/ui';
import WiredOscilloscope from '../components/wired/WiredOscilloscope';
import * as player from '../playerBus';
import {
  MusicControls,
  MusicLyricsPane,
  MusicNowPlaying,
  MusicSearchBox,
  MusicSongList,
  MusicYoutubeRow,
  toggleUseAlbumInSearch,
  useMusic,
  type SortBy,
} from '../components/music/MusicContent';
import { useT } from '../i18n';

// The Music app: songs from the media library on the left (as a search box +
// virtualized, collapsible folder tree so a library of thousands of tracks
// scrolls and drags the window at near-zero rendering cost), a big karaoke
// lyrics pane on the right. Playback lives in the shared playerBus, so the
// mini-player widget and visualizers stay in sync even when this window is
// closed. Lyrics are auto-paired via LRCLIB (cached); any word can be clicked
// for a dictionary lookup — songs as study material.

export default function MusicView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const wired = useWiredMaterials();
  const state = useMusic();
  const { ps, sortBy, likedOnly, currentMeta, error } = state;
  const lyrics = state.liveLyrics.lyrics;

  const openWidget = () =>
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'musicwidget' }));

  const musicMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'open-media',
          label: 'Open Media library',
          onSelect: () => window.dispatchEvent(new CustomEvent('os:open', { detail: 'player' })),
        },
        { id: 'open-widget', label: 'Open mini-player widget', onSelect: openWidget },
      ],
    },
    {
      id: 'playback',
      label: 'Playback',
      items: [
        { id: 'play-pause', label: ps.playing ? 'Pause' : 'Play', disabled: !ps.current, onSelect: player.toggle },
        { id: 'previous', label: 'Previous song', disabled: !ps.current, onSelect: player.prev },
        { id: 'next', label: 'Next song', disabled: !ps.current, onSelect: player.next },
        { separator: true, label: '' },
        { id: 'shuffle', label: ps.shuffle ? 'Shuffle: On' : 'Shuffle: Off', onSelect: player.toggleShuffle },
        { id: 'repeat', label: `Repeat: ${ps.repeat}`, onSelect: player.cycleRepeat },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...(['recent', 'title', 'artist', 'folder'] as SortBy[]).map((id) => ({
          id: `sort-${id}`,
          label: `Sort by ${id[0].toUpperCase()}${id.slice(1)}`,
          disabled: sortBy === id,
          onSelect: () => state.setSortBy(id),
        })),
        { separator: true, label: '' },
        {
          id: 'liked-only',
          label: likedOnly ? 'Show all songs' : 'Show liked songs only',
          onSelect: () => state.setLikedOnly((v) => !v),
        },
      ],
    },
  ];

  const musicStatus = (
    <>
      <StatusBarField>{state.baseSongs.length} songs</StatusBarField>
      <StatusBarField>{state.rows.length} rows</StatusBarField>
      {likedOnly && <StatusBarField>Liked only</StatusBarField>}
      <StatusBarSpacer />
      <StatusBarField>{ps.current && currentMeta ? currentMeta.title : 'No song selected'}</StatusBarField>
      {lyrics.kind === 'synced' && <StatusBarField>{lyrics.cues.length} cues</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={musicMenus} status={musicStatus} className="aero-music-chrome">
    <div className={`music-view${aero ? ' aero-music' : ''}`}>
      <aside className="music-songlist">
        <header className="music-list-head">
          <Icon name="music" size={20} />
          <h2>{t('music.songs')}</h2>
          <button
            className={`music-liked-chip ${likedOnly ? 'on' : ''}`}
            title={t('music.likedOnly.title')}
            onClick={() => state.setLikedOnly((v) => !v)}
          >
            <Icon name="heart" size={13} fill={likedOnly} />
          </button>
          <button
            className={`music-liked-chip ${state.useAlbumInSearch ? 'on' : ''}`}
            title={state.useAlbumInSearch ? t('music.albumSearch.on') : t('music.albumSearch.off')}
            onClick={() => state.setUseAlbumInSearch(toggleUseAlbumInSearch().useAlbumInSearch)}
          >
            <Icon name="folder" size={13} />
          </button>
          <select
            className="music-sort"
            value={sortBy}
            onChange={(e) => state.setSortBy(e.target.value as SortBy)}
            title={t('music.sortSelect.title')}
          >
            <option value="recent">{t('music.sort.recent')}</option>
            <option value="title">{t('music.sort.byTitle')}</option>
            <option value="artist">{t('music.sort.byArtist')}</option>
            <option value="folder">{t('music.sort.byFolder')}</option>
          </select>
          <MediaLibraryActions onItemsChange={state.setItems} className="music-lib-actions" />
        </header>

        <MusicSearchBox state={state} />

        <div className="music-vlist-wrap">
          <MusicSongList state={state} />
        </div>

        <MusicYoutubeRow state={state} />
      </aside>

      <section className="music-main">
        {error && <div className="lib-import-err">{error}</div>}

        <MusicLyricsPane state={state} />

        <MusicControls state={state} onOpenWidget={openWidget} />

        {wired && <WiredOscilloscope className="music-osc" />}
        <MusicNowPlaying state={state} />
      </section>

      {state.popup && (
        <DictionaryPopup
          query={state.popup.query}
          context={state.activeCueText}
          x={state.popup.x}
          y={state.popup.y}
          onClose={() => state.setPopup(null)}
        />
      )}
    </div>
    </AppChrome>
  );
}
