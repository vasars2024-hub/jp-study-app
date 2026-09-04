import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';
import VisualizerCanvas from './VisualizerCanvas';
import * as player from '../playerBus';
import { coverFor, paletteFor, accentPalette, type Palette } from '../albumArt';
import { isLiked, onLikedChanged, toggleLiked } from '../likedSongs';
import { guessSongMeta } from '../lyrics';
import { useLiveLyrics, type LyricsState } from '../liveLyrics';
import { loadVizSettings, onVizSettingsChanged } from '../visualizerSettings';
import { loadMusicWidgetSettings, onMusicWidgetSettingsChanged, toggleShowLyrics } from '../musicWidgetSettings';
import { openSectionSurface } from '../sectionSurface';
import { useT } from '../i18n';
import './musicWidgetLiquid.css';

// Mini-player desktop widget: a live little version of the Music app.
// Responsive — a slim bar when small, a full grid with big album art when
// large. Background tints to the current song's album-art palette, with the
// visualizer glowing faintly behind everything. An optional two-line lyrics
// strip (toggle-bound, off by default) rides underneath, sharing the same
// lyrics cache as the full Music app.

function fmt(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Compact, always-exactly-two-line karaoke strip: current line + the one after it. */
function LyricsStrip({
  lyrics,
  activeIndex,
  t,
}: {
  lyrics: LyricsState;
  activeIndex: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (lyrics.kind === 'synced' && activeIndex >= 0) {
    const cur = lyrics.cues[activeIndex]?.text ?? '';
    const next = lyrics.cues[activeIndex + 1]?.text ?? '';
    return (
      <div className="mwidget-lyrics">
        <div className="mwidget-lyrics-track" key={activeIndex}>
          <div className="mwidget-lyrics-line current">{cur}</div>
          <div className="mwidget-lyrics-line">{next}</div>
        </div>
      </div>
    );
  }
  if (lyrics.kind === 'plain' && lyrics.lines.length) {
    return (
      <div className="mwidget-lyrics">
        <div className="mwidget-lyrics-track">
          <div className="mwidget-lyrics-line current">{lyrics.lines[0]}</div>
          <div className="mwidget-lyrics-line">{lyrics.lines[1] ?? ''}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mwidget-lyrics">
      <span className="mwidget-lyrics-hint muted">
        {lyrics.kind === 'loading' ? t('music.lyricsLoading') : t('music.noLyrics')}
      </span>
    </div>
  );
}

export default function MusicWidget() {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [ps, setPs] = useState(player.getState);
  const [big, setBig] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [art, setArt] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [liked, setLiked] = useState(false);
  const [viz, setViz] = useState(loadVizSettings);
  const [widgetSettings, setWidgetSettings] = useState(loadMusicWidgetSettings);

  useEffect(() => player.subscribe(setPs), []);
  useEffect(() => onVizSettingsChanged(setViz), []);
  useEffect(() => onMusicWidgetSettingsChanged(setWidgetSettings), []);
  useEffect(
    () => onLikedChanged(() => setLiked(ps.current ? isLiked(ps.current.id) : false)),
    [ps.current?.id],
  );

  const liveLyrics = useLiveLyrics(ps.current, ps.duration, ps.time);

  // Layout switches on the widget's own size, not the screen's.
  //
  // `narrow` is the WIDTH half, added with the 32px hit floor: the seven transport buttons
  // need 236 px of row, and the bar layout only offers them what is left after the art tile
  // and the title. Measured at the compact 300x160 the rubric drives, before this existed:
  // `div.mwidget` reported scrollWidth 381 against clientWidth 298 and the last three
  // buttons hung 15/49/83 px past the right edge, invisible under the root's
  // `overflow: hidden`. The threshold is the width at which that row stops fitting beside
  // the tile, not a device breakpoint. Nothing is hidden at any size; the row moves.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBig(el.clientHeight >= 210);
      setNarrow(el.clientWidth < 400);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Art + palette + liked follow the current song.
  useEffect(() => {
    const id = ps.current?.id;
    setLiked(id ? isLiked(id) : false);
    if (!id) {
      setArt(null);
      setPalette(null);
      return;
    }
    let alive = true;
    void coverFor(id).then((u) => alive && setArt(u));
    void paletteFor(id).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [ps.current?.id]);

  // If the widget is the first thing used, give the player a queue.
  useEffect(() => {
    if (player.getState().queue.length === 0) {
      void window.api.listMedia().then((items) => {
        const songs = items.filter((it) => /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(it.fileName));
        if (player.getState().queue.length === 0) player.setQueue(songs);
      });
    }
  }, []);

  const pal = palette ?? accentPalette();
  const meta = ps.current ? guessSongMeta(ps.current) : null;
  const bg = `linear-gradient(135deg, ${pal.primary}55, ${pal.secondary}33), rgba(12, 11, 16, 0.72)`;

  const heart = () => {
    if (ps.current) setLiked(toggleLiked(ps.current.id));
  };

  const repeatLabel = t('music.controls.repeatTitle', { mode: t(`music.repeat.${ps.repeat}`) });

  // Every control carries its own accessible name, and the three real toggles
  // carry `aria-pressed` rather than only the `on` class. The name of a toggle
  // button stays CONSTANT and its state is the attribute — a name that flips
  // between "Add to Liked" and "Unlike" makes the same control announce as two
  // different ones, and a class conveys nothing to a screen reader at all.
  // Repeat is a three-way cycle, not a toggle, so it keeps the Music app's own
  // "Repeat: {mode}" name, which already states the state it is in.
  const playLabel = t(ps.playing ? 'music.controls.pause' : 'music.controls.play');
  // L9 category 3, measured 2026-09-04 on the live 430x190 window: the widget had NO
  // Liquid-eligible region at all, so the presentation flip changed nothing below the
  // title bar. The transport cluster is the surface's contextual chrome — the one thing
  // §2.3 reserves Liquid for — so it becomes a named `toolbar` on the shared primitive.
  // The name is the region's, not a control's; every button keeps its own.
  const controls = (
    <div
      className="mwidget-controls lq-contextual"
      role="toolbar"
      aria-label={t('music.controls.transport')}
    >
      <button
        className={`mwidget-btn ${ps.shuffle ? 'on' : ''}`}
        title={t('music.controls.shuffle')}
        aria-label={t('music.controls.shuffle')}
        aria-pressed={ps.shuffle}
        onClick={player.toggleShuffle}
      >
        <Icon name="shuffle" size={13} />
      </button>
      <button
        className="mwidget-btn"
        title={t('music.controls.previous')}
        aria-label={t('music.controls.previous')}
        onClick={player.prev}
        disabled={!ps.current}
      >
        <Icon name="skip-back" size={13} />
      </button>
      <button
        className="mwidget-btn mwidget-play"
        title={playLabel}
        aria-label={playLabel}
        onClick={player.toggle}
        disabled={!ps.current}
      >
        <Icon name={ps.playing ? 'pause' : 'player'} size={15} />
      </button>
      <button
        className="mwidget-btn"
        title={t('music.controls.next')}
        aria-label={t('music.controls.next')}
        onClick={player.next}
        disabled={!ps.current}
      >
        <Icon name="skip-forward" size={13} />
      </button>
      <button
        className={`mwidget-btn mwidget-repeat ${ps.repeat !== 'off' ? 'on' : ''}`}
        title={repeatLabel}
        aria-label={repeatLabel}
        onClick={player.cycleRepeat}
      >
        <Icon name="repeat" size={13} />
        {ps.repeat === 'one' && <span className="mwidget-repeat-one">1</span>}
      </button>
      <button
        className={`mwidget-btn mwidget-heart ${liked ? 'on' : ''}`}
        title={t('music.controls.addToLiked')}
        aria-label={t('music.controls.addToLiked')}
        aria-pressed={liked}
        onClick={heart}
        disabled={!ps.current}
      >
        <Icon name="heart" size={13} fill={liked} />
      </button>
      <button
        className={`mwidget-btn mwidget-lyrics-toggle ${widgetSettings.showLyrics ? 'on' : ''}`}
        title={t('music.controls.lyrics')}
        aria-label={t('music.controls.lyrics')}
        aria-pressed={widgetSettings.showLyrics}
        onClick={() => setWidgetSettings(toggleShowLyrics())}
      >
        <Icon name="caption" size={13} />
      </button>
    </div>
  );

  // The two precision inputs — seek and volume — share ONE stable plate instead of floating
  // on the album tint with the visualizer animating behind them at 0.35 opacity. §2.3 keeps
  // dense work on an anchor in BOTH presentations, so this plate does not follow the flip;
  // only the toolbar above does. Volume moved here from the button cluster for the same
  // reason: a slider inside a translucent contextual region is work inside glass.
  const progress = (
    <div className="mwidget-progress">
      <span className="mwidget-time">{fmt(ps.time)}</span>
      <input
        type="range"
        min={0}
        max={ps.duration || 1}
        step={0.1}
        value={Math.min(ps.time, ps.duration || 1)}
        onChange={(e) => player.seek(Number(e.target.value))}
        disabled={!ps.current}
        aria-label={t('a11y.slider.trackPosition')}
      />
      <span className="mwidget-time">{fmt(ps.duration)}</span>
      <div className="mwidget-vol" title={t('music.controls.volume')}>
        <Icon name="volume" size={13} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={ps.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          aria-label={t('music.controls.volume')}
        />
      </div>
    </div>
  );

  const artTile = (cls: string) =>
    art ? (
      <img className={cls} src={art} alt="" draggable={false} />
    ) : (
      <div className={`${cls} mwidget-art-empty`} style={{ background: `linear-gradient(135deg, ${pal.primary}, ${pal.secondary})` }}>
        <Icon name="music" size={big ? 40 : 22} />
      </div>
    );

  return (
    <div
      ref={rootRef}
      className={`mwidget ${big ? 'big' : 'bar'}${narrow ? ' narrow' : ''}`}
      style={{ background: bg }}
    >
      {viz.enabled && (
        <VisualizerCanvas className="mwidget-viz" settings={viz} idleBaseline={false} />
      )}
      {!ps.current ? (
        // L9: the old copy read "Nothing playing — pick a song in Music", which
        // named an action and offered none — the same dead end the Visualizer
        // idle hint had. The route goes through `openSectionSurface` because
        // this widget also renders inside a `?popout=musicwidget` window, where
        // a bare `os:open` dispatch has no listener at all.
        <div className="mwidget-empty muted">
          <Icon name="music" size={26} />
          <span>{t('music.widget.empty')}</span>
          <button
            type="button"
            className="btn small mwidget-empty-open"
            onClick={() => openSectionSurface('music')}
          >
            {t('commands.nav.open.music')}
          </button>
        </div>
      ) : big ? (
        <div className="mwidget-grid">
          {artTile('mwidget-art-big')}
          <div className="mwidget-title" title={ps.current.fileName}>
            {meta?.title}
          </div>
          {meta?.artist && <div className="mwidget-artist muted">{meta.artist}</div>}
          {progress}
          {controls}
          {widgetSettings.showLyrics && (
            <LyricsStrip lyrics={liveLyrics.lyrics} activeIndex={liveLyrics.activeIndex} t={t} />
          )}
        </div>
      ) : (
        <div className="mwidget-bar">
          {artTile('mwidget-art-small')}
          <div className="mwidget-bar-text">
            <div className="mwidget-title" title={ps.current.fileName}>
              {meta?.title}
            </div>
            {meta?.artist && <div className="mwidget-artist muted">{meta.artist}</div>}
          </div>
          {controls}
          <div className="mwidget-bar-progress">{progress}</div>
          {widgetSettings.showLyrics && (
            <div className="mwidget-bar-lyrics">
              <LyricsStrip lyrics={liveLyrics.lyrics} activeIndex={liveLyrics.activeIndex} t={t} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
