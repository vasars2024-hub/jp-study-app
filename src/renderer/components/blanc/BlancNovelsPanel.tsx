/**
 * Blanc novels catalogue panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import Icon from '../Icons';
import {
  NovelsFilters,
  NovelsInspector,
  NovelsTable,
  useNovels,
} from '../novels/NovelsContent';
import { useT } from '../../i18n';

/**
 * Pillar 2 port of `NovelsView` — Blanc previously had only `NovelReader`
 * (reading), no catalogue. Composes the shared `useNovels` state and the
 * `jiten-*` workbench blocks; the toolbar is Blanc-native. The three-pane
 * `jiten-workbench` grid is kept so a wide Blanc window matches Study OS, while
 * the `blanc-tool-detail` chrome replaces the aero `AppChrome`.
 */
export function BlancNovelsPanel() {
  const { t } = useT();
  const state = useNovels();
  const {
    query, setQuery, planOnly, setPlanOnly, showSources, setShowSources,
    loadingJiten, refreshingNovels, status, store, jitenDecks,
    candidates, refreshJiten, refreshNovels,
  } = state;

  return (
    <div className="blanc-tool-detail blanc-novels">
      <fieldset>
        <legend>{t('blanc.library.find')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={query}
            lang="ja"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter confirms an IME conversion; it must not search yet.
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === 'Enter') void refreshJiten();
            }}
            placeholder={t('novelsView.searchPlaceholder')}
          />
          <button type="button" disabled={loadingJiten} onClick={() => void refreshJiten()}>
            <Icon name="refresh" size={12} />
            {loadingJiten ? t('blanc.library.searching') : t('novelsView.searchJiten')}
          </button>
          <button type="button" disabled={refreshingNovels} onClick={() => void refreshNovels()}>
            <Icon name="library" size={12} />
            {t('novelsView.local')}
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{t('novelsView.status.titles', { count: candidates.length })}</span>
          <span>{t('blanc.library.fromJiten', { count: jitenDecks.length })}</span>
          <button type="button" className={planOnly ? 'active' : ''} aria-pressed={planOnly} onClick={() => setPlanOnly((v) => !v)}>
            {store?.plan.length
              ? t('blanc.library.planCount', { count: store.plan.length })
              : t('novelsView.plan')}
          </button>
          <button type="button" className={showSources ? 'active' : ''} aria-pressed={showSources} onClick={() => setShowSources((v) => !v)}>
            <Icon name="settings" size={12} />
            {t('novelsView.sources')}
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      <div className="jiten-workbench blanc-jiten-workbench">
        <aside className="jiten-filters" aria-label={t('novelsView.aria.filters')}>
          <NovelsFilters state={state} />
        </aside>
        <main className="jiten-table-wrap" aria-label={t('novelsView.aria.table')}>
          <NovelsTable state={state} />
        </main>
        <aside className="jiten-inspector" aria-label={t('novelsView.aria.inspector')}>
          <NovelsInspector state={state} />
        </aside>
      </div>
    </div>
  );
}
