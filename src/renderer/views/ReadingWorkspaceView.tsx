import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { LibraryItem } from '../../shared/types';
import {
  READING_WORKSPACE_TABS,
  readingWorkspaceSurfaceForSection,
  readingWorkspaceTabForSection,
  type ReadingWorkspaceRoute,
  type ReadingWorkspaceSection,
  type ReadingWorkspaceTab,
} from '../../shared/readingWorkspace';
import type { ReadingPassageHandoff } from '../../shared/readingPassageHandoff';
import Icon from '../components/Icons';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import { useT } from '../i18n';
import {
  claimReadingPassageHandoff,
  onReadingPassageHandoffStaged,
} from '../readingPassageHandoffClient';
import {
  consumePendingReadingWorkspaceRoute,
  consumeStagedPopoutReadingWorkspaceRoute,
  readingWorkspaceHostForSection,
  subscribeReadingWorkspaceRoutes,
  subscribeStagedPopoutReadingWorkspaceRoutes,
} from '../readingWorkspaceNavigation';
import './readingWorkspace.css';

const ReadingFinderView = lazy(() => import('./ReadingFinderView'));
const LibraryView = lazy(() => import('./LibraryView'));
const NovelsView = lazy(() => import('./NovelsView'));
const ReadingCapturesView = lazy(() => import('./ReadingCapturesView'));
const ReadingListsView = lazy(() => import('./ReadingListsView'));

const SECTION_LABEL_KEYS: Record<ReadingWorkspaceTab, string> = {
  discover: 'palette.section.reading',
  library: 'palette.section.library',
  lists: 'readingLists.view.title',
  captures: 'reading.captures.title',
  plan: 'novelsView.plan',
  imports: 'library.aero.toolbar.import',
  sources: 'novelsView.sources',
};

const SECTION_ICONS: Record<ReadingWorkspaceTab, Parameters<typeof Icon>[0]['name']> = {
  discover: 'search',
  library: 'library',
  lists: 'clipboard',
  captures: 'scan',
  plan: 'calendar',
  imports: 'download',
  sources: 'globe',
};

export interface ReadingWorkspaceViewProps {
  initialSection: ReadingWorkspaceSection;
  onOpenBook: (item: LibraryItem) => void;
  /**
   * Whether this window receives Reading deep links and lens passages.
   *
   * The `reading` and `novels` windows are the hosts those are delivered to
   * (DesktopShell opens them by host id, the lens pops out `reading`). The
   * Library window shows the same workspace but is an entry, not a host: if it
   * listened too, one deep link would move it AND open the host window, and a
   * single-use lens passage could land in whichever window claimed it first.
   */
  routeHost?: boolean;
}

