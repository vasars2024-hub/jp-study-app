import { useEffect } from 'react';
import Icon from '../components/Icons';
import { useT } from '../i18n';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import {
  NovelsFilters,
  NovelsInspector,
  NovelsTable,
  useNovels,
} from '../components/novels/NovelsContent';

export type NovelsViewMode = 'plan' | 'imports' | 'sources';

export interface NovelsViewProps {
  mode?: NovelsViewMode;
}

export default function NovelsView({ mode = 'plan' }: NovelsViewProps) {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useNovels();
  const {
    query, setQuery, planOnly, setPlanOnly, setImportFilter,
    showSources, setShowSources,
    loadingJiten, refreshingNovels, status, store, jitenDecks,
    candidates, selectedCandidate, refreshJiten, refreshNovels,
  } = state;

  useEffect(() => {
    setPlanOnly(mode !== 'sources');
    setImportFilter(mode === 'imports' ? 'not-imported' : 'all');
    setShowSources(mode === 'sources');
  }, [mode, setImportFilter, setPlanOnly, setShowSources]);

  const sourcesMode = mode === 'sources';

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('novelsView.menu.file'),
      items: [
        { id: 'refresh-jiten', label: t('novelsView.menu.refreshJiten'), onSelect: () => void refreshJiten() },
        { id: 'refresh-local', label: t('novelsView.menu.refreshLocal'), onSelect: () => void refreshNovels() },
      ],
    },
    {
      id: 'view',
      label: t('novelsView.menu.view'),
      items: [
        { id: 'planned', label: planOnly ? t('novelsView.menu.showAll') : t('novelsView.menu.showPlanOnly'), onSelect: () => setPlanOnly((v) => !v) },
        { id: 'sources', label: showSources ? t('novelsView.menu.hideSources') : t('novelsView.menu.configureSources'), onSelect: () => setShowSources((v) => !v) },
      ],
    },
  ];

  const content = (
    <div className="jiten-novels" data-novels-mode={mode}>
      {!sourcesMode ? (
        <Toolbar className="jiten-novels-toolbar" aria-label={t('novelsView.aria.commands')}>
          <div className="jiten-search-wrap">
            <Icon name="search" size={15} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void refreshJiten();
              }}
              placeholder={t('novelsView.searchPlaceholder')}
              lang="ja"
            />
          </div>
          <button type="button" className="aero-novels-command" disabled={loadingJiten} onClick={() => void refreshJiten()}>
            <Icon name="refresh" size={12} />
            {loadingJiten ? t('novelsView.searching') : t('novelsView.searchJiten')}
          </button>
          <button type="button" className="aero-novels-command" disabled={refreshingNovels} onClick={() => void refreshNovels()}>
            <Icon name="library" size={12} />
            {t('novelsView.local')}
          </button>
          <ToolbarSpacer />
          <button type="button" className={`aero-novels-command ${mode === 'plan' ? 'active' : ''}`} onClick={() => setPlanOnly((v) => !v)}>
            {t('novelsView.plan')} {store?.plan.length ? `(${store.plan.length})` : ''}
          </button>
          <button type="button" className="aero-novels-command" onClick={() => setShowSources((v) => !v)}>
            <Icon name="settings" size={12} />
            {t('novelsView.sources')}
          </button>
        </Toolbar>
      ) : null}

      {status && <div className="jiten-status banner">{status}</div>}

      <div className="jiten-workbench">
        <aside className="jiten-filters" aria-label={t('novelsView.aria.filters')}>
          <NovelsFilters state={state} />
        </aside>

        {!sourcesMode ? (
          <>
            <main className="jiten-table-wrap" aria-label={t('novelsView.aria.table')}>
              <NovelsTable state={state} />
            </main>

            <aside className="jiten-inspector" aria-label={t('novelsView.aria.inspector')}>
              <NovelsInspector state={state} />
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{t('novelsView.status.titles', { count: candidates.length })}</StatusBarField>
            <StatusBarField>{t('novelsView.status.planned', { count: store?.plan.length ?? 0 })}</StatusBarField>
            <StatusBarField>{t('novelsView.status.jiten', { count: jitenDecks.length })}</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>{selectedCandidate?.titleJp ?? t('novelsView.noSelection')}</StatusBarField>
          </>
        }
        className="aero-novels-chrome"
      >
        {content}
      </AppChrome>
    );
  }

  return <div className="nov-view">{content}</div>;
}
