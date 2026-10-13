/**
 * The week as an hour grid: seven day lanes, timed events placed by their start and end,
 * events that overlap side by side, an all-day row on top, and a line at the current time.
 *
 * Keyboard: the grid is ONE tab stop (the month grid's pattern) whose active slot moves with
 * the arrow keys — a day left/right, an hour up/down, the all-day row above 00:00 — and Enter
 * starts a new event in that slot. Each event is its own button: Enter edits it, Alt+Left/Right
 * moves it a day, Alt+Up/Down 15 minutes. A mouse drag does the same as Alt+Arrow, snapping to
 * a quarter hour where it is dropped.
 *
 * ARIA: rows are hours (the DOM is row-major; `display: contents` rows keep each slot a direct
 * item of one CSS grid), so the grid reads as a table of hours × days. A timed event lives in
 * the slot of its start hour and is positioned absolutely over the lanes.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import {
  loadEvents,
  shiftClockTime,
  startOfWeekOn,
  toDateKey,
  type CalendarEvent,
  type EventOccurrence,
  type WeekStartDay,
} from '../../calendar';
import { loadDesktopPrefs, clockHour12 } from '../../desktopPrefs';
import { CAL_DRAG_TYPE, KEYBOARD_MOVE_KEYS, keyboardMoveFor, readDraggedOccurrence } from './calendarKeyboardMove';
import './calendarWeek.css';

/** Geometry, mirrored in calendarWeek.css (`--cal-wk-*`). */
export const WEEK_HOUR_PX = 44;
const HEAD_PX = 48;
const ALLDAY_PX = 58;
const GUTTER_PX = 56;
/** A timed event without an end is drawn this long; anything shorter this tall. */
const DEFAULT_MINUTES = 30;
const MIN_DRAWN_MINUTES = 22;

export interface WeekGridState {
  cursor: Date;
  today: Date;
  weekStart: WeekStartDay;
  occsByDay: Map<string, EventOccurrence[]>;
  openNew: (date: string, at?: { startTime?: string; allDay?: boolean }) => void;
  openEdit: (ev: EventOccurrence) => void;
  moveOccurrence?: (
    id: string,
    from: string,
    to: string,
    times?: Partial<Pick<CalendarEvent, 'startTime' | 'endTime' | 'allDay'>>,
  ) => Promise<string | null>;
  moveByKeyboard?: (ev: EventOccurrence, days: number, minutes?: number) => Promise<boolean>;
}

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (minutes: number): string => shiftClockTime('00:00', minutes);

/** Where a timed occurrence sits in its lane, in minutes from midnight. */
export function occurrenceSpan(o: Pick<EventOccurrence, 'startTime' | 'endTime'>): { start: number; end: number } {
  const start = minutesOf(o.startTime ?? '00:00');
  const end = o.endTime && o.endTime > (o.startTime ?? '') ? minutesOf(o.endTime) : start + DEFAULT_MINUTES;
  return { start, end: Math.min(24 * 60, end) };
}

/**
 * Side-by-side columns for overlapping events: a cluster is a run of events that overlap
 * one another (transitively); each takes the first column free at its start, and every event
 * in the cluster is as wide as the cluster has columns.
 */
export function weekEventLayout(items: ReadonlyArray<{ key: string; start: number; end: number }>): Map<string, { col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: string[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const flush = (): void => {
    for (const key of cluster) out.set(key, { col: out.get(key)?.col ?? 0, cols: columnEnds.length });
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };
  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= item.start);
    if (col < 0) {
      col = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[col] = item.end;
    }
    out.set(item.key, { col, cols: 1 });
    cluster.push(item.key);
    clusterEnd = Math.max(clusterEnd, Math.max(item.end, item.start + MIN_DRAWN_MINUTES));
  }
  flush();
  return out;
}

/** -1 is the all-day row; 0–23 the hours. */
interface Slot {
  day: number;
  row: number;
}

