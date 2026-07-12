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
function LyricsStrip({ lyrics, activeIndex }: { lyrics: LyricsState; activeIndex: number }) {
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
        {lyrics.kind === 'loading' ? 'Finding lyrics…' : 'No lyrics found'}
      </span>
    </div>
  );
}

export default function MusicWidget() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ps, setPs] = useState(player.getState);
  const [big, setBig] = useState(false);
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
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBig(el.clientHeight >= 210));
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

  const controls = (
    <div className="mwidget-controls">
      <button
        className={`mwidget-btn ${ps.shuffle ? 'on' : ''}`}
        title="Shuffle"
        onClick={player.toggleShuffle}
      >
        <Icon name="shuffle" size={13} />
      </button>
      <button className="mwidget-btn" title="Previous" onClick={player.prev} disabled={!ps.current}>
        <Icon name="skip-back" size={13} />
      </button>
      <button className="mwidget-btn mwidget-play" onClick={player.toggle} disabled={!ps.current}>
        <Icon name={ps.playing ? 'pause' : 'player'} size={15} />
      </button>
      <button className="mwidget-btn" title="Next" onClick={player.next} disabled={!ps.current}>
        <Icon name="skip-forward" size={13} />
      </button>
      <button
        className={`mwidget-btn mwidget-repeat ${ps.repeat !== 'off' ? 'on' : ''}`}
        title={`Repeat: ${ps.repeat}`}
        onClick={player.cycleRepeat}
      >
        <Icon name="repeat" size={13} />
        {ps.repeat === 'one' && <span className="mwidget-repeat-one">1</span>}
      </button>
      <button
        className={`mwidget-btn mwidget-heart ${liked ? 'on' : ''}`}
        title={liked ? 'Unlike' : 'Add to Liked'}
        onClick={heart}
        disabled={!ps.current}
      >
        <Icon name="heart" size={13} fill={liked} />
      </button>
      <button
        className={`mwidget-btn mwidget-lyrics-toggle ${widgetSettings.showLyrics ? 'on' : ''}`}
        title={widgetSettings.showLyrics ? 'Hide lyrics' : 'Show lyrics'}
        onClick={() => setWidgetSettings(toggleShowLyrics())}
      >
        <Icon name="caption" size={13} />
      </button>
      <div className="mwidget-vol" title="Volume">
        <Icon name="volume" size={13} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={ps.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );

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
      />
      <span className="mwidget-time">{fmt(ps.duration)}</span>
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
    <div ref={rootRef} className={`mwidget ${big ? 'big' : 'bar'}`} style={{ background: bg }}>
      {viz.enabled && (
        <VisualizerCanvas className="mwidget-viz" settings={viz} idleBaseline={false} />
      )}
      {!ps.current ? (
        <div className="mwidget-empty muted">
          <Icon name="music" size={26} />
          <span>Nothing playing — pick a song in Music</span>
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
            <LyricsStrip lyrics={liveLyrics.lyrics} activeIndex={liveLyrics.activeIndex} />
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
              <LyricsStrip lyrics={liveLyrics.lyrics} activeIndex={liveLyrics.activeIndex} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
