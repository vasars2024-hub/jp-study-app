import { useEffect, useState } from 'react';
import {
  subscribe,
  getState,
  toggle,
  next,
  prev,
  setVolume,
  type PlayerState,
} from '../playerBus';

function fmt(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return '0:00';
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Mini player (queue + playback + volume) ----------
export function MiniPlayer() {
  const [st, setSt] = useState<PlayerState>(() => getState());
  useEffect(() => subscribe(setSt), []);
  const pct = st.duration > 0 ? (st.time / st.duration) * 100 : 0;
  return (
    <div className="wgt wgt-player">
      <div className="wgt-player-title" title={st.current?.title}>
        {st.current?.title ?? 'Nothing playing'}
      </div>
      <div className="wgt-player-times">
        <span>{fmt(st.time)}</span>
        <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${pct}%` }} /></div>
        <span>{fmt(st.duration)}</span>
      </div>
      <div className="wgt-row wgt-player-ctrls">
        <button className="wgt-btn-icon" title="Previous" onClick={() => prev()}>⏮</button>
        <button className="wgt-btn-icon lg" title={st.playing ? 'Pause' : 'Play'} onClick={() => toggle()}>
          {st.playing ? '⏸' : '⏵'}
        </button>
        <button className="wgt-btn-icon" title="Next" onClick={() => next()}>⏭</button>
      </div>
      <div className="wgt-row wgt-player-vol">
        <span className="wgt-vol-ic" aria-hidden>♪</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(st.volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
        <span className="wgt-player-queue">{st.queue.length} in queue</span>
      </div>
    </div>
  );
}
