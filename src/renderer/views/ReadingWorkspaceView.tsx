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
  READING_WORKSPACE_SECTIONS,
  readingWorkspaceSurfaceForSection,
  type ReadingWorkspaceRoute,
  type ReadingWorkspaceSection,
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
  readingWorkspaceHostForSection,
  subscribeReadingWorkspaceRoutes,
} from '../readingWorkspaceNavigation';
import './readingWorkspace.css';

const ReadingFinderView = lazy(() => import('./ReadingFinderView'));
const LibraryView = lazy(() => import('./LibraryView'));
const NovelsView = lazy(() => import('./NovelsView'));
const ReadingCapturesView = lazy(() => import('./ReadingCapturesView'));
const ReadingListsView = lazy(() => import('./ReadingListsView'));

const SECTION_LABEL_KEYS: Record<ReadingWorkspaceSection, string> = {
  home: 'settings.nav.home',
  discover: 'palette.section.reading',
  library: 'palette.section.library',
  lists: 'readingLists.view.title',
  captures: 'reading.captures.title',
  continue: 'reading.continue.title',
  plan: 'novelsView.plan',
  imports: 'library.aero.toolbar.import',
  sources: 'novelsView.sources',
};

const SECTION_ICONS: Record<ReadingWorkspaceSection, Parameters<typeof Icon>[0]['name']> = {
  home: 'app',
  discover: 'search',
  library: 'library',
  lists: 'clipboard',
  captures: 'scan',
  continue: 'bookmark',
  plan: 'calendar',
  imports: 'download',
  sources: 'globe',
};

export interface ReadingWorkspaceViewProps {
  initialSection: ReadingWorkspaceSection;
  onOpenBook: (item: LibraryItem) => void;
}

export default function ReadingWorkspaceView({
  initialSection,
  onOpenBook,
}: ReadingWorkspaceViewProps) {
  const { t } = useT();
  const [section, setSection] = useState(initialSection);
  const [passage, setPassage] = useState<ReadingPassageHandoff | null>(null);
  /** What Reading Lists asked Discover to look for. Empty until it does. */
  const [finderQuery, setFinderQuery] = useState('');
  /** The list a deep link named, so a widget header lands on that list's detail. */
  const [routedListId, setRoutedListId] = useState<string | null>(null);
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
    if (route.listId) setRoutedListId(route.listId);

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
    const host = readingWorkspaceHostForSection(initialSection);
    const unsubscribe = subscribeReadingWorkspaceRoutes(host, applyRoute);
    const pending = consumePendingReadingWorkspaceRoute(host);
    if (pending) applyRoute(pending);
    return () => {
      routeGenerationRef.current += 1;
      unsubscribe();
    };
  }, [applyRoute, initialSection]);

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
    const cancelMount = claimPassage();
    const unsubscribe = onReadingPassageHandoffStaged(() => {
      claimPassage();
    });
    return () => {
      cancelMount();
      unsubscribe();
    };
  }, [claimPassage]);

  const selectByKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % READING_WORKSPACE_SECTIONS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + READING_WORKSPACE_SECTIONS.length) % READING_WORKSPACE_SECTIONS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = READING_WORKSPACE_SECTIONS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = READING_WORKSPACE_SECTIONS[nextIndex];
    setSection(nextSection);
    tabsRef.current[nextIndex]?.focus();
  };

  const surface = readingWorkspaceSurfaceForSection(section);
  const panelId = `reading-workspace-panel-${section}`;

  return (
    <div className="reading-workspace" data-reading-section={section}>
      <ContextualSurface
        as="nav"
        className="reading-workspace-nav"
        role="tablist"
        aria-label={t('reading.menu.view')}
      >
        {READING_WORKSPACE_SECTIONS.map((item, index) => (
          <button
            key={item}
            id={`reading-workspace-tab-${item}`}
            ref={(node) => { tabsRef.current[index] = node; }}
            type="button"
            role="tab"
            className="reading-workspace-tab"
            aria-controls={`reading-workspace-panel-${item}`}
            aria-selected={section === item}
            tabIndex={section === item ? 0 : -1}
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
        aria-labelledby={`reading-workspace-tab-${section}`}
      >
        <Suspense fallback={<div className="reading-workspace-loading muted" aria-live="polite" />}>
          {surface === 'library' ? (
            <LibraryView onOpen={onOpenBook} revealItemId={reveal?.itemId ?? null} />
          ) : null}
          {surface === 'finder' ? (
            <ReadingFinderView
              onOpenBook={onOpenBook}
              mode={section === 'continue' ? 'continue' : section === 'home' ? 'home' : 'discover'}
              initialQuery={section === 'discover' ? finderQuery : undefined}
            />
          ) : null}
          {surface === 'lists' ? (
            <ReadingListsView
              key={routedListId ?? 'all'}
              initialListId={routedListId}
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
