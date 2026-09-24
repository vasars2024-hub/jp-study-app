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
  fromKey,
  toKey,
  useCalendar,
  type ViewMode,
} from '../components/calendar/CalendarContent';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import '../components/calendar/calendarLiquid.css';

/**
 * Aero inspector row caps. The nav rail above prints `agendaToday.length` and
 * `agendaOverdue.length` in full, so a silent cap made the rail and the list beside it
 * disagree — "Overdue 12" over five rows. D137.
 */
const AGENDA_ROWS = 5;
const AGENDA_UPCOMING_ROWS = 8;

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
      label: t('calendar.aero.menu.file'),
      items: [{ id: 'new', label: t('calendar.newEvent'), onSelect: () => openNew(toKey(cursor)) }],
    },
    {
      id: 'view',
      label: t('calendar.aero.menu.view'),
      items: (['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => ({
        id: m,
        label: modeLabels[m],
        onSelect: () => setMode(m),
      })),
    },
    {
      id: 'go',
      label: t('calendar.aero.menu.go'),
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
      <StatusBarField>{t('calendar.aero.eventCount', { count: events.length })}</StatusBarField>
      <StatusBarSpacer />
      {agendaOverdue.length > 0 && (
        <StatusBarField live>{t('calendar.aero.overdueCount', { count: agendaOverdue.length })}</StatusBarField>
      )}
    </>
  );

  return (
    <AppChrome menus={calMenus} status={calStatus} className="aero-calendar-chrome">
    <div className={`calendar-view${aero ? ' aero-calendar' : ''}`}>
      {/* No in-window "Calendar" heading: the window title and taskbar button
          already say which app this is (CLAUDE.md window minimalism). */}
      <ContextualSurface as="header" className="view-head calendar-context-head">
        <button type="button" className="btn primary" onClick={() => openNew(toKey(cursor))}>
          <Icon name="plus" size={14} /> {t('calendar.newEvent')}
        </button>
      </ContextualSurface>

      {aero && (
        <aside className="aero-cal-sidebar" aria-label={t('calendar.aero.nav')}>
          <div className="aero-cal-date-card">
            <span>{today.toLocaleDateString(LANG_TAGS[lang], { weekday: 'short' })}</span>
            <strong>{today.getDate()}</strong>
            <small>{today.toLocaleDateString(LANG_TAGS[lang], { month: 'long', year: 'numeric' })}</small>
          </div>
          <button type="button" className="aero-cal-nav-row" onClick={goToday}>
            <Icon name="calendar" size={15} />
            <span>{t('calendar.today')}</span>
            <strong>{agendaToday.length}</strong>
          </button>
          <button type="button" className="aero-cal-nav-row" onClick={() => openNew(toKey(cursor))}>
            <Icon name="plus" size={15} />
            <span>{t('calendar.newEvent')}</span>
          </button>
          <div className="aero-cal-pane-title">{t('calendar.aero.views')}</div>
          {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`aero-cal-nav-row ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              <Icon name={m === 'agenda' ? 'clipboard' : 'calendar'} size={15} />
              <span>{modeLabels[m]}</span>
            </button>
          ))}
          <div className="aero-cal-pane-title">{t('calendar.aero.reminders')}</div>
          <button type="button" className={`aero-cal-nav-row ${agendaOverdue.length ? 'urgent' : ''}`} onClick={() => setMode('agenda')}>
            <Icon name="bookmark" size={15} />
            <span>{t('calendar.aero.overdue')}</span>
            <strong>{agendaOverdue.length}</strong>
          </button>
        </aside>
      )}

      <CalendarNav state={state} />

      <CalendarBody state={state} />

      {aero && (
        <aside className="aero-cal-inspector" aria-label={t('calendar.aero.inspector')}>
          <div className="aero-cal-pane-title">{t('calendar.today')}</div>
          {agendaToday.length === 0 ? (
            <p className="muted">{t('calendar.agenda.nothingToday')}</p>
          ) : (
            <ul className="aero-cal-list">
              {agendaToday.slice(0, AGENDA_ROWS).map((ev) => (
                <li key={`today-${ev.id}-${ev.occurrenceDate}`}>
                  <EventChip ev={ev} onClick={() => openEdit(ev)} />
                </li>
              ))}
              {agendaToday.length > AGENDA_ROWS && (
                <li className="muted">{t('common.moreNotShown', { count: agendaToday.length - AGENDA_ROWS })}</li>
              )}
            </ul>
          )}
          <div className="aero-cal-pane-title">{t('calendar.agenda.upcoming')}</div>
          {agendaUpcoming.length === 0 ? (
            <p className="muted">{t('calendar.agenda.nothingUpcoming')}</p>
          ) : (
            <ul className="aero-cal-list">
              {agendaUpcoming.slice(0, AGENDA_UPCOMING_ROWS).map((ev) => (
                <li key={`upcoming-${ev.id}-${ev.occurrenceDate}`}>
                  <span className="aero-cal-date">{fromKey(ev.occurrenceDate).toLocaleDateString(LANG_TAGS[lang], { month: 'short', day: 'numeric' })}</span>
                  <EventChip ev={ev} onClick={() => openEdit(ev)} />
                </li>
              ))}
              {agendaUpcoming.length > AGENDA_UPCOMING_ROWS && (
                <li className="muted">
                  {t('common.moreNotShown', { count: agendaUpcoming.length - AGENDA_UPCOMING_ROWS })}
                </li>
              )}
            </ul>
          )}
          <div className="aero-cal-pane-title">{t('calendar.aero.overdue')}</div>
          {agendaOverdue.length === 0 ? (
            <p className="muted">{t('calendar.agenda.none')}</p>
          ) : (
            <ul className="aero-cal-list">
              {agendaOverdue.slice(0, AGENDA_ROWS).map((ev) => (
                <li key={`overdue-${ev.id}-${ev.occurrenceDate}`}>
                  <EventChip ev={ev} onClick={() => openEdit(ev)} />
                </li>
              ))}
              {agendaOverdue.length > AGENDA_ROWS && (
                <li className="muted">{t('common.moreNotShown', { count: agendaOverdue.length - AGENDA_ROWS })}</li>
              )}
            </ul>
          )}
        </aside>
      )}

      {modal && <EventModal initial={modal} onClose={() => setModal(null)} />}
    </div>
    </AppChrome>
  );
}
