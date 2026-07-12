import { useState } from 'react';
import type { WidgetProps } from './types';
import { readSetting } from './types';
import { useNow } from './hooks';
import { getSummary, formatDuration } from '../stats';

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
          let time = '—';
          try {
            time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: z.tz });
          } catch {
            time = 'bad tz';
          }
          return (
            <li key={z.id}>
              <span className="wgt-world-label">{z.label}</span>
              <span className="wgt-world-time">{time}</span>
              <button className="wgt-btn-icon sm" title="Remove" onClick={() => setSettings({ zones: zones.filter((x) => x.id !== z.id) })}>×</button>
            </li>
          );
        })}
      </ul>
      <div className="wgt-row wgt-world-add">
        <input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder="Area/City (IANA tz)" value={tz} onChange={(e) => setTz(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title="Add zone">+</button>
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
        <input value={draft} placeholder="Add a goal…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title="Add">+</button>
      </div>
      <ul className="wgt-goals-list">
        {goals.length === 0 && <li className="wgt-empty">Set a goal or two for today.</li>}
        {goals.map((g) => (
          <li key={g.id} className={g.done >= g.target ? 'reached' : ''}>
            <div className="wgt-goal-top">
              <span className="wgt-goal-text">{g.text}</span>
              <span className="wgt-goal-count">{g.done}/{g.target}</span>
            </div>
            <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${(g.done / g.target) * 100}%` }} /></div>
            <div className="wgt-goal-ctrls">
              <button className="wgt-btn-icon sm" onClick={() => bump(g.id, -1)}>−</button>
              <button className="wgt-btn-icon sm" onClick={() => bump(g.id, 1)}>+</button>
              <button className="wgt-btn-icon sm" title="Raise target" onClick={() => write(goals.map((x) => (x.id === g.id ? { ...x, target: x.target + 1 } : x)))}>+T</button>
              <button className="wgt-btn-icon sm" title="Remove" onClick={() => write(goals.filter((x) => x.id !== g.id))}>×</button>
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
        <input value={draft} placeholder="Add a habit…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="wgt-btn-icon" onClick={add} title="Add">+</button>
      </div>
      <ul className="wgt-habit-list">
        {habits.length === 0 && <li className="wgt-empty">Track a daily habit.</li>}
        {habits.map((h) => (
          <li key={h.id}>
            <div className="wgt-habit-top">
              <span className="wgt-habit-text">{h.text}</span>
              <button className="wgt-btn-icon sm" title="Remove" onClick={() => write(habits.filter((x) => x.id !== h.id))}>×</button>
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

// ---------- Learning heatmap (last 14 days reading time) ----------
export function LearningHeatmap() {
  const s = getSummary();
  const max = Math.max(1, ...s.recent.map((d) => d.seconds));
  const level = (sec: number) => (sec <= 0 ? 0 : Math.min(4, Math.ceil((sec / max) * 4)));
  return (
    <div className="wgt wgt-heatmap">
      <div className="wgt-heatmap-grid">
        {s.recent.map((d) => (
          <div key={d.date} className={`wgt-heat-cell l${level(d.seconds)}`} title={`${d.date}: ${formatDuration(d.seconds)}`} />
        ))}
      </div>
      <div className="wgt-stat-sub">Last {s.recent.length} days · {formatDuration(s.totalSeconds)} total</div>
    </div>
  );
}
