// Reading Finder (Plan 1, "Road to v1.01") — "find your ultimate what-to-read".
// Filters a curated site directory by level/genre/length/furigana/price,
// scores a pasted chapter URL's honest comprehensibility ("% of words you
// already know") against the user's own knowledge store, and opens results in
// NovelReader via the existing library-import pipeline — so dictionary
// popups, de-inflection, mining, and progress-saving all work exactly as they
// do for any other book, for free. Continue Reading re-lists web-sourced
// library items already in progress.
//
// The filtering/fetching logic and the body live in
// components/reading/ReadingFinderContent.tsx so Blanc can render the same
// finder without this file's AppChrome (see BLANC_REFINEMENT_PLAN.md Pillar 0).

import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu, useAeroMaterials } from '../components/ui';
import {
  ALL_LEVELS,
  ContinueReadingRow,
  ReadingFinderControls,
  ReadingSiteDetail,
  ReadingSiteGrid,
  levelRangeLabel,
  useReadingFinder,
} from '../components/reading/ReadingFinderContent';
import type { LibraryItem } from '../../shared/types';
import { useT } from '../i18n';

export default function ReadingFinderView({ onOpenBook }: { onOpenBook: (item: LibraryItem) => void }) {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useReadingFinder();
  const { query, setQuery, levels, list, continueReading, selected, setSelected, surpriseMe, resetFilters, showAdult, setShowAdult } = state;

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('reading.menu.file'),
      items: [
        { id: 'clear-search', label: t('reading.menu.clearSearch'), disabled: !query, onSelect: () => setQuery('') },
        { id: 'surprise', label: t('reading.controls.surprise'), disabled: list.length === 0, onSelect: surpriseMe },
      ],
    },
    {
      id: 'view',
      label: t('reading.menu.view'),
      items: [
        { id: 'all', label: t('reading.menu.showAll'), onSelect: resetFilters },
        {
          id: 'toggle-adult',
          label: showAdult ? t('reading.controls.adultHide') : t('reading.controls.adultToggle'),
          onSelect: () => setShowAdult((v) => !v),
        },
      ],
    },
  ];

  const status = (
    <>
      <StatusBarField>{t('reading.count', { count: list.length })}</StatusBarField>
      {continueReading.length > 0 && (
        <StatusBarField>{t('reading.continue.count', { count: continueReading.length })}</StatusBarField>
      )}
      <StatusBarSpacer />
      <StatusBarField>{t('reading.meta.level')}: {levelRangeLabel([...levels].length ? [...levels] : ALL_LEVELS)}</StatusBarField>
    </>
  );

  return (
    <AppChrome menus={menus} status={status} className="aero-reading-chrome">
      <div className={`rf-view${aero ? ' aero-reading' : ''}`}>
        <div className="view-head">
          <h1>{t('reading.title')}</h1>
          <p className="muted">{t('reading.intro')}</p>
        </div>

        {continueReading.length > 0 && (
          <section className="rf-continue">
            <h2>{t('reading.continue.title')}</h2>
            <ContinueReadingRow state={state} onOpenBook={onOpenBook} />
          </section>
        )}

        <ReadingFinderControls state={state} />

        <div className="gram-count muted">{t('reading.count', { count: list.length })}</div>

        <ReadingSiteGrid state={state} />

        {selected && (
          <ReadingSiteDetail site={selected} onClose={() => setSelected(null)} onOpenBook={onOpenBook} />
        )}
      </div>
    </AppChrome>
  );
}
