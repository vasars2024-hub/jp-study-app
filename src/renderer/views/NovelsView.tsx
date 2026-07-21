import Icon from '../components/Icons';
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

export default function NovelsView() {
  const aero = useAeroMaterials();
  const state = useNovels();
  const {
    query, setQuery, planOnly, setPlanOnly, showSources, setShowSources,
    loadingJiten, refreshingNovels, status, store, jitenDecks,
    candidates, selectedCandidate, refreshJiten, refreshNovels,
  } = state;

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'refresh-jiten', label: 'Refresh Jiten', onSelect: () => void refreshJiten() },
        { id: 'refresh-local', label: 'Refresh local catalogue', onSelect: () => void refreshNovels() },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'planned', label: planOnly ? 'Show all titles' : 'Show plan only', onSelect: () => setPlanOnly((v) => !v) },
        { id: 'sources', label: showSources ? 'Hide sources' : 'Configure sources', onSelect: () => setShowSources((v) => !v) },
      ],
    },
  ];

  const content = (
    <div className="jiten-novels">
      <Toolbar className="jiten-novels-toolbar" aria-label="Novel finder commands">
        <div className="jiten-search-wrap">
          <Icon name="search" size={15} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void refreshJiten();
            }}
            placeholder="Search title, author, genre, or tag"
            lang="ja"
          />
        </div>
        <button type="button" className="aero-novels-command" disabled={loadingJiten} onClick={() => void refreshJiten()}>
          <Icon name="refresh" size={12} />
          {loadingJiten ? 'Searching' : 'Search Jiten'}
        </button>
        <button type="button" className="aero-novels-command" disabled={refreshingNovels} onClick={() => void refreshNovels()}>
          <Icon name="library" size={12} />
          Local
        </button>
        <ToolbarSpacer />
        <button type="button" className={`aero-novels-command ${planOnly ? 'active' : ''}`} onClick={() => setPlanOnly((v) => !v)}>
          Plan {store?.plan.length ? `(${store.plan.length})` : ''}
        </button>
        <button type="button" className="aero-novels-command" onClick={() => setShowSources((v) => !v)}>
          <Icon name="settings" size={12} />
          Sources
        </button>
      </Toolbar>

      {status && <div className="jiten-status banner">{status}</div>}

      <div className="jiten-workbench">
        <aside className="jiten-filters" aria-label="Novel filters">
          <NovelsFilters state={state} />
        </aside>

        <main className="jiten-table-wrap" aria-label="Plan to Read titles">
          <NovelsTable state={state} />
        </main>

        <aside className="jiten-inspector" aria-label="Novel details">
          <NovelsInspector state={state} />
        </aside>
      </div>
    </div>
  );

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{candidates.length} titles</StatusBarField>
            <StatusBarField>{store?.plan.length ?? 0} planned</StatusBarField>
            <StatusBarField>{jitenDecks.length} Jiten</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>{selectedCandidate?.titleJp ?? 'No selection'}</StatusBarField>
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