export function CalendarWeekGrid({ state }: { state: WeekGridState }) {
  const { t, lang } = useT();
  const locale = LANG_TAGS[lang];
  const { cursor, today, weekStart, occsByDay, openNew, openEdit } = state;
  const gridRef = useRef<HTMLDivElement | null>(null);

  const days = useMemo(() => {
    const first = startOfWeekOn(cursor, weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(first);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [cursor, weekStart]);
  const keys = useMemo(() => days.map(toDateKey), [days]);
  const weekId = keys[0];
  const todayKey = toDateKey(today);
  const todayIndex = keys.indexOf(todayKey);

  // The current time, re-read every minute while the week shows today.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (todayIndex < 0) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [todayIndex]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let hour12: boolean | undefined;
  try {
    hour12 = clockHour12(loadDesktopPrefs().clock24h);
  } catch {
    hour12 = undefined;
  }
  const hourLabel = (hour: number): string =>
    new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12 });

  const [active, setActive] = useState<Slot>(() => ({
    day: todayIndex >= 0 ? todayIndex : 0,
    row: todayIndex >= 0 ? new Date().getHours() : 9,
  }));
  const [dropAt, setDropAt] = useState<Slot | null>(null);

  // Open on the working part of the day: an hour before now on this week, else the first event.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let first = 24;
    for (const key of keys) {
      for (const o of occsByDay.get(key) ?? []) {
        if (!o.allDay && o.startTime) first = Math.min(first, Math.floor(minutesOf(o.startTime) / 60));
      }
    }
    const hour = todayIndex >= 0 ? Math.max(0, new Date().getHours() - 1) : Math.min(first === 24 ? 7 : first, 7);
    grid.scrollTop = hour * WEEK_HOUR_PX;
    // Once per week shown, not on every event change.
  }, [weekId]);

  const slotId = (slot: Slot): string => `cal-wk-${keys[slot.day]}-${slot.row < 0 ? 'allday' : slot.row}`;

  /** Keep the active slot visible below the sticky header and all-day rows. */
  const reveal = (slot: Slot): void => {
    const grid = gridRef.current;
    if (!grid || slot.row < 0) return;
    const top = slot.row * WEEK_HOUR_PX;
    const viewTop = grid.scrollTop;
    const viewHeight = grid.clientHeight - HEAD_PX - ALLDAY_PX;
    if (top < viewTop) grid.scrollTop = top;
    else if (top + WEEK_HOUR_PX > viewTop + viewHeight) grid.scrollTop = top + WEEK_HOUR_PX - viewHeight;
  };

  const moveActive = (dDay: number, dRow: number): void => {
    setActive((current) => {
      const next = {
        day: Math.min(6, Math.max(0, current.day + dDay)),
        row: Math.min(23, Math.max(-1, current.row + dRow)),
      };
      reveal(next);
      return next;
    });
  };

  const create = (slot: Slot): void => {
    const key = keys[slot.day];
    if (slot.row < 0) openNew(key, { allDay: true });
    else openNew(key, { startTime: clock(slot.row * 60) });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // Keys on an event button are the event's (Enter edits it).
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case 'ArrowLeft': moveActive(-1, 0); break;
      case 'ArrowRight': moveActive(1, 0); break;
      case 'ArrowUp': moveActive(0, -1); break;
      case 'ArrowDown': moveActive(0, 1); break;
      case 'Home': moveActive(-7, 0); break;
      case 'End': moveActive(7, 0); break;
      case 'PageUp': moveActive(0, -6); break;
      case 'PageDown': moveActive(0, 6); break;
      case 'Enter':
      case ' ':
        create(active);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  /** The slot under the pointer, from the grid's own geometry (events sit over the slots). */
  const slotAt = (e: ReactDragEvent<HTMLDivElement>): { day: number; minutes: number | null } | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left - GUTTER_PX;
    const lane = (grid.clientWidth - GUTTER_PX) / 7;
    if (x < 0 || lane <= 0) return null;
    const day = Math.min(6, Math.floor(x / lane));
    const y = e.clientY - rect.top;
    if (y < HEAD_PX) return null;
    if (y < HEAD_PX + ALLDAY_PX) return { day, minutes: null };
    const raw = ((y - HEAD_PX - ALLDAY_PX + grid.scrollTop) / WEEK_HOUR_PX) * 60;
    return { day, minutes: Math.min(23 * 60 + 45, Math.max(0, Math.round(raw / 15) * 15)) };
  };

  const dropProps = state.moveOccurrence ? {
    onDragOver: (e: ReactDragEvent<HTMLDivElement>) => {
      if (!Array.from(e.dataTransfer.types).includes(CAL_DRAG_TYPE)) return;
      const at = slotAt(e);
      if (!at) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const slot = { day: at.day, row: at.minutes === null ? -1 : Math.floor(at.minutes / 60) };
      if (!dropAt || dropAt.day !== slot.day || dropAt.row !== slot.row) setDropAt(slot);
    },
    onDragLeave: (e: ReactDragEvent<HTMLDivElement>) => {
      if (e.currentTarget === e.target) setDropAt(null);
    },
    onDrop: (e: ReactDragEvent<HTMLDivElement>) => {
      const dragged = readDraggedOccurrence(e);
      const at = slotAt(e);
      setDropAt(null);
      if (!dragged || !at || !state.moveOccurrence) return;
      e.preventDefault();
      const event = loadEvents().find((candidate) => candidate.id === dragged.id);
      if (!event) return;
      const to = keys[at.day];
      if (at.minutes === null) {
        void state.moveOccurrence(dragged.id, dragged.from, to, { allDay: true });
        return;
      }
      const span = !event.allDay && event.startTime ? occurrenceSpan(event) : { start: 0, end: 60 };
      const startTime = clock(at.minutes);
      void state.moveOccurrence(dragged.id, dragged.from, to, {
        allDay: false,
        startTime,
        endTime: clock(at.minutes + Math.max(15, span.end - span.start)),
      });
    },
  } : {};

  const dragStart = (ev: EventOccurrence) => (e: ReactDragEvent<HTMLElement>) => {
    e.dataTransfer.setData(CAL_DRAG_TYPE, JSON.stringify({ id: ev.id, from: ev.occurrenceDate }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const keyMove = (ev: EventOccurrence, upDown: 'week' | 'minutes') => (e: ReactKeyboardEvent<HTMLElement>) => {
    const move = keyboardMoveFor(e, upDown);
    if (!move || !state.moveByKeyboard) return;
    e.preventDefault();
    e.stopPropagation();
    void state.moveByKeyboard(ev, move.days, move.minutes);
  };

  // Timed events per day, with their lane columns.
  const timed = useMemo(() => keys.map((key) => {
    // An event over several days rides in the all-day row, one bar per day, as other calendars draw it.
    const list = (occsByDay.get(key) ?? []).filter((o) => !o.allDay && o.startTime && !o.spanDays);
    const layout = weekEventLayout(list.map((o) => ({ key: `${o.id}|${o.occurrenceDate}`, ...occurrenceSpan(o) })));
    return list.map((o) => ({ o, ...occurrenceSpan(o), ...(layout.get(`${o.id}|${o.occurrenceDate}`) ?? { col: 0, cols: 1 }) }));
  }), [keys, occsByDay]);

  const longDate = (d: Date): string => d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });

  const eventButton = (entry: (typeof timed)[number][number], day: number): ReactNode => {
    const { o, start, end, col, cols } = entry;
    const drawnEnd = Math.max(end, start + MIN_DRAWN_MINUTES);
    const lane = `(100% - ${GUTTER_PX}px) / 7`;
    const range = `${o.startTime}${o.endTime && o.endTime > (o.startTime ?? '') ? `–${o.endTime}` : ''}`;
    return (
      <button
        key={`${o.id}|${o.occurrenceDate}`}
        type="button"
        className="cal-wk-event"
        data-occurrence={`${o.id}|${o.occurrenceDate}`}
        style={{
          top: HEAD_PX + ALLDAY_PX + (start / 60) * WEEK_HOUR_PX,
          height: ((drawnEnd - start) / 60) * WEEK_HOUR_PX - 2,
          left: `calc(${GUTTER_PX}px + ${lane} * ${day + col / cols} + 1px)`,
          width: `calc(${lane} / ${cols} - 3px)`,
          borderLeftColor: o.color,
        }}
        aria-label={`${o.title}, ${range}`}
        aria-keyshortcuts={state.moveByKeyboard ? KEYBOARD_MOVE_KEYS : undefined}
        onClick={() => openEdit(o)}
        onKeyDown={keyMove(o, 'minutes')}
        draggable={Boolean(state.moveOccurrence)}
        onDragStart={dragStart(o)}
      >
        <span className="cal-wk-event-time">{range}</span>
        <span className="cal-wk-event-title">{o.title}</span>
      </button>
    );
  };

  const isActive = (slot: Slot): boolean => slot.day === active.day && slot.row === active.row;
  const isDrop = (slot: Slot): boolean => Boolean(dropAt && dropAt.day === slot.day && dropAt.row === slot.row);

  return (
    <div
      ref={gridRef}
      className="cal-wk"
      role="grid"
      tabIndex={0}
      aria-label={t('planner.week.grid')}
      aria-describedby="cal-wk-hint"
      aria-activedescendant={slotId(active)}
      onKeyDown={onKeyDown}
      {...dropProps}
    >
      <p id="cal-wk-hint" className="cal-sr-only">{t('planner.week.hint')}</p>
      <div role="row" className="cal-wk-row">
        <div role="columnheader" className="cal-wk-corner">
          <span className="cal-sr-only">{t('planner.week.time')}</span>
        </div>
        {days.map((d, i) => (
          <div
            key={keys[i]}
            role="columnheader"
            className={`cal-wk-colhead${keys[i] === todayKey ? ' today' : ''}`}
            aria-label={longDate(d)}
          >
            <span className="cal-wk-dayname">{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
            <span className="cal-wk-daynum">{d.getDate()}</span>
            <button
              type="button"
              className="cal-wk-add"
              onClick={() => openNew(keys[i])}
              aria-label={t('planner.week.addOn', { date: longDate(d) })}
              title={t('planner.week.addOn', { date: longDate(d) })}
            >
              +
            </button>
          </div>
        ))}
      </div>

      <div role="row" className="cal-wk-row">
        <div role="rowheader" className="cal-wk-alldaylabel">{t('calendar.allDay')}</div>
        {days.map((d, i) => {
          const slot = { day: i, row: -1 };
          const list = (occsByDay.get(keys[i]) ?? []).filter((o) => o.allDay || !o.startTime || o.spanDays);
          return (
            <div
              key={keys[i]}
              id={slotId(slot)}
              role="gridcell"
              aria-selected={isActive(slot)}
              aria-label={`${longDate(d)}, ${t('calendar.allDay')}`}
              className={`cal-wk-allday${isActive(slot) ? ' is-active' : ''}${isDrop(slot) ? ' cal-drop-over' : ''}${keys[i] === todayKey ? ' today' : ''}`}
              onClick={() => setActive(slot)}
              onDoubleClick={() => create(slot)}
            >
              {list.map((o) => (
                <button
                  key={`${o.id}|${o.occurrenceDate}`}
                  type="button"
                  className={`cal-chip${o.spanDays ? ' cal-chip--span' : ''}${o.spanIndex ? ' cal-chip--cont' : ''}`}
                  style={{ borderLeftColor: o.color }}
                  data-occurrence={`${o.id}|${o.occurrenceDate}`}
                  aria-label={o.spanDays
                    ? `${o.title}, ${t('planner.multiDay.dayOf', { index: (o.spanIndex ?? 0) + 1, count: o.spanDays })}`
                    : undefined}
                  aria-keyshortcuts={state.moveByKeyboard ? KEYBOARD_MOVE_KEYS : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(o);
                  }}
                  onKeyDown={keyMove(o, 'week')}
                  draggable={Boolean(state.moveOccurrence) && !o.spanIndex}
                  onDragStart={dragStart(o)}
                >
                  {o.spanDays && !o.spanIndex && !o.allDay && o.startTime ? <span className="cal-chip-time">{o.startTime}</span> : null}
                  <span className="cal-chip-title">{o.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} role="row" className="cal-wk-row">
          <div role="rowheader" className="cal-wk-hour">
            <span>{hourLabel(hour)}</span>
          </div>
          {days.map((d, i) => {
            const slot = { day: i, row: hour };
            const starting = timed[i].filter((entry) => Math.floor(entry.start / 60) === hour);
            const showNow = i === todayIndex && Math.floor(nowMinutes / 60) === hour;
            return (
              <div
                key={keys[i]}
                id={slotId(slot)}
                role="gridcell"
                aria-selected={isActive(slot)}
                aria-label={`${longDate(d)}, ${hourLabel(hour)}`}
                className={`cal-wk-slot${isActive(slot) ? ' is-active' : ''}${isDrop(slot) ? ' cal-drop-over' : ''}${keys[i] === todayKey ? ' today' : ''}`}
                onClick={() => setActive(slot)}
                onDoubleClick={() => create(slot)}
              >
                {starting.map((entry) => eventButton(entry, i))}
                {showNow && (
                  <span
                    className="cal-wk-now"
                    aria-hidden="true"
                    style={{
                      top: HEAD_PX + ALLDAY_PX + (nowMinutes / 60) * WEEK_HOUR_PX,
                      left: `calc(${GUTTER_PX}px + (100% - ${GUTTER_PX}px) / 7 * ${i})`,
                      width: `calc((100% - ${GUTTER_PX}px) / 7)`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
