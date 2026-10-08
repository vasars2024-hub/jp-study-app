/**
 * Blanc resources panel.
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
  ResourceBundleDetail,
  ResourceBundles,
  ResourceGroups,
  ResourceMyTools,
  ResourceNewSection,
  useResources,
} from '../resources/ResourcesContent';

export function BlancResourcesPanel() {
  const { t } = useT();
  const state = useResources();

  if (state.selectedBundle) {
    return (
      <div className="blanc-tool-detail">
        <fieldset>
          <legend>{t('blanc.study.res.bundle')}</legend>
          <div className="blanc-row-actions">
            <button type="button" onClick={state.closeBundle}>
              {t('blanc.study.res.back')}
            </button>
          </div>
          <ResourceBundleDetail state={state} />
        </fieldset>
      </div>
    );
  }

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.res.catalogue')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={state.query}
            onChange={(e) => state.setQuery(e.target.value)}
            placeholder={t('blanc.study.res.find')}
          />
          <button
            type="button"
            onClick={() => void state.doRefresh()}
            disabled={state.refreshState === 'refreshing'}
          >
            {state.refreshState === 'refreshing'
              ? t('blanc.study.res.refreshing')
              : t('blanc.study.refresh')}
          </button>
          {/* The "All" filter lives once, in the Categories row below. */}
        </div>
        <div className="blanc-status-row">
          <span>{t('blanc.study.res.visible', { count: state.total })}</span>
          <span>{t('blanc.study.res.indexed', { count: state.allTotal })}</span>
          <span>{t('blanc.study.res.bundleCount', { count: state.bundles.length })}</span>
          {state.refreshState === 'offline' && <span>{t('blanc.study.res.offline')}</span>}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.res.categories')}</legend>
        <div className="blanc-segmented">
          <button
            type="button"
            className={state.filter === 'All' ? 'active' : ''}
            aria-pressed={state.filter === 'All'}
            onClick={() => state.setFilter('All')}
          >
            {t('blanc.study.res.all')}
          </button>
          {state.allCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={state.filter === cat.id ? 'active' : ''}
              onClick={() => state.setFilter(cat.id)}
              title={cat.blurb}
            >
              {cat.title} ({cat.items.length})
            </button>
          ))}
        </div>
      </fieldset>

      {state.showLanding && state.bundles.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.res.bundles')}</legend>
          <ResourceBundles state={state} />
        </fieldset>
      )}

      {state.showLanding && state.tools.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.res.myTools')}</legend>
          <ResourceMyTools state={state} />
        </fieldset>
      )}

      {state.showLanding && state.newEntries.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.res.recent')}</legend>
          <ResourceNewSection state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('blanc.study.res.resources')}</legend>
        <ResourceGroups state={state} />
      </fieldset>
    </div>
  );
}
