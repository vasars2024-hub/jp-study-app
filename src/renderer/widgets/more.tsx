import { useState } from 'react';
import type { WidgetProps } from './types';
import { readSetting } from './types';
import { useNow } from './hooks';
import { getSummary, formatDuration } from '../stats';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import WorldHeatMap from '../components/resources/WorldHeatMap';
import DailyGoalPanel from '../components/DailyGoalPanel';
import './widgets.css';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { sendTelemetryPingIfNeeded } from '../telemetryPing';

// ---------- World clock (multiple time zones) ----------
interface Zone {
  id: string;
  /** What the user typed; empty for the built-in zones, whose names are translated. */
  label: string;
  tz: string;
}
/**
 * The built-in zones' city names are UI text, so they are resolved from a key at
 * render time. A layout saved before that stored the English name as `label`;
 * that exact name on the same built-in id and zone is treated as "not renamed".
 */
const BUILTIN_ZONE_CITY: Record<string, { tz: string; key: string; legacyLabel: string }> = {
  z1: { tz: 'Asia/Tokyo', key: 'widgets.worldClock.city.tokyo', legacyLabel: 'Tokyo' },
  z2: { tz: 'Europe/London', key: 'widgets.worldClock.city.london', legacyLabel: 'London' },
  z3: { tz: 'America/New_York', key: 'widgets.worldClock.city.newYork', legacyLabel: 'New York' },
};
const DEFAULT_ZONES: Zone[] = Object.entries(BUILTIN_ZONE_CITY).map(([id, z]) => ({ id, label: '', tz: z.tz }));

export function worldClockZoneLabel(zone: Zone, t: (key: string) => string): string {
  const builtin = BUILTIN_ZONE_CITY[zone.id];
  if (builtin && builtin.tz === zone.tz && (!zone.label || zone.label === builtin.legacyLabel)) return t(builtin.key);
  if (zone.label && zone.label !== zone.tz) return zone.label;
  // No name typed: the city part of the IANA id ("America/Sao_Paulo" -> "Sao Paulo").
  return zone.tz.split('/').pop()?.replace(/_/g, ' ') || zone.tz;
}
export function WorldClock({ settings, setSettings }: WidgetProps) {
  const { t, lang } = useT();
  const now = useNow(1000);
  const zones = readSetting<Zone[]>(settings, 'zones', DEFAULT_ZONES);
  const [tz, setTz] = useState('');
  const [label, setLabel] = useState('');
  const add = () => {
    if (!tz.trim()) return;
    setSettings({ zones: [...zones, { id: `z${Date.now()}`, label: label.trim(), tz: tz.trim() }] });
    setTz('');
    setLabel('');
  };
  return (
    <div className="wgt wgt-world">
      <ul className="wgt-world-list">
        {zones.map((z) => {
          let time = '—';
          try {
            time = now.toLocaleTimeString(LANG_TAGS[lang], { hour: '2-digit', minute: '2-digit', timeZone: z.tz });
          } catch {
            time = t('widgets.worldClock.badTz');
          }
          return (
            <li key={z.id}>
              <span className="wgt-world-label">{worldClockZoneLabel(z, t)}</span>
              <span className="wgt-world-time">{time}</span>
              <button className="wgt-btn-icon sm" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => setSettings({ zones: zones.filter((x) => x.id !== z.id) })}>×</button>
            </li>
          );
        })}
      </ul>
      <div className="wgt-row wgt-world-add">
        <input placeholder={t('widgets.worldClock.labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder={t('widgets.worldClock.areaPlaceholder')} value={tz} onChange={(e) => setTz(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title={t('widgets.worldClock.addZone')} aria-label={t('widgets.worldClock.addZone')}>+</button>
      </div>
    </div>
  );
}

// ---------- Daily goal ----------
// The study goal (reviews, new cards, minutes) counted from the real review log
// and study statistics; see components/DailyGoalPanel.tsx. It replaced a list of
// free-text goals whose counters never reset and whose target could only go up.
// Goals a user had written there are kept as a small daily checklist (ticks
// clear at local midnight) so nothing they typed disappears; new ones are not
// offered — the To-do and Habit widgets cover that.
interface LegacyGoal {
  id: string;
  text: string;
  /** Local day (YYYY-MM-DD) the goal was ticked; any other day reads unticked. */
  doneDay?: string;
}
function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function DailyGoals({ settings, setSettings, size }: WidgetProps) {
  const { t } = useT();
  const legacy = readSetting<LegacyGoal[]>(settings, 'goals', []).filter((g) => g && typeof g.text === 'string');
  const today = localDay(useNow(60_000));
  const write = (next: LegacyGoal[]) => setSettings({ goals: next });
  return (
    <div className="wgt wgt-goals">
      <DailyGoalPanel compact={size.h < 200 || legacy.length > 0} />
      {legacy.length > 0 && (
        <ul className="wgt-goals-list wgt-goals-own" aria-label={t('dailyGoal.ownGoals')}>
          {legacy.map((g) => {
            const done = g.doneDay === today;
            return (
              <li key={g.id} className={done ? 'reached' : ''}>
                <label className="wgt-goal-top">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => write(legacy.map((x) => (x.id === g.id ? { ...x, doneDay: done ? undefined : today } : x)))}
                  />
                  <span className="wgt-goal-text">{g.text}</span>
                </label>
                <button className="wgt-btn-icon sm" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => write(legacy.filter((x) => x.id !== g.id))}>×</button>
              </li>
            );
          })}
        </ul>
      )}
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
        <button className="wgt-btn-icon" onClick={add} title={t('common.add')} aria-label={t('common.add')}>+</button>
      </div>
      <ul className="wgt-habit-list">
        {habits.length === 0 && <li className="wgt-empty">{t('widgets.habitTracker.emptyHint')}</li>}
        {habits.map((h) => (
          <li key={h.id}>
            <div className="wgt-habit-top">
              <span className="wgt-habit-text">{h.text}</span>
              <button className="wgt-btn-icon sm" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => write(habits.filter((x) => x.id !== h.id))}>×</button>
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
