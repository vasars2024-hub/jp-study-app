/**
 * Blanc calendar panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useT } from '../../i18n';
import {
  CalendarBody,
  CalendarNav,
  EventModal,
  toKey,
  useCalendar,
} from '../calendar/CalendarContent';

export function BlancCalendarPanel() {
  const { t } = useT();
  const state = useCalendar();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.cal.navigate')}</legend>
        <CalendarNav state={state} />
        <div className="blanc-status-row">
          <span>{state.headerLabel}</span>
          <span>{t('blanc.study.cal.eventCount', { count: state.events.length })}</span>
          {state.agendaOverdue.length > 0 && (
            <span>{t('blanc.study.cal.overdue', { count: state.agendaOverdue.length })}</span>
          )}
          <button type="button" onClick={() => state.openNew(toKey(state.cursor))}>
            {t('blanc.study.cal.newEvent')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{state.modeLabels[state.mode]}</legend>
        <CalendarBody state={state} />
      </fieldset>

      {state.modal && <EventModal initial={state.modal} onClose={() => state.setModal(null)} />}
    </div>
  );
}
