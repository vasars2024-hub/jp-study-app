// Full Calendar app — Month/Week/Day/Agenda views, event CRUD, reminders and
// recurring events. The Home Workspace calendar widget (widgets/productivity.tsx)
// reads from the same calendar.ts store and never duplicates this logic.
//
// The state, grids, and event modal live in
// components/calendar/CalendarContent.tsx so Blanc can render the same calendar
// without this file's AppChrome (BLANC_REFINEMENT_PLAN.md Pillar 0); this file
// keeps the Study OS chrome and the Aero side panes.

import Icon from '../components/Icons';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu, useAeroMaterials } from '../components/ui';
import {
  CalendarBody,
  CalendarNav,
  EventChip,
  EventModal,
  toKey,
  useCalendar,
  type ViewMode,
} from '../components/calendar/CalendarContent';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';

export default function CalendarView() {
  const { t, lang } = useT();
  const aero = useAeroMaterials();
  const state = useCalendar();
  const {
    events,
    mode,
    setMode,
    cursor,
    today,
    agendaToday,
    agendaUpcoming,
    agendaOverdue,
    headerLabel,
    modal,
    setModal,
    openNew,
    openEdit,
    goToday,
    shift,
    modeLabels,
  } = state;

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
        label: modeLabels[m],
        onSelect: () => setMode(m),
      })),
    },
    {
      id: 'go',
      label: 'Go',
      items: [
        { id: 'today', label: t('calendar.today'), onSelect: goToday },
        { id: 'prev', label: t('calendar.prev'), disabled: mode === 'agenda', onSelect: () => shift(-1) },
        { id: 'next', label: t('calendar.next'), disabled: mode === 'agenda', onSelect: () => shift(1) },
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
          <h1>{t('calendar.title')}</h1>
          <p className="muted">{t('calendar.intro')}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openNew(toKey(cursor))}>
          <Icon name="plus" size={14} /> {t('calendar.newEvent')}
        </button>
      </div>

      {aero && (
        <aside className="aero-cal-sidebar" aria-label="Calendar navigator">
          <div className="aero-cal-date-card">
            <span>{today.toLocaleDateString(LANG_TAGS[lang], { weekday: 'short' })}</span>
            <strong>{today.getDate()}</strong>
            <small>{today.toLocaleDateString(LANG_TAGS[lang], { month: 'long', year: 'numeric' })}</small>
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

      <CalendarNav state={state} />

      <CalendarBody state={state} />

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
                  <span className="aero-cal-date">{new Date(ev.occurrenceDate).toLocaleDateString(LANG_TAGS[lang], { month: 'short', day: 'numeric' })}</span>
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
