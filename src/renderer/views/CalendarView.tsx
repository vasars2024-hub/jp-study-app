// Full Calendar app — Month/Week/Day/Agenda views, event CRUD, reminders and
// recurring events. The Home Workspace calendar widget (widgets/productivity.tsx)
// reads from the same calendar.ts store and never duplicates this logic.

import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icons';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu, useAeroMaterials } from '../components/ui';
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
} from '../calendar';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function startOfWeek(d: Date): Date {
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

function EventModal({
  initial,
  onClose,
}: {
  initial: Partial<typeof EMPTY_FORM> & { date?: string };
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const isEditing = !!form.id;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

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
      recurrenceInterval: form.recurrence === 'custom' ? Math.max(1, form.recurrenceInterval) : undefined,
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
          <h3>{isEditing ? 'Edit event' : 'New event'}</h3>
          <button type="button" className="cbh-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="cal-form">
          <label className="cal-field">
            <span>Title</span>
            <input value={form.title} autoFocus onChange={(e) => set('title', e.target.value)} placeholder="Event title" />
          </label>

          <label className="cal-field">
            <span>Description</span>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </label>

          <div className="cal-field-row">
            <label className="cal-field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </label>
            <label className="cal-field cal-check">
              <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              <span>All day</span>
            </label>
          </div>

          {!form.allDay && (
            <div className="cal-field-row">
              <label className="cal-field">
                <span>Start time</span>
                <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
              </label>
              <label className="cal-field">
                <span>End time</span>
                <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
              </label>
            </div>
          )}

          <div className="cal-field-row">
            <label className="cal-field">
              <span>Category</span>
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
              <span>Color</span>
              <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} />
            </label>
          </div>

          <label className="cal-field">
            <span>Reminder</span>
            <select value={form.reminder} onChange={(e) => set('reminder', e.target.value as ReminderOffset)}>
              {(Object.keys(REMINDER_LABELS) as ReminderOffset[]).map((r) => (
                <option key={r} value={r}>{REMINDER_LABELS[r]}</option>
              ))}
            </select>
          </label>

          <div className="cal-field-row">
            <label className="cal-field">
              <span>Repeat</span>
              <select value={form.recurrence} onChange={(e) => set('recurrence', e.target.value as RecurrenceFreq)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom interval (days)</option>
              </select>
            </label>
            {form.recurrence === 'custom' && (
              <label className="cal-field">
                <span>Every N days</span>
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
              <span>Repeat until (optional)</span>
              <input type="date" value={form.recurrenceEndDate} onChange={(e) => set('recurrenceEndDate', e.target.value)} />
            </label>
          )}
        </div>

        <div className="cal-modal-actions">
          {isEditing && (
            <button type="button" className="cbh-btn danger" onClick={remove}>Delete</button>
          )}
          <div className="cal-modal-spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={!form.title.trim()}>
            {isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventChip({ ev, onClick }: { ev: EventOccurrence; onClick: () => void }) {
  return (
    <button type="button" className="cal-chip" style={{ borderLeftColor: ev.color }} onClick={onClick}>
      {!ev.allDay && ev.startTime && <span className="cal-chip-time">{ev.startTime}</span>}
      <span className="cal-chip-title">{ev.title}</span>
    </button>
  );
}

export default function CalendarView() {
  const aero = useAeroMaterials();
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadEvents());
  useEffect(() => onCalendarChanged(() => setEvents(loadEvents())), []);

  const [mode, setMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [jumpVal, setJumpVal] = useState(toKey(new Date()));
  const [modal, setModal] = useState<Partial<typeof EMPTY_FORM> | null>(null);

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
    if (mode === 'month') return cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (mode === 'week') {
      const s = startOfWeek(cursor);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      return `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (mode === 'day') return cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return 'Agenda';
  }, [mode, cursor]);

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

  // Native menu bar + status bar (Future Life Organizer). AppChrome renders them
  // only under Aero; pass-through in the default theme. Items drive existing
  // handlers only — the same calendar engine, no behavior forked by theme.
  const calMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [{ id: 'new', label: 'New event…', onSelect: () => openNew(toKey(cursor)) }],
    },
    {
      id: 'view',
      label: 'View',
      items: (['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => ({
        id: m,
        label: m[0].toUpperCase() + m.slice(1),
        onSelect: () => setMode(m),
      })),
    },
    {
      id: 'go',
      label: 'Go',
      items: [
        { id: 'today', label: 'Today', onSelect: goToday },
        { id: 'prev', label: 'Previous', disabled: mode === 'agenda', onSelect: () => shift(-1) },
        { id: 'next', label: 'Next', disabled: mode === 'agenda', onSelect: () => shift(1) },
      ],
    },
  ];

  const calStatus = (
    <>
      <StatusBarField>{headerLabel}</StatusBarField>
      <StatusBarField>{events.length} events</StatusBarField>
      <StatusBarSpacer />
      {agendaOverdue.length > 0 && <StatusBarField live>{agendaOverdue.length} overdue</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={calMenus} status={calStatus} className="aero-calendar-chrome">
    <div className={`calendar-view${aero ? ' aero-calendar' : ''}`}>
      <div className="view-head">
        <div>
          <h1>Calendar</h1>
          <p className="muted">Study sessions, exams, assignments, and reminders in one place.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openNew(toKey(cursor))}>
          <Icon name="plus" size={14} /> New event
        </button>
      </div>

      {aero && (
        <aside className="aero-cal-sidebar" aria-label="Calendar navigator">
          <div className="aero-cal-date-card">
            <span>{today.toLocaleDateString([], { weekday: 'short' })}</span>
            <strong>{today.getDate()}</strong>
            <small>{today.toLocaleDateString([], { month: 'long', year: 'numeric' })}</small>
          </div>
          <button type="button" className="aero-cal-nav-row" onClick={goToday}>
            <Icon name="calendar" size={15} />
            <span>Today</span>
            <strong>{agendaToday.length}</strong>
          </button>
          <button type="button" className="aero-cal-nav-row" onClick={() => openNew(toKey(cursor))}>
            <Icon name="plus" size={15} />
            <span>New event</span>
          </button>
          <div className="aero-cal-pane-title">Views</div>
          {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`aero-cal-nav-row ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              <Icon name={m === 'agenda' ? 'clipboard' : 'calendar'} size={15} />
              <span>{m[0].toUpperCase() + m.slice(1)}</span>
            </button>
          ))}
          <div className="aero-cal-pane-title">Reminders</div>
          <button type="button" className={`aero-cal-nav-row ${agendaOverdue.length ? 'urgent' : ''}`} onClick={() => setMode('agenda')}>
            <Icon name="bookmark" size={15} />
            <span>Overdue</span>
            <strong>{agendaOverdue.length}</strong>
          </button>
        </aside>
      )}

      <div className="cal-toolbar">
        <div className="cal-modes">
          {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => (
            <button key={m} type="button" className={`cal-mode-btn ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        {mode !== 'agenda' && (
          <div className="cal-nav">
            <button type="button" className="wgt-btn-icon" onClick={() => shift(-1)} title="Previous">‹</button>
            <button type="button" className="btn small" onClick={goToday}>Today</button>
            <button type="button" className="wgt-btn-icon" onClick={() => shift(1)} title="Next">›</button>
            <span className="cal-header-label">{headerLabel}</span>
            <input
              type="date"
              className="cal-jump"
              value={jumpVal}
              onChange={(e) => {
                setJumpVal(e.target.value);
                jump(e.target.value);
              }}
              title="Jump to date"
            />
          </div>
        )}
      </div>

      {mode === 'month' && (
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
                  {dayEvents.length > 3 && <div className="cal-more muted">+{dayEvents.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'week' && (
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
                  {d.toLocaleDateString([], { weekday: 'short' })} <span className="muted">{d.getDate()}</span>
                </div>
                <div className="cal-week-events">
                  {dayEvents.map((ev) => (
                    <EventChip key={`${ev.id}-${ev.occurrenceDate}`} ev={ev} onClick={() => openEdit(ev)} />
                  ))}
                  <button type="button" className="cal-add-inline muted" onClick={() => openNew(key)}>+ Add</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'day' && (
        <div className="cal-day-list">
          {(occsByDay.get(toKey(cursor)) ?? []).length === 0 && (
            <p className="muted">No events on this day.</p>
          )}
          {(occsByDay.get(toKey(cursor)) ?? []).map((ev) => (
            <button type="button" key={`${ev.id}-${ev.occurrenceDate}`} className="cal-day-row" style={{ borderLeftColor: ev.color }} onClick={() => openEdit(ev)}>
              <span className="cal-day-time">{ev.allDay ? 'All day' : `${ev.startTime ?? ''}${ev.endTime ? `–${ev.endTime}` : ''}`}</span>
              <span className="cal-day-title">{ev.title}</span>
              <span className="cal-badge" style={{ background: ev.color }}>{CATEGORY_LABELS[ev.category]}</span>
            </button>
          ))}
          <button type="button" className="btn small" onClick={() => openNew(toKey(cursor))}>+ Add event</button>
        </div>
      )}

      {mode === 'agenda' && (
        <div className="cal-agenda">
          <section>
            <h3>Today</h3>
            {agendaToday.length === 0 ? <p className="muted">Nothing today.</p> : (
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
            <h3>Upcoming</h3>
            {agendaUpcoming.length === 0 ? <p className="muted">Nothing on the horizon.</p> : (
              <ul className="cal-agenda-list">
                {agendaUpcoming.map((ev) => (
                  <li key={`${ev.id}-${ev.occurrenceDate}`}>
                    <span className="muted cal-agenda-date">{new Date(ev.occurrenceDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    <EventChip ev={ev} onClick={() => openEdit(ev)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Overdue reminders</h3>
            {agendaOverdue.length === 0 ? <p className="muted">None.</p> : (
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
      )}

      {aero && (
        <aside className="aero-cal-inspector" aria-label="Schedule inspector">
          <div className="aero-cal-pane-title">Today</div>
          {agendaToday.length === 0 ? (
            <p className="muted">Nothing today.</p>
          ) : (
            <ul className="aero-cal-list">
              {agendaToday.slice(0, 5).map((ev) => (
                <li key={`today-${ev.id}-${ev.occurrenceDate}`}>
                  <EventChip ev={ev} onClick={() => openEdit(ev)} />
                </li>
              ))}
            </ul>
          )}
          <div className="aero-cal-pane-title">Upcoming</div>
          {agendaUpcoming.length === 0 ? (
            <p className="muted">Nothing scheduled.</p>
          ) : (
            <ul className="aero-cal-list">
              {agendaUpcoming.slice(0, 8).map((ev) => (
                <li key={`upcoming-${ev.id}-${ev.occurrenceDate}`}>
                  <span className="aero-cal-date">{new Date(ev.occurrenceDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  <EventChip ev={ev} onClick={() => openEdit(ev)} />
                </li>
              ))}
            </ul>
          )}
          <div className="aero-cal-pane-title">Overdue</div>
          {agendaOverdue.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="aero-cal-list">
              {agendaOverdue.slice(0, 5).map((ev) => (
                <li key={`overdue-${ev.id}-${ev.occurrenceDate}`}>
                  <EventChip ev={ev} onClick={() => openEdit(ev)} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {modal && <EventModal initial={modal} onClose={() => setModal(null)} />}
    </div>
    </AppChrome>
  );
}
