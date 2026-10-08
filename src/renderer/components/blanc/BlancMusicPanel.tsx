/**
 * Blanc music library panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useT } from '../../i18n';
import {
  MusicControls,
  MusicLyricsPane,
  MusicNowPlaying,
  MusicSearchBox,
  MusicSongList,
  MusicYoutubeRow,
  useMusic,
  type SortBy,
} from '../music/MusicContent';
import DictionaryPopup from '../DictionaryPopup';

/**
 * Pillar 2 port of `MusicView` — Blanc previously had only the `FocusMusicBar`
 * taskbar widget, no library surface. Playback goes through the same
 * `playerBus`, so opening this panel does not fight the mini-player or the
 * Study OS window: they are one transport.
 *
 * The song list is the shared `VirtualList` build, which is what keeps a
 * thousand-track library from dropping frames while the window is dragged.
 */
export function BlancMusicPanel() {
  const { t } = useT();
  const state = useMusic();
  const { ps } = state;
  const lyrics = state.liveLyrics.lyrics;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.music.library')}</legend>
        <MusicSearchBox state={state} />
        <div className="blanc-status-row">
          <span>{t('blanc.study.music.songCount', { count: state.baseSongs.length })}</span>
          <span>{t('blanc.study.music.rowCount', { count: state.rows.length })}</span>
          <select
            value={state.sortBy}
            onChange={(e) => state.setSortBy(e.target.value as SortBy)}
            aria-label={t('music.sortSelect.title')}
          >
            <option value="recent">{t('music.sort.recent')}</option>
            <option value="title">{t('music.sort.byTitle')}</option>
            <option value="artist">{t('music.sort.byArtist')}</option>
            <option value="folder">{t('music.sort.byFolder')}</option>
          </select>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={state.likedOnly}
              onChange={() => state.setLikedOnly((v) => !v)}
            />
            <span>{t('blanc.study.music.likedOnly')}</span>
          </label>
        </div>
        <div className="blanc-music-list">
          <MusicSongList state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('mediaCenter.music.nowPlaying')}</legend>
        {state.error && <p className="blanc-note">{state.error}</p>}
        <MusicControls state={state} />
        <MusicNowPlaying state={state} />
        {!ps.current && <p className="blanc-note">{t('blanc.study.music.pickSong')}</p>}
      </fieldset>

      <fieldset>
        <legend>
          {lyrics.kind === 'synced'
            ? t('blanc.study.music.lyricsCues', { count: lyrics.cues.length })
            : t('music.controls.lyrics')}
        </legend>
        <div className="blanc-music-lyrics">
          <MusicLyricsPane state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.music.addYoutube')}</legend>
        <MusicYoutubeRow state={state} />
      </fieldset>

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
  );
}
