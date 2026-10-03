import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { WidgetProps } from './types';
import { readSetting } from './types';
import { useNow } from './hooks';
import {
  CATEGORY_COLORS,
  getUpcomingOccurrences,
  onCalendarChanged,
  parseDateKey,
  type EventOccurrence,
} from '../calendar';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import { timerElapsedMs, timerRemainingMs, useWidgetTimer } from './timerStore';

// ---------- Digital clock ----------
export function DigitalClock({ settings, size }: WidgetProps) {
  const { lang } = useT();
  const now = useNow(1000);
  const h24 = readSetting(settings, 'hour24', true);
  const showSeconds = readSetting(settings, 'showSeconds', true);
  const time = now.toLocaleTimeString(LANG_TAGS[lang], {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: !h24,
  });
  const date = now.toLocaleDateString(LANG_TAGS[lang], { weekday: 'long', month: 'short', day: 'numeric' });
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
  const { t, lang } = useT();
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
  // Sunday-first like the grid below (`getDay()`), one CLDR "narrow" glyph per
  // day in the interface language: S M T W T F S / 日 月 火 … / В П В С Ч П С.
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(LANG_TAGS[lang], { weekday: 'narrow' });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
  }, [lang]);
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(LANG_TAGS[lang], { month: 'long', year: 'numeric' });
  const shift = (delta: number, e: MouseEvent) => {
    e.stopPropagation();
    const m = view.m + delta;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };
  const isToday = (d: number) =>
    d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
  const openFull = () => window.dispatchEvent(new CustomEvent('os:open', { detail: 'calendar' }));
  return (
    <div className="wgt wgt-cal" onClick={openFull} role="button" tabIndex={0} title={t('widgets.calendarWidget.openTitle')}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) openFull();
        }
      }}>
      <div className="wgt-cal-head">
        <button className="wgt-btn-icon" onClick={(e) => shift(-1, e)} title={t('widgets.calendarWidget.prevMonth')} aria-label={t('widgets.calendarWidget.prevMonth')}>‹</button>
        <span>{monthLabel}</span>
        <button className="wgt-btn-icon" onClick={(e) => shift(1, e)} title={t('widgets.calendarWidget.nextMonth')} aria-label={t('widgets.calendarWidget.nextMonth')}>›</button>
      </div>
      <div className="wgt-cal-grid">
        {weekdays.map((d, i) => (
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
                {parseDateKey(ev.occurrenceDate).toLocaleDateString(LANG_TAGS[lang], { month: 'short', day: 'numeric' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Timers (Pomodoro / Stopwatch / Countdown) ----------
// State lives in timerStore, keyed by the widget instance, so collapsing a
// widget (which unmounts its body) no longer resets a running clock, and a
// finished countdown chimes even while collapsed.
function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function Pomodoro({ settings, setSettings, instanceId }: WidgetProps) {
  const { t } = useT();
  const workMin = readSetting(settings, 'workMin', 25);
  const breakMin = readSetting(settings, 'breakMin', 5);
  const timer = useWidgetTimer(instanceId, 'pomodoro', workMin * 60_000, {
    work: workMin * 60_000,
    break: breakMin * 60_000,
  });
  const { state, now } = timer;
  const left = timerRemainingMs(state, now);
  const pct = state.durationMs > 0 ? 1 - left / state.durationMs : 0;
  return (
    <div className="wgt wgt-pomo">
      <div className="wgt-pomo-mode">{state.phase === 'work' ? t('widgets.pomodoro.focus') : t('widgets.pomodoro.break')}</div>
      <div className="wgt-pomo-time">{mmss(left)}</div>
      <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${pct * 100}%` }} /></div>
      <div className="wgt-row">
        <button className="wgt-btn" onClick={() => (state.running ? timer.pause() : timer.start())}>{state.running ? t('common.pause') : t('common.start')}</button>
        <button className="wgt-btn" onClick={timer.reset}>{t('common.reset')}</button>
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

export function Stopwatch({ instanceId }: WidgetProps) {
  const { t } = useT();
  const timer = useWidgetTimer(instanceId, 'stopwatch', 0);
  const ms = timerElapsedMs(timer.state, timer.now);
  const total = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const label = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  return (
    <div className="wgt wgt-stopwatch">
      <div className="wgt-pomo-time">{label}</div>
      <div className="wgt-row">
        <button className="wgt-btn" onClick={() => (timer.state.running ? timer.pause() : timer.start())}>{timer.state.running ? t('common.stop') : t('common.start')}</button>
        <button className="wgt-btn" onClick={timer.reset}>{t('common.reset')}</button>
      </div>
    </div>
  );
}

export function Countdown({ settings, setSettings, instanceId }: WidgetProps) {
  const { t } = useT();
  const minutes = readSetting(settings, 'minutes', 10);
  const timer = useWidgetTimer(instanceId, 'countdown', minutes * 60_000);
  const left = timerRemainingMs(timer.state, timer.now);
  const done = timer.state.finishedAt !== null;
  return (
    <div className="wgt wgt-countdown">
      <div className={`wgt-pomo-time ${done ? 'wgt-flash' : ''}`}>{mmss(left)}</div>
      <div className="wgt-row">
        <button className="wgt-btn" onClick={() => (timer.state.running ? timer.pause() : timer.start())}>{timer.state.running ? t('common.pause') : t('common.start')}</button>
        <button className="wgt-btn" onClick={timer.reset}>{t('common.reset')}</button>
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
  const draftRef = useRef<HTMLInputElement>(null);
  const write = (next: Todo[]) => setSettings({ items: next });
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    write([...items, { id: `t${Date.now()}`, text, done: false }]);
    setDraft('');
    draftRef.current?.focus();
  };
  return (
    <div className="wgt wgt-todo">
      <div className="wgt-todo-add">
        <input
          ref={draftRef}
          value={draft}
          placeholder={t('widgets.todo.addPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            if (e.key === 'Enter') add();
          }}
        />
        <button className="wgt-btn-icon" onClick={add} title={t('common.add')} aria-label={t('common.add')}>+</button>
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
            <button className="wgt-btn-icon" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => write(items.filter((x) => x.id !== it.id))}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
