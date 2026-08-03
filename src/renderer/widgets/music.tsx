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
import Icon from '../components/Icons';
import { useT } from '../i18n';
import { useWiredMaterials } from '../components/ui';
import WiredOscilloscope from '../components/wired/WiredOscilloscope';

function fmt(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return '0:00';
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Mini player (queue + playback + volume) ----------
export function MiniPlayer() {
  const { t } = useT();
  const wired = useWiredMaterials();
  const [st, setSt] = useState<PlayerState>(() => getState());
  useEffect(() => subscribe(setSt), []);
  const pct = st.duration > 0 ? (st.time / st.duration) * 100 : 0;
  return (
    <div className="wgt wgt-player">
      <div className="wgt-player-title" title={st.current?.title}>
        {st.current?.title ?? t('widgets.miniPlayer.nothingPlaying')}
      </div>
      {wired && <WiredOscilloscope className="wgt-player-osc" />}
      <div className="wgt-player-times">
        <span>{fmt(st.time)}</span>
        <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${pct}%` }} /></div>
        <span>{fmt(st.duration)}</span>
      </div>
      <div className="wgt-row wgt-player-ctrls">
        <button className="wgt-btn-icon" title={t('widgets.miniPlayer.previous')} onClick={() => prev()}>
          <Icon name="skip-back" size={14} />
        </button>
        <button className="wgt-btn-icon lg" title={st.playing ? t('common.pause') : t('widgets.miniPlayer.play')} onClick={() => toggle()}>
          <Icon name={st.playing ? 'pause' : 'player'} size={15} />
        </button>
        <button className="wgt-btn-icon" title={t('widgets.miniPlayer.next')} onClick={() => next()}>
          <Icon name="skip-forward" size={14} />
        </button>
      </div>
      <div className="wgt-row wgt-player-vol">
        <span className="wgt-vol-ic" aria-hidden>
          <Icon name="volume" size={13} />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(st.volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-label={t('music.controls.volume')}
        />
        <span className="wgt-player-queue">{t('widgets.miniPlayer.inQueue', { count: st.queue.length })}</span>
      </div>
    </div>
  );
}
