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
        <NotebookViewTabs state={state} />

        <div className="gx-notebook-overview">
          <NotebookStreamCounts state={state} />
          <div className="gx-notebook-actions">
            <button type="button" className="btn primary" onClick={reviewNotebook}>
              {t('notebook.review')}
            </button>
            <button type="button" className="btn ghost" onClick={state.refresh}>
              {t('notebook.refresh')}
            </button>
          </div>
        </div>

        <div className="gx-notebook-body">
          <aside className="gx-notebook-folders">
            <NotebookFolders state={state} />
          </aside>

          <section className="gx-notebook-timeline">
            <NotebookTimeline state={state} onOpen={studyOsOpenHref} />
          </section>
        </div>
      </div>
    </AppChrome>
  );
}
