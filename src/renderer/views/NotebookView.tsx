import { useT } from '../i18n';
import {
  NotebookFolders,
  NotebookStreamCounts,
  NotebookTimeline,
  NotebookViewTabs,
  studyOsOpenHref,
  useNotebook,
} from '../components/notebook/NotebookContent';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  useAeroMaterials,
} from '../components/ui';
import LiveCaptionsPanel from '../components/notebook/LiveCaptionsPanel';
import { ContextualSurface } from '../components/liquid/LiquidSurface';

export default function NotebookView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useNotebook();

  function reviewNotebook() {
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'flashcards' }));
  }

  const status = (
    <>
      <StatusBarField>{t('notebook.status')}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{t('notebook.count', { count: state.visible.length })}</StatusBarField>
    </>
  );

  return (
    <AppChrome status={status} className={aero ? 'aero-notebook-chrome' : 'notebook-chrome'}>
      <div className="gx-notebook">
        <div className="gx-notebook-actions">
          <button type="button" className="btn primary" onClick={reviewNotebook}>
            {t('notebook.review')}
          </button>
          <button type="button" className="btn ghost" onClick={state.refresh}>
            {t('notebook.refresh')}
          </button>
        </div>

        <NotebookViewTabs state={state} />

        <ContextualSurface as="details" className="gx-notebook-filters">
          <summary className="gx-notebook-filters-summary">
            <span>{t(`notebook.view.${state.view}`)}</span>
            <span className="muted">{t('notebook.count', { count: state.visible.length })}</span>
          </summary>
          <NotebookStreamCounts state={state} />
          <ContextualSurface as="div" className="gx-notebook-folders">
            <NotebookFolders state={state} />
          </ContextualSurface>
        </ContextualSurface>

        <div className="gx-notebook-body gx-notebook-body-timeline">
          <section className="gx-notebook-timeline">
            <LiveCaptionsPanel />
            <NotebookTimeline state={state} onOpen={studyOsOpenHref} />
          </section>
        </div>
      </div>
    </AppChrome>
  );
}
