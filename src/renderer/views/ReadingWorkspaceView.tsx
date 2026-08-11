import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { LibraryItem } from '../../shared/types';
import {
  READING_WORKSPACE_SECTIONS,
  readingWorkspaceSurfaceForSection,
  type ReadingWorkspaceSection,
} from '../../shared/readingWorkspace';
import Icon from '../components/Icons';
import { useT } from '../i18n';
import './readingWorkspace.css';

const ReadingFinderView = lazy(() => import('./ReadingFinderView'));
const LibraryView = lazy(() => import('./LibraryView'));
const NovelsView = lazy(() => import('./NovelsView'));

const SECTION_LABEL_KEYS: Record<ReadingWorkspaceSection, string> = {
  home: 'settings.nav.home',
  discover: 'palette.section.reading',
  library: 'palette.section.library',
  continue: 'reading.continue.title',
  plan: 'novelsView.plan',
  imports: 'library.aero.toolbar.import',
  sources: 'novelsView.sources',
};

const SECTION_ICONS: Record<ReadingWorkspaceSection, Parameters<typeof Icon>[0]['name']> = {
  home: 'app',
  discover: 'search',
  library: 'library',
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
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => setSection(initialSection), [initialSection]);

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
      <nav className="reading-workspace-nav" role="tablist" aria-label={t('reading.menu.view')}>
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
      </nav>

      <main
        id={panelId}
        className="reading-workspace-panel"
        role="tabpanel"
        aria-labelledby={`reading-workspace-tab-${section}`}
      >
        <Suspense fallback={<div className="reading-workspace-loading muted" aria-live="polite" />}>
          {surface === 'library' ? <LibraryView onOpen={onOpenBook} /> : null}
          {surface === 'finder' ? (
            <ReadingFinderView
              onOpenBook={onOpenBook}
              mode={section === 'continue' ? 'continue' : section === 'home' ? 'home' : 'discover'}
            />
          ) : null}
          {surface === 'novels' ? <NovelsView mode={section as 'plan' | 'imports' | 'sources'} /> : null}
        </Suspense>
      </main>
    </div>
  );
}
