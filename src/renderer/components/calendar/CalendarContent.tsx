/**
 * Calendar state, navigation, grids, and the event modal — shared by Study OS's
 * `CalendarView` and Blanc's `BlancCalendarPanel`.
 *
 * Pillar 0: the calendar engine already lives in `renderer/calendar.ts`; what
 * was still view-local was the month/week/day/agenda rendering and the event
 * form. Both shells now compose these, so Blanc never mounts `CalendarView`.
 * Nothing here may import `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icons';
import { AnchorSurface, ContextualSurface } from '../liquid/LiquidSurface';
import './calendarLiquid.css';
import {
  addEvent,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  deleteEvent,
  expandOccurrences,
  getOverdueReminders,
  getTodayOccurrences,
  getUpcomingOccurrences,
  loadEvents,
  onCalendarChanged,
  REMINDER_LABELS,
  updateEvent,
  type CalendarEvent,
  type EventCategory,
  type EventOccurrence,
  type RecurrenceFreq,
  type ReminderOffset,
} from '../../calendar';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';

export type ViewMode = 'month' | 'week' | 'day' | 'agenda';

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

const EMPTY_FORM = {
  id: '',
  title: '',
  description: '',
  date: toKey(new Date()),
  startTime: '09:00',
  endTime: '10:00',
  allDay: false,
  color: CATEGORY_COLORS.study,
  category: 'study' as EventCategory,
  reminder: 'none' as ReminderOffset,
  recurrence: 'none' as RecurrenceFreq,
  recurrenceInterval: 1,
  recurrenceEndDate: '',
};

export type EventForm = typeof EMPTY_FORM;

export function EventModal({
  initial,
  onClose,
}: {
  initial: Partial<EventForm> & { date?: string };
  onClose: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const isEditing = !!form.id;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.title.trim()) return;
    const payload: Omit<CalendarEvent, 'id' | 'createdAt'> = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      allDay: form.allDay,
      startTime: form.allDay ? undefined : form.startTime,
      endTime: form.allDay ? undefined : form.endTime,
      color: form.color,
      category: form.category,
      reminder: form.reminder,
      recurrence: form.recurrence,
      recurrenceInterval:
        form.recurrence === 'custom' ? Math.max(1, form.recurrenceInterval) : undefined,
      recurrenceEndDate: form.recurrenceEndDate || undefined,
    };
    if (isEditing) updateEvent(form.id, payload);
    else addEvent(payload);
    onClose();
  };

  const remove = () => {
    if (isEditing) deleteEvent(form.id);
    onClose();
  };

  return (
    <div className="cal-modal-backdrop" onMouseDown={onClose}>
      <div className="cal-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cal-modal-head">
          <h3>{isEditing ? t('calendar.modal.editEvent') : t('calendar.newEvent')}</h3>
          <button type="button" className="cbh-icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="cal-form">
          <label className="cal-field">
            <span>{t('calendar.modal.title')}</span>
            <input
              value={form.title}
              autoFocus
              onChange={(e) => set('title', e.target.value)}
              placeholder={t('calendar.modal.titlePlaceholder')}
            />
          </label>

          <label className="cal-field">
            <span>{t('calendar.modal.description')}</span>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </label>

          <div className="cal-field-row">
            <label className="cal-field">
              <span>{t('calendar.modal.date')}</span>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </label>
            <label className="cal-field cal-check">
              <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              <span>{t('calendar.allDay')}</span>
            </label>
          </div>

          {!form.allDay && (
            <div className="cal-field-row">
              <label className="cal-field">
                <span>{t('calendar.modal.startTime')}</span>
                <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
              </label>
              <label className="cal-field">
                <span>{t('calendar.modal.endTime')}</span>
                <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
              </label>
            </div>
          )}

          <div className="cal-field-row">
            <label className="cal-field">
              <span>{t('calendar.modal.category')}</span>
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = e.target.value as EventCategory;
                  set('category', cat);
                  set('color', CATEGORY_COLORS[cat]);
                }}
              >
                {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label className="cal-field">
              <span>{t('calendar.modal.color')}</span>
              <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} />
            </label>
          </div>

          <label className="cal-field">
            <span>{t('calendar.modal.reminder')}</span>
            <select value={form.reminder} onChange={(e) => set('reminder', e.target.value as ReminderOffset)}>
              {(Object.keys(REMINDER_LABELS) as ReminderOffset[]).map((r) => (
                <option key={r} value={r}>{REMINDER_LABELS[r]}</option>
              ))}
            </select>
          </label>

          <div className="cal-field-row">
            <label className="cal-field">
              <span>{t('calendar.modal.repeat')}</span>
              <select value={form.recurrence} onChange={(e) => set('recurrence', e.target.value as RecurrenceFreq)}>
                <option value="none">{t('calendar.modal.repeat.none')}</option>
                <option value="daily">{t('calendar.modal.repeat.daily')}</option>
                <option value="weekly">{t('calendar.modal.repeat.weekly')}</option>
                <option value="monthly">{t('calendar.modal.repeat.monthly')}</option>
                <option value="custom">{t('calendar.modal.repeat.custom')}</option>
              </select>
            </label>
            {form.recurrence === 'custom' && (
              <label className="cal-field">
                <span>{t('calendar.modal.everyNDays')}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.recurrenceInterval}
                  onChange={(e) => set('recurrenceInterval', Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            )}
          </div>

          {form.recurrence !== 'none' && (
            <label className="cal-field">
              <span>{t('calendar.modal.repeatUntil')}</span>
              <input type="date" value={form.recurrenceEndDate} onChange={(e) => set('recurrenceEndDate', e.target.value)} />
            </label>
          )}
        </div>

        <div className="cal-modal-actions">
          {isEditing && (
            <button type="button" className="cbh-btn danger" onClick={remove}>{t('calendar.modal.delete')}</button>
          )}
          <div className="cal-modal-spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn primary" onClick={save} disabled={!form.title.trim()}>
            {isEditing ? t('common.save') : t('calendar.modal.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EventChip({ ev, onClick }: { ev: EventOccurrence; onClick: () => void }) {
  return (
    <button type="button" className="cal-chip" style={{ borderLeftColor: ev.color }} onClick={onClick}>
      {!ev.allDay && ev.startTime && <span className="cal-chip-time">{ev.startTime}</span>}
      <span className="cal-chip-title">{ev.title}</span>
    </button>
  );
}

export type CalendarState = ReturnType<typeof useCalendar>;

export function useCalendar() {
  const { t, lang } = useT();
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadEvents());
  useEffect(() => onCalendarChanged(() => setEvents(loadEvents())), []);

  const [mode, setMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [jumpVal, setJumpVal] = useState(toKey(new Date()));
  const [modal, setModal] = useState<Partial<EventForm> | null>(null);

  const today = new Date();

  const shift = (dir: 1 | -1) => {
    const d = new Date(cursor);
    if (mode === 'month') d.setMonth(d.getMonth() + dir);
    else if (mode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };
  const goToday = () => setCursor(new Date());
  const jump = (key: string) => {
    if (!key) return;
    setCursor(fromKey(key));
  };

  const monthCells = useMemo(() => {
    if (mode !== 'month') return [];
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [mode, cursor]);

  const rangeOccurrences = useMemo(() => {
    let start: Date;
    let end: Date;
    if (mode === 'month') {
      start = monthCells[0] ?? cursor;
      end = monthCells[41] ?? cursor;
    } else if (mode === 'week') {
      start = startOfWeek(cursor);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
    } else {
      start = cursor;
      end = cursor;
    }
    return expandOccurrences(events, start, end);
  }, [events, mode, cursor, monthCells]);

  const occsByDay = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>();
    for (const o of rangeOccurrences) {
      const list = map.get(o.occurrenceDate) ?? [];
      list.push(o);
      map.set(o.occurrenceDate, list);
    }
    return map;
  }, [rangeOccurrences]);

  const agendaToday = useMemo(() => getTodayOccurrences(), [events]);
  const agendaUpcoming = useMemo(() => getUpcomingOccurrences(30), [events]);
  const agendaOverdue = useMemo(() => getOverdueReminders(), [events]);

  const headerLabel = useMemo(() => {
    const locale = LANG_TAGS[lang];
    if (mode === 'month') return cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    if (mode === 'week') {
      const s = startOfWeek(cursor);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      return `${s.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (mode === 'day') return cursor.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return t('calendar.mode.agenda');
    // `t` is intentionally left out of the deps: its identity is stable, `lang`
    // is what actually needs to trigger a redo.
  }, [mode, cursor, lang]);

  const openNew = (date: string) => setModal({ ...EMPTY_FORM, date });
  const openEdit = (ev: EventOccurrence) =>
    setModal({
      id: ev.id,
      title: ev.title,
      description: ev.description ?? '',
      date: ev.date,
      startTime: ev.startTime ?? '09:00',
      endTime: ev.endTime ?? '10:00',
      allDay: !!ev.allDay,
      color: ev.color,
      category: ev.category,
      reminder: ev.reminder,
      recurrence: ev.recurrence,
      recurrenceInterval: ev.recurrenceInterval ?? 1,
      recurrenceEndDate: ev.recurrenceEndDate ?? '',
    });

  const modeLabels: Record<ViewMode, string> = {
    month: t('calendar.mode.month'),
    week: t('calendar.mode.week'),
    day: t('calendar.mode.day'),
    agenda: t('calendar.mode.agenda'),
  };

  return {
    events,
    mode,
    setMode,
    cursor,
    today,
    jumpVal,
    setJumpVal,
    jump,
    shift,
    goToday,
    monthCells,
    occsByDay,
    agendaToday,
    agendaUpcoming,
    agendaOverdue,
    headerLabel,
    modal,
    setModal,
    openNew,
    openEdit,
    modeLabels,
  };
}

/** Mode switcher + prev/today/next + date jump. */
export function CalendarNav({ state }: { state: CalendarState }) {
  const { t } = useT();
  const { mode, setMode, modeLabels, shift, goToday, headerLabel, jumpVal, setJumpVal, jump } = state;
  return (
    // Mode switch and date transport: contextual tools, not data. `ContextualSurface` is
    // pixel-inert in Standard and in Blanc, so both hosts keep the toolbar they had.
    <ContextualSurface className="cal-toolbar cal-context-toolbar">
      <div className="cal-modes">
        {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => (
          <button key={m} type="button" className={`cal-mode-btn ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
            {modeLabels[m]}
          </button>
        ))}
      </div>
      {mode !== 'agenda' && (
        // The date input makes this subgroup a dense form. Keep it on an opaque anchor while the
        // surrounding mode/transport strip remains contextual; universal toolbar glass would put
        // Calendar's one editing control directly on translucent material.
        <AnchorSurface bare className="cal-nav">
          <button type="button" className="wgt-btn-icon" onClick={() => shift(-1)} title={t('calendar.prev')}>‹</button>
          <button type="button" className="btn small" onClick={goToday}>{t('calendar.today')}</button>
          <button type="button" className="wgt-btn-icon" onClick={() => shift(1)} title={t('calendar.next')}>›</button>
          <span className="cal-header-label">{headerLabel}</span>
          <details className="cal-date-tools">
            <summary>{t('calendar.jumpToDate')}</summary>
            <input
              type="date"
              className="cal-jump"
              value={jumpVal}
              onChange={(e) => {
                setJumpVal(e.target.value);
                jump(e.target.value);
              }}
              title={t('calendar.jumpToDate')}
            />
          </details>
        </AnchorSurface>
      )}
    </ContextualSurface>
  );
}

/** The month / week / day / agenda body for the current mode. */
export function CalendarBody({ state }: { state: CalendarState }) {
  const { t, lang } = useT();
  const {
    mode,
    cursor,
    today,
    monthCells,
    occsByDay,
    agendaToday,
    agendaUpcoming,
    agendaOverdue,
    openNew,
    openEdit,
  } = state;

  if (mode === 'month') {
    return (
      <div className="cal-month-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="cal-month-dow muted">{d}</div>
        ))}
        {monthCells.map((d, i) => {
          const key = toKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === toKey(today);
          const dayEvents = occsByDay.get(key) ?? [];
          return (
            <div
              key={i}
              className={`cal-month-cell ${inMonth ? '' : 'out'} ${isToday ? 'today' : ''}`}
              onDoubleClick={() => openNew(key)}
            >
              <div className="cal-month-daynum">{d.getDate()}</div>
              <div className="cal-month-events">
                {dayEvents.slice(0, 3).map((ev) => (
                  <EventChip key={`${ev.id}-${ev.occurrenceDate}`} ev={ev} onClick={() => openEdit(ev)} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="cal-more muted">
                    {t('calendar.moreCount', { count: dayEvents.length - 3 })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === 'week') {
    return (
      <div className="cal-week-grid">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(startOfWeek(cursor));
          d.setDate(d.getDate() + i);
          const key = toKey(d);
          const isToday = key === toKey(today);
          const dayEvents = occsByDay.get(key) ?? [];
          return (
            <div key={i} className={`cal-week-col ${isToday ? 'today' : ''}`}>
              <div className="cal-week-daylabel">
                {d.toLocaleDateString(LANG_TAGS[lang], { weekday: 'short' })} <span className="muted">{d.getDate()}</span>
              </div>
              <div className="cal-week-events">
                {dayEvents.map((ev) => (
                  <EventChip key={`${ev.id}-${ev.occurrenceDate}`} ev={ev} onClick={() => openEdit(ev)} />
                ))}
                <button type="button" className="cal-add-inline muted" onClick={() => openNew(key)}>{t('calendar.addInline')}</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === 'day') {
    const dayList = occsByDay.get(toKey(cursor)) ?? [];
    return (
      <div className="cal-day-list">
        {dayList.length === 0 && <p className="muted">{t('calendar.noEventsToday')}</p>}
        {dayList.map((ev) => (
          <button type="button" key={`${ev.id}-${ev.occurrenceDate}`} className="cal-day-row" style={{ borderLeftColor: ev.color }} onClick={() => openEdit(ev)}>
            <span className="cal-day-time">{ev.allDay ? t('calendar.allDay') : `${ev.startTime ?? ''}${ev.endTime ? `–${ev.endTime}` : ''}`}</span>
            <span className="cal-day-title">{ev.title}</span>
            <span className="cal-badge" style={{ background: ev.color }}>{CATEGORY_LABELS[ev.category]}</span>
          </button>
        ))}
        <button type="button" className="btn small" onClick={() => openNew(toKey(cursor))}>{t('calendar.addEvent')}</button>
      </div>
    );
  }

  return (
    <div className="cal-agenda">
      <section>
        <h3>{t('calendar.today')}</h3>
        {agendaToday.length === 0 ? <p className="muted cal-empty-state">{t('calendar.agenda.nothingToday')}</p> : (
          <ul className="cal-agenda-list">
            {agendaToday.map((ev) => (
              <li key={`${ev.id}-${ev.occurrenceDate}`}>
                <EventChip ev={ev} onClick={() => openEdit(ev)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>{t('calendar.agenda.upcoming')}</h3>
        {agendaUpcoming.length === 0 ? <p className="muted cal-empty-state">{t('calendar.agenda.nothingUpcoming')}</p> : (
          <ul className="cal-agenda-list">
            {agendaUpcoming.map((ev) => (
              <li key={`${ev.id}-${ev.occurrenceDate}`}>
                <span className="muted cal-agenda-date">{new Date(ev.occurrenceDate).toLocaleDateString(LANG_TAGS[lang], { month: 'short', day: 'numeric' })}</span>
                <EventChip ev={ev} onClick={() => openEdit(ev)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>{t('calendar.agenda.overdueReminders')}</h3>
        {agendaOverdue.length === 0 ? <p className="muted cal-empty-state">{t('calendar.agenda.none')}</p> : (
          <ul className="cal-agenda-list">
            {agendaOverdue.map((ev) => (
              <li key={`${ev.id}-${ev.occurrenceDate}`}>
                <EventChip ev={ev} onClick={() => openEdit(ev)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
