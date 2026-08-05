import { useState } from 'react';
import type { WidgetProps } from './types';
import { readSetting } from './types';
import { useNow } from './hooks';
import { getSummary, formatDuration } from '../stats';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import WorldHeatMap from '../components/resources/WorldHeatMap';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { sendTelemetryPingIfNeeded } from '../telemetryPing';

// ---------- World clock (multiple time zones) ----------
interface Zone {
  id: string;
  label: string;
  tz: string;
}
const DEFAULT_ZONES: Zone[] = [
  { id: 'z1', label: 'Tokyo', tz: 'Asia/Tokyo' },
  { id: 'z2', label: 'London', tz: 'Europe/London' },
  { id: 'z3', label: 'New York', tz: 'America/New_York' },
];
export function WorldClock({ settings, setSettings }: WidgetProps) {
  const { t, lang } = useT();
  const now = useNow(1000);
  const zones = readSetting<Zone[]>(settings, 'zones', DEFAULT_ZONES);
  const [tz, setTz] = useState('');
  const [label, setLabel] = useState('');
  const add = () => {
    if (!tz.trim()) return;
    setSettings({ zones: [...zones, { id: `z${Date.now()}`, label: label.trim() || tz, tz: tz.trim() }] });
    setTz('');
    setLabel('');
  };
  return (
    <div className="wgt wgt-world">
      <ul className="wgt-world-list">
        {zones.map((z) => {
          let time = 'â€”';
          try {
            time = now.toLocaleTimeString(LANG_TAGS[lang], { hour: '2-digit', minute: '2-digit', timeZone: z.tz });
          } catch {
            time = t('widgets.worldClock.badTz');
          }
          return (
            <li key={z.id}>
              <span className="wgt-world-label">{z.label}</span>
              <span className="wgt-world-time">{time}</span>
              <button className="wgt-btn-icon sm" title={t('common.remove')} onClick={() => setSettings({ zones: zones.filter((x) => x.id !== z.id) })}>Ã—</button>
            </li>
          );
        })}
      </ul>
      <div className="wgt-row wgt-world-add">
        <input placeholder={t('widgets.worldClock.labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder={t('widgets.worldClock.areaPlaceholder')} value={tz} onChange={(e) => setTz(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title={t('widgets.worldClock.addZone')}>+</button>
      </div>
    </div>
  );
}

// ---------- Daily goals ----------
interface Goal {
  id: string;
  text: string;
  target: number;
  done: number;
}
export function DailyGoals({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const goals = readSetting<Goal[]>(settings, 'goals', []);
  const [draft, setDraft] = useState('');
  const write = (next: Goal[]) => setSettings({ goals: next });
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    write([...goals, { id: `g${Date.now()}`, text, target: 1, done: 0 }]);
    setDraft('');
  };
  const bump = (id: string, d: number) =>
    write(goals.map((g) => (g.id === id ? { ...g, done: Math.max(0, Math.min(g.target, g.done + d)) } : g)));
  return (
    <div className="wgt wgt-goals">
      <div className="wgt-todo-add">
        <input value={draft} placeholder={t('widgets.dailyGoals.addPlaceholder')} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title={t('common.add')}>+</button>
      </div>
      <ul className="wgt-goals-list">
        {goals.length === 0 && <li className="wgt-empty">{t('widgets.dailyGoals.emptyHint')}</li>}
        {goals.map((g) => (
          <li key={g.id} className={g.done >= g.target ? 'reached' : ''}>
            <div className="wgt-goal-top">
              <span className="wgt-goal-text">{g.text}</span>
              <span className="wgt-goal-count">{g.done}/{g.target}</span>
            </div>
            <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${(g.done / g.target) * 100}%` }} /></div>
            <div className="wgt-goal-ctrls">
              <button className="wgt-btn-icon sm" onClick={() => bump(g.id, -1)}>âˆ’</button>
              <button className="wgt-btn-icon sm" onClick={() => bump(g.id, 1)}>+</button>
              <button className="wgt-btn-icon sm" title={t('widgets.dailyGoals.raiseTarget')} onClick={() => write(goals.map((x) => (x.id === g.id ? { ...x, target: x.target + 1 } : x)))}>+T</button>
              <button className="wgt-btn-icon sm" title={t('common.remove')} onClick={() => write(goals.filter((x) => x.id !== g.id))}>Ã—</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Habit tracker (7-day) ----------
interface Habit {
  id: string;
  text: string;
  days: Record<string, boolean>; // YYYY-MM-DD -> done
}
function last7(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}
export function HabitTracker({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const habits = readSetting<Habit[]>(settings, 'habits', []);
  const [draft, setDraft] = useState('');
  const days = last7();
  const write = (next: Habit[]) => setSettings({ habits: next });
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    write([...habits, { id: `h${Date.now()}`, text, days: {} }]);
    setDraft('');
  };
  const toggle = (id: string, day: string) =>
    write(habits.map((h) => (h.id === id ? { ...h, days: { ...h.days, [day]: !h.days[day] } } : h)));
  return (
    <div className="wgt wgt-habits">
      <div className="wgt-todo-add">
        <input value={draft} placeholder={t('widgets.habitTracker.addPlaceholder')} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title={t('common.add')}>+</button>
      </div>
      <ul className="wgt-habit-list">
        {habits.length === 0 && <li className="wgt-empty">{t('widgets.habitTracker.emptyHint')}</li>}
        {habits.map((h) => (
          <li key={h.id}>
            <div className="wgt-habit-top">
              <span className="wgt-habit-text">{h.text}</span>
              <button className="wgt-btn-icon sm" title={t('common.remove')} onClick={() => write(habits.filter((x) => x.id !== h.id))}>Ã—</button>
            </div>
            <div className="wgt-habit-days">
              {days.map((d) => (
                <button
                  key={d}
                  className={`wgt-habit-day ${h.days[d] ? 'on' : ''}`}
                  title={d}
                  onClick={() => toggle(h.id, d)}
                >
                  {Number(d.slice(-2))}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Learning heatmap (last 14 days of study activity) ----------
/**
 * Intensity is reading **plus** watching (Phase 6 slice 8). The widget is called a
 * *learning* heat-map and its cells are the same "was this a day you studied" judgement
 * the streak makes, so counting only one of the two channels made an evening in the media
 * player render as an empty day. A day's tooltip names both numbers rather than only the
 * total, because a single figure would hide which activity produced it.
 */
export function LearningHeatmap() {
  const { t } = useT();
  const s = getSummary();
  const dayTotal = (d: { seconds: number; watchSeconds: number }) => d.seconds + d.watchSeconds;
  const max = Math.max(1, ...s.recent.map(dayTotal));
  const level = (sec: number) => (sec <= 0 ? 0 : Math.min(4, Math.ceil((sec / max) * 4)));
  return (
    <div className="wgt wgt-heatmap">
      <div className="wgt-heatmap-grid">
        {s.recent.map((d) => (
          <div
            key={d.date}
            className={`wgt-heat-cell l${level(dayTotal(d))}`}
            title={
              d.watchSeconds > 0
                ? t('widgets.heatmap.cellSplit', {
                    date: d.date,
                    read: formatDuration(d.seconds),
                    watched: formatDuration(d.watchSeconds),
                  })
                : `${d.date}: ${formatDuration(d.seconds)}`
            }
          />
        ))}
      </div>
      <div className="wgt-stat-sub">
        {t('widgets.heatmap.summary', {
          days: s.recent.length,
          duration: formatDuration(s.totalSeconds + s.totalWatchSeconds),
        })}
      </div>
    </div>
  );
}

// ---------- Learner map (anonymous country choropleth) ----------
export function LearnerMapWidget(_props: WidgetProps) {
  const { t } = useT();
  const [consent, setConsent] = useState<'yes' | 'no' | null>(() => {
    try {
      const v = localStorage.getItem(TELEMETRY_CONSENT_KEY);
      return v === 'yes' || v === 'no' ? v : null;
    } catch {
      return null;
    }
  });
  const [refreshToken, setRefreshToken] = useState(0);

  const shareCountry = () => {
    try {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, 'yes');
      void sendTelemetryPingIfNeeded();
    } catch {
      /* storage unavailable */
    }
    setConsent('yes');
    setRefreshToken((n) => n + 1);
  };

  return (
    <div className="wgt wgt-learner-map">
      {consent !== 'yes' ? (
        <div className="wgt-row wgt-learner-map-share">
          <button type="button" className="wgt-btn" onClick={shareCountry}>
            {t('widgets.learner-map.share')}
          </button>
        </div>
      ) : null}
      <WorldHeatMap compact refreshToken={refreshToken} />
    </div>
  );
}