export default function ReadingWorkspaceView({
  initialSection,
  onOpenBook,
  routeHost = true,
}: ReadingWorkspaceViewProps) {
  const { t } = useT();
  const [section, setSection] = useState(initialSection);
  const [passage, setPassage] = useState<ReadingPassageHandoff | null>(null);
  /** What Reading Lists asked Discover to look for. Empty until it does. */
  const [finderQuery, setFinderQuery] = useState('');
  /** The list a deep link named, so a widget header lands on that list's detail. */
  const [routedListId, setRoutedListId] = useState<string | null>(null);
  /**
   * §11.1 row 8's scroll target, kept beside `routedListId` and reset with it.
   *
   * Cleared whenever a route names a list WITHOUT an entry, so a second deep
   * link to the same list plainly lands on the top rather than silently
   * re-scrolling to the row the previous one asked for.
   */
  const [routedEntryId, setRoutedEntryId] = useState<string | null>(null);
  /**
   * §11.1's *"an entry's cover → the library item detail"*.
   *
   * An OBJECT rather than a bare id, so asking for the same book twice — cover,
   * back, cover again — is a new value and re-reveals it. A bare id would be
   * `===` to the last one and `LibraryView`'s effect would not fire.
   */
  const [reveal, setReveal] = useState<{ itemId: string } | null>(null);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const routeGenerationRef = useRef(0);

  useEffect(() => setSection(initialSection), [initialSection]);

  const applyRoute = useCallback((route: ReadingWorkspaceRoute) => {
    const generation = routeGenerationRef.current + 1;
    routeGenerationRef.current = generation;
    setSection(route.section);
    if (route.listId) {
      setRoutedListId(route.listId);
      setRoutedEntryId(route.entryId ?? null);
    }

    // Resolve identity against the current library record instead of persisting
    // a second copy in the handoff. Progress and import metadata therefore stay
    // owned by library.json and cannot go stale inside a deep link.
    if (route.intent !== 'open' || !route.itemId) return;
    void Promise.resolve(window.api.listLibrary?.() ?? [])
      .then((items) => {
        if (routeGenerationRef.current !== generation || !Array.isArray(items)) return;
        const item = items.find((candidate: LibraryItem) => candidate.id === route.itemId);
        if (item) onOpenBook(item);
      })
      .catch(() => undefined);
  }, [onOpenBook]);

  useEffect(() => {
    if (!routeHost) return undefined;
    const host = readingWorkspaceHostForSection(initialSection);
    const unsubscribe = subscribeReadingWorkspaceRoutes(host, applyRoute);
    /*
     * §11.1's Ctrl-click pop-out. Both halves, for the same reason the lens
     * handoff below needs both: the mount claim serves the COLD open, where
     * main created this window after the route was staged, and the
     * subscription serves every later gesture, because `popOut` focuses the
     * window that already exists instead of remounting it. In a desktop
     * window both are inert by construction — see `isPopoutWindow`.
     */
    const unsubscribeStaged = subscribeStagedPopoutReadingWorkspaceRoutes(host, applyRoute);
    const pending = consumePendingReadingWorkspaceRoute(host)
      ?? consumeStagedPopoutReadingWorkspaceRoute(host);
    if (pending) applyRoute(pending);
    return () => {
      routeGenerationRef.current += 1;
      unsubscribe();
      unsubscribeStaged();
    };
  }, [applyRoute, initialSection, routeHost]);

  /**
   * Claim a lens passage waiting in main, on mount and on every announcement.
   *
   * Both halves are load-bearing and neither is enough alone. The mount claim
   * serves the cold open — the lens stages, then `popOut('reading')` creates
   * this window, and the handoff is already resident before the first render.
   * The subscription serves every passage after that: `popOut` focuses the
   * existing window instead of remounting it, so a mount-only claim would make
   * the second capture of a session vanish. Claiming is what switches the tab,
   * because arriving at Discover with the passage silently loaded one tab over
   * is indistinguishable from the gesture having failed.
   *
   * `claimReadingPassageHandoff` rather than a bare take, because main's claim
   * is single-use and StrictMode's effect replay would otherwise consume the
   * passage into an effect that is immediately discarded. Measured live: the
   * pop-out mounted on Discover with the slot already emptied.
   */
  const claimPassage = useCallback(() => {
    let cancelled = false;
    void claimReadingPassageHandoff().then((handoff) => {
      if (cancelled || !handoff) return;
      setPassage(handoff);
      setSection('captures');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!routeHost) return undefined;
    const cancelMount = claimPassage();
    const unsubscribe = onReadingPassageHandoffStaged(() => {
      claimPassage();
    });
    return () => {
      cancelMount();
      unsubscribe();
    };
  }, [claimPassage, routeHost]);

  const selectByKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % READING_WORKSPACE_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + READING_WORKSPACE_TABS.length) % READING_WORKSPACE_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = READING_WORKSPACE_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = READING_WORKSPACE_TABS[nextIndex];
    setSection(nextSection);
    tabsRef.current[nextIndex]?.focus();
  };

  const surface = readingWorkspaceSurfaceForSection(section);
  /** A `home` or `continue` route lands on the Discover tab that holds both. */
  const activeTab = readingWorkspaceTabForSection(section);
  const panelId = `reading-workspace-panel-${activeTab}`;

  return (
    <div className="reading-workspace" data-reading-section={section}>
      <ContextualSurface
        as="nav"
        className="reading-workspace-nav"
        role="tablist"
        aria-label={t('reading.menu.view')}
      >
        {READING_WORKSPACE_TABS.map((item, index) => (
          <button
            key={item}
            id={`reading-workspace-tab-${item}`}
            ref={(node) => { tabsRef.current[index] = node; }}
            type="button"
            role="tab"
            className="reading-workspace-tab"
            aria-controls={`reading-workspace-panel-${item}`}
            aria-selected={activeTab === item}
            tabIndex={activeTab === item ? 0 : -1}
            onClick={() => setSection(item)}
            onKeyDown={(event) => selectByKeyboard(event, index)}
          >
            <Icon name={SECTION_ICONS[item]} size={15} />
            <span>{t(SECTION_LABEL_KEYS[item])}</span>
          </button>
        ))}
      </ContextualSurface>

      <main
        id={panelId}
        className="reading-workspace-panel"
        role="tabpanel"
        aria-labelledby={`reading-workspace-tab-${activeTab}`}
      >
        {/*
          The fallback used to be an EMPTY div with `min-height: 100%` — it
          reserved the whole panel and painted nothing, so switching to a tab
          whose chunk was still cold showed a blank surface with no indication
          anything was happening, and `aria-live` had no text to announce.
          Measured live 2026-09-06: the Library tab read 0 controls and no text
          at all on arrival, then 109 controls once its chunk landed.
        */}
        <Suspense
          fallback={
            <div className="reading-workspace-loading muted" aria-live="polite">
              {t('common.loading')}
            </div>
          }
        >
          {surface === 'library' ? (
            <LibraryView onOpen={onOpenBook} revealItemId={reveal?.itemId ?? null} />
          ) : null}
          {surface === 'finder' ? (
            <ReadingFinderView
              onOpenBook={onOpenBook}
              mode="discover"
              initialQuery={finderQuery || undefined}
            />
          ) : null}
          {surface === 'lists' ? (
            <ReadingListsView
              key={routedListId ?? 'all'}
              initialListId={routedListId}
              initialEntryId={routedEntryId}
              onOpenBook={onOpenBook}
              // §11.1's acquisition path, and the reason it is a real one here:
              // Discover is a sibling tab of this very workspace, so "find this"
              // is a tab switch carrying the title rather than a new window and
              // a search box the user has to retype into.
              onFindWork={(title) => {
                setFinderQuery(title);
                setSection('discover');
              }}
              // §11.1's cover route. Library is a sibling tab of this very
              // workspace, so revealing a book is a tab switch carrying the id
              // rather than a second navigation path into a different window.
              onShowInLibrary={(item) => {
                setReveal({ itemId: item.id });
                setSection('library');
              }}
            />
          ) : null}
          {surface === 'novels' ? <NovelsView mode={section as 'plan' | 'imports' | 'sources'} /> : null}
          {surface === 'captures' ? <ReadingCapturesView passage={passage} /> : null}
        </Suspense>
      </main>
    </div>
  );
}
