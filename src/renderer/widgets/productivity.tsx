import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { WidgetProps } from './types';
import { readSetting } from './types';
import { useNow } from './hooks';
import {
  CATEGORY_COLORS,
  getUpcomingOccurrences,
  onCalendarChanged,
  type EventOccurrence,
} from '../calendar';
import { useT } from '../i18n';

// ---------- Digital clock ----------
export function DigitalClock({ settings, size }: WidgetProps) {
  const now = useNow(1000);
  const h24 = readSetting(settings, 'hour24', true);
  const showSeconds = readSetting(settings, 'showSeconds', true);
  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: !h24,
  });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const big = Math.min(size.w / (showSeconds ? 7.2 : 5.2), size.h / 3.2);
  return (
    <div className="wgt wgt-clock-digital">
      <div className="wgt-clock-time" style={{ fontSize: Math.max(20, big) }}>
        {time}
      </div>
      <div className="wgt-clock-date">{date}</div>
    </div>
  );
}

// ---------- Analog clock ----------
export function AnalogClock({ size }: WidgetProps) {
  const now = useNow(1000);
  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;
  const r = Math.max(40, Math.min(size.w, size.h) / 2 - 10);
  const cx = r + 10;
  const cy = r + 10;
  const hand = (angleDeg: number, len: number, w: number, cls: string) => {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return (
      <line
        className={cls}
        x1={cx}
        y1={cy}
        x2={cx + Math.cos(a) * len}
        y2={cy + Math.sin(a) * len}
        strokeWidth={w}
        strokeLinecap="round"
      />
    );
  };
  return (
    <div className="wgt wgt-clock-analog">
      <svg viewBox={`0 0 ${cx + r + 10} ${cy + r + 10}`} width="100%" height="100%">
        <circle className="wgt-analog-face" cx={cx} cy={cy} r={r} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = ((i * 30 - 90) * Math.PI) / 180;
          return (
            <line
              key={i}
              className="wgt-analog-tick"
              x1={cx + Math.cos(a) * (r - 6)}
              y1={cy + Math.sin(a) * (r - 6)}
              x2={cx + Math.cos(a) * (r - 1)}
              y2={cy + Math.sin(a) * (r - 1)}
            />
          );
        })}
        {hand((h + m / 60) * 30, r * 0.5, 3.5, 'wgt-analog-hour')}
        {hand((m + s / 60) * 6, r * 0.72, 2.5, 'wgt-analog-min')}
        {hand(s * 6, r * 0.82, 1.2, 'wgt-analog-sec')}
        <circle className="wgt-analog-pin" cx={cx} cy={cy} r={2.5} />
      </svg>
    </div>
  );
}

