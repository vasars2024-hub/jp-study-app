/**
 * Blanc notebook panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import { useState } from 'react';
import { useT } from '../../i18n';
import {
  NotebookFolders,
  NotebookStreamCounts,
  NotebookTimeline,
  NotebookViewTabs,
  TIMELINE_CAP,
  useNotebook,
} from '../notebook/NotebookContent';

/**
 * Pillar 2 port of `NotebookView`. Blanc previously had only `quick-notes`,
 * which the plan keeps deliberately separate (a local scratchpad, not the
 * aggregated notebook).
 *
 * Navigation is Blanc-specific: Study OS's `os:open` bus does not move Blanc's
 * tabs, so hrefs are translated onto the `toolbox:open-tool` /
 * `blanc:select-tab` buses the shell already listens to. A target Blanc has no
 * surface for is reported rather than silently doing nothing.
 */
const NOTEBOOK_HREF_TO_BLANC_TOOL: Record<string, string> = {
  dictionary: 'dictionary',
  grammar: 'grammar',
  clipboard: 'clipboard',
  resources: 'resources',
  calendar: 'calendar',
  notebook: 'notebook',
  immersion: 'immersion-tracker',
};

const NOTEBOOK_HREF_TO_BLANC_TAB: Record<string, string> = {
  flashcards: 'flashcards',
  anki: 'deck',
  'anki-deck': 'deck',
  statistics: 'stats',
  stats: 'stats',
  media: 'media',
  player: 'media',
  video: 'media',
  'epub-mining': 'mine',
  library: 'read',
  novels: 'read',
};

export function BlancNotebookPanel() {
  const { t } = useT();
  const state = useNotebook();
  const [unreachable, setUnreachable] = useState<string | null>(null);

  const onOpen = (href?: string): void => {
    if (!href) return;
    const tool = NOTEBOOK_HREF_TO_BLANC_TOOL[href];
    if (tool) {
      setUnreachable(null);
      window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: tool }));
      return;
    }
    const tab = NOTEBOOK_HREF_TO_BLANC_TAB[href];
    if (tab) {
      setUnreachable(null);
      window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: tab }));
      return;
    }
    setUnreachable(href);
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.notebook.view')}</legend>
        <NotebookViewTabs state={state} />
        <div className="blanc-status-row">
          <span>{t('blanc.study.notebook.entryCount', { count: state.visible.length })}</span>
          <span>{t('blanc.study.notebook.folderCount', { count: state.folders.length })}</span>
          {state.truncated && (
            <span>{t('blanc.study.notebook.showingFirst', { count: TIMELINE_CAP })}</span>
          )}
          <button type="button" onClick={state.refresh}>
            {t('blanc.study.refresh')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.notebook.streams')}</legend>
        <NotebookStreamCounts state={state} />
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.notebook.folders')}</legend>
        <div className="gx-notebook-folders">
          <NotebookFolders state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.notebook.timeline')}</legend>
        {unreachable && (
          <p className="blanc-note">
            {t('blanc.study.notebook.unreachable', { target: unreachable })}
          </p>
        )}
        <NotebookTimeline state={state} onOpen={onOpen} />
      </fieldset>
    </div>
  );
}
