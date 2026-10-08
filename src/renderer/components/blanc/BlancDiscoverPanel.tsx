/**
 * Blanc discover panel.
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
  DiscoveryControls,
  DiscoveryInspector,
  DiscoveryResults,
  DiscoveryTabs,
  useDiscovery,
} from '../discover/DiscoverContent';
import { useT } from '../../i18n';

/**
 * Pillar 2 port of the Scraper app's Discover page — the one study-relevant
 * surface inside `ScraperView`. Blanc deliberately does not mirror the rest of
 * that app (job runner, torrent and source managers, selector/regex tools): it
 * is an acquisition shell with its own chrome and its own mock port, and
 * pulling it in would defeat Pillar 1. What Blanc wants is the console that
 * answers "what should I watch next at my level, and why", which
 * `discover/DiscoverContent.tsx` already isolates as a hook plus four
 * presentation-neutral blocks — written that way for exactly this port.
 *
 * The shortlist is the shared `discoveryShortlistStore`, so a title bookmarked
 * here is the same one Study OS's Discover page shows, and the level is seeded
 * from the same media library.
 */
export function BlancDiscoverPanel() {
  const { t } = useT();
  const state = useDiscovery();

  return (
    <div className="blanc-tool-detail blanc-discover">
      <fieldset>
        <legend>{t('scraper.search.label')}</legend>
        <DiscoveryControls state={state} />
        <div className="blanc-status-row">
          <span>{t('scraper.count.results', { count: state.results.length })}</span>
          <span>{t('scraper.count.library', { count: state.libraryCount })}</span>
          <button
            type="button"
            className={state.tab === 'shortlist' ? 'active' : ''}
            onClick={() => state.setTab(state.tab === 'shortlist' ? 'browse' : 'shortlist')}
          >
            <Icon name="bookmark" size={12} />
            {t('scraper.tab.shortlist')}
            {state.shortlist.length > 0 ? ` (${state.shortlist.length})` : ''}
          </button>
        </div>
      </fieldset>

      <div className="disc-view blanc-disc-workbench">
        <DiscoveryTabs state={state} />
        <div className="disc-body">
          <div className="disc-main">
            <DiscoveryResults state={state} />
          </div>
          <DiscoveryInspector state={state} />
        </div>
      </div>
    </div>
  );
}