// ---------- Calendar ----------
// Lightweight view of the main Calendar (see calendar.ts + views/CalendarView.tsx):
// shows the current month grid plus the next few upcoming events, and opens
// the full Calendar app on click. Never duplicates calendar logic — the month
// grid here is pure display, events/recurrence live only in calendar.ts.
export function CalendarWidget() {
  const { t } = useT();
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [upcoming, setUpcoming] = useState<EventOccurrence[]>(() => getUpcomingOccurrences(4));
  useEffect(() => onCalendarChanged(() => setUpcoming(getUpcomingOccurrences(4))), []);

  const today = new Date();
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startDow = first.getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  }, [view]);
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const shift = (delta: number, e: MouseEvent) => {
    e.stopPropagation();
    const m = view.m + delta;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };
  const isToday = (d: number) =>
    d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
  const openFull = () => window.dispatchEvent(new CustomEvent('os:open', { detail: 'calendar' }));
  return (
    <div className="wgt wgt-cal" onClick={openFull} role="button" tabIndex={0} title={t('widgets.calendarWidget.openTitle')}>
      <div className="wgt-cal-head">
        <button className="wgt-btn-icon" onClick={(e) => shift(-1, e)} title={t('widgets.calendarWidget.prevMonth')}>‹</button>
        <span>{monthLabel}</span>
        <button className="wgt-btn-icon" onClick={(e) => shift(1, e)} title={t('widgets.calendarWidget.nextMonth')}>›</button>
      </div>
      <div className="wgt-cal-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="wgt-cal-dow">{d}</span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className={`wgt-cal-day ${d && isToday(d) ? 'today' : ''} ${d ? '' : 'empty'}`}>
            {d ?? ''}
          </span>
        ))}
      </div>
      {upcoming.length > 0 && (
        <ul className="wgt-cal-upcoming">
          {upcoming.map((ev) => (
            <li key={`${ev.id}-${ev.occurrenceDate}`}>
              <span className="wgt-cal-dot" style={{ background: ev.color || CATEGORY_COLORS[ev.category] }} />
              <span className="wgt-cal-ev-title">{ev.title}</span>
              <span className="muted wgt-cal-ev-date">
                {new Date(ev.occurrenceDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Pomodoro ----------
export function Pomodoro({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const workMin = readSetting(settings, 'workMin', 25);
  const breakMin = readSetting(settings, 'breakMin', 5);
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [left, setLeft] = useState(workMin * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setLeft((v) => {
        if (v > 1) return v - 1;
        // Session end → flip mode.
        const nextMode = mode === 'work' ? 'break' : 'work';
        setMode(nextMode);
        setRunning(false);
        return (nextMode === 'work' ? workMin : breakMin) * 60;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [running, mode, workMin, breakMin]);

  // Reset the clock when the durations change while idle.
  useEffect(() => {
    if (!running) setLeft((mode === 'work' ? workMin : breakMin) * 60);
  }, [workMin, breakMin, mode, running]);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const total = (mode === 'work' ? workMin : breakMin) * 60;
  const pct = total > 0 ? 1 - left / total : 0;
  return (
    <div className="wgt wgt-pomo">
      <div className="wgt-pomo-mode">{mode === 'work' ? t('widgets.pomodoro.focus') : t('widgets.pomodoro.break')}</div>
      <div className="wgt-pomo-time">{mm}:{ss}</div>
      <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${pct * 100}%` }} /></div>
      <div className="wgt-row">
        <button className="wgt-btn" onClick={() => setRunning((r) => !r)}>{running ? t('common.pause') : t('common.start')}</button>
        <button
          className="wgt-btn"
          onClick={() => {
            setRunning(false);
            setLeft((mode === 'work' ? workMin : breakMin) * 60);
          }}
        >
          {t('common.reset')}
        </button>
      </div>
      <div className="wgt-row wgt-pomo-cfg">
        <label>{t('widgets.pomodoro.focus')}
          <input type="number" min={1} max={90} value={workMin}
            onChange={(e) => setSettings({ workMin: Math.max(1, Number(e.target.value) || 25) })} />
        </label>
        <label>{t('widgets.pomodoro.break')}
          <input type="number" min={1} max={60} value={breakMin}
            onChange={(e) => setSettings({ breakMin: Math.max(1, Number(e.target.value) || 5) })} />
        </label>
      </div>
    </div>
  );
}

// ---------- Stopwatch ----------
export function Stopwatch() {
  const { t } = useT();
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const baseRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    const t = window.setInterval(() => setMs(baseRef.current + (performance.now() - startRef.current)), 50);
    return () => window.clearInterval(t);
  }, [running]);
  const stop = () => {
    baseRef.current = ms;
    setRunning(false);
  };
  const reset = () => {
    baseRef.current = 0;
    setMs(0);
    setRunning(false);
  };
  const total = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const label = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  return (
    <div className="wgt wgt-stopwatch">
      <div className="wgt-pomo-time">{label}</div>
      <div className="wgt-row">
        <button className="wgt-btn" onClick={() => (running ? stop() : setRunning(true))}>{running ? t('common.stop') : t('common.start')}</button>
        <button className="wgt-btn" onClick={reset}>{t('common.reset')}</button>
      </div>
    </div>
  );
}

// ---------- Countdown ----------
export function Countdown({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const minutes = readSetting(settings, 'minutes', 10);
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLeft((v) => (v > 1 ? v - 1 : (setRunning(false), 0))), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (!running) setLeft(minutes * 60);
  }, [minutes, running]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const done = left === 0;
  return (
    <div className="wgt wgt-countdown">
      <div className={`wgt-pomo-time ${done ? 'wgt-flash' : ''}`}>{mm}:{ss}</div>
      <div className="wgt-row">
        <button className="wgt-btn" onClick={() => setRunning((r) => !r)}>{running ? t('common.pause') : t('common.start')}</button>
        <button className="wgt-btn" onClick={() => { setRunning(false); setLeft(minutes * 60); }}>{t('common.reset')}</button>
        <label className="wgt-inline-cfg">{t('widgets.countdown.minLabel')}
          <input type="number" min={1} max={999} value={minutes}
            onChange={(e) => setSettings({ minutes: Math.max(1, Number(e.target.value) || 10) })} />
        </label>
      </div>
    </div>
  );
}

// ---------- To-do ----------
interface Todo {
  id: string;
  text: string;
  done: boolean;
}
export function TodoList({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const items = readSetting<Todo[]>(settings, 'items', []);
  const [draft, setDraft] = useState('');
  const write = (next: Todo[]) => setSettings({ items: next });
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    write([...items, { id: `t${Date.now()}`, text, done: false }]);
    setDraft('');
  };
  return (
    <div className="wgt wgt-todo">
      <div className="wgt-todo-add">
        <input
          value={draft}
          placeholder={t('widgets.todo.addPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="wgt-btn-icon" onClick={add} title={t('common.add')}>+</button>
      </div>
      <ul className="wgt-todo-list">
        {items.length === 0 && <li className="wgt-empty">{t('widgets.todo.emptyHint')}</li>}
        {items.map((it) => (
          <li key={it.id} className={it.done ? 'done' : ''}>
            <label>
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => write(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
              />
              <span>{it.text}</span>
            </label>
            <button className="wgt-btn-icon" title={t('common.remove')} onClick={() => write(items.filter((x) => x.id !== it.id))}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
