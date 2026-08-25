/**
 * The centre pane: page heading, sort/filter/view toolbar, type chips, and the
 * virtualized card grid.
 *
 * The pane itself never scrolls — the grid does. That is what keeps the heading
 * and the chips in place while a 6,000-episode library moves under them, and it
 * is the reason the old `height: 60vh; max-height: 640px` grid box is gone.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import VirtualGrid from '../../VirtualGrid';
import { Button, Select } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import MediaPosterCard, {
  CARD_METRICS,
  LIST_ROW_HEIGHT,
  cardRowHeight,
  type MediaCardVariant,
} from './MediaPosterCard';
import MediaSpotlightCard from './MediaSpotlightCard';
import { mediaSubtitleStatus } from '../../../../shared/mediaSubtitleStatus';
import {
  MEDIA_SORTS,
  sortOptionsForCategory,
  type MediaSortId,
} from '../../../../shared/mediaSorting';
import type { LibraryEntry } from '../../../../shared/mediaLibraryEntries';
import type { MediaCategory } from '../../../../shared/mediaCategories';

const GRID_GAP = 14;

export type LibraryViewMode = 'grid' | 'list';

export interface MediaLibraryBrowserProps {
  title: string;
  entries: LibraryEntry[];
  /** Drives which sorts are offered — only ones that mean something here. */
  category: MediaCategory;
  sort: MediaSortId;
  onSortChange: (sort: MediaSortId) => void;
  view: LibraryViewMode;
  onViewChange: (view: LibraryViewMode) => void;
  /** Release-kind chips. Empty hides the row. */
  chips: Array<{ id: string; label: string }>;
  activeChip: string;
  onChipChange: (id: string) => void;
  selectedId: string | null;
  currentId: string | null;
  /**
   * Card click. The shell decides what that means: a single file plays, a series
   * opens its episode list — you cannot "play" a 26-episode run, and guessing
   * which episode the user meant is exactly the "unrelated series page" problem.
   */
  onActivate: (entry: LibraryEntry) => void;
  onMenu: (entry: LibraryEntry, anchor: HTMLElement) => void;
  onAdd: () => void;
  /** Rendered instead of the grid when there is genuinely nothing to show. */
  empty?: React.ReactNode;
}

export default function MediaLibraryBrowser({
  title,
  entries,
  category,
  sort,
  onSortChange,
  view,
  onViewChange,
  chips,
  activeChip,
  onChipChange,
  selectedId,
  currentId,
  onActivate,
  onMenu,
  onAdd,
  empty,
}: MediaLibraryBrowserProps) {
  const { t, lang } = useT();

  const sortOptions = useMemo(
    () => sortOptionsForCategory(category).map((id) => ({
      value: id,
      label: t(MEDIA_SORTS[id].labelKey),
    })),
    [category, lang],
  );

  /**
   * The current sort, named on the closed `View` summary. Without it the disclosure hides
   * state as well as controls, and the user has to open it just to read how the shelf is
   * ordered — which is the difference between grouping controls and burying them.
   */
  const activeSortLabel = sortOptions.find((option) => option.value === sort)?.label ?? '';

  const viewRef = useRef<HTMLDetailsElement>(null);
  const [viewOpen, setViewOpen] = useState(false);
  useEffect(() => {
    if (!viewOpen) return undefined;
    const close = () => { if (viewRef.current) viewRef.current.open = false; };
    // `pointerdown`, not `click`: a click that starts outside and ends inside a re-rendered
    // popover never fires as one `click` on the document, so the panel stays open.
    const onDown = (event: PointerEvent) => {
      const node = viewRef.current;
      if (node && !node.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      // Escape must leave focus somewhere real, or the next Tab restarts at the document.
      viewRef.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [viewOpen]);

  const totals = useMemo(() => ({
    entries: entries.length,
    files: entries.reduce((sum, entry) => sum + entry.episodeCount + entry.extras.length, 0),
  }), [entries]);

  // Series and albums get a poster; a shelf of individual episodes gets a still,
  // because a 2:3 crop of a 16:9 frame throws away most of the picture.
  const variant: MediaCardVariant = entries.some((entry) => entry.grouping !== 'none')
    ? 'poster'
    : 'still';

  return (
    <section className="medialib-browser" aria-label={t('media.browser.label')}>
      <header className="medialib-browser__head">
        <div className="medialib-browser__heading">
          <h2 className="medialib-browser__title" title={title}>{title}</h2>
          <span className="medialib-browser__sub">
            {t('media.browser.counts', { entries: totals.entries, files: totals.files })}
          </span>
        </div>

        <div className="medialib-browser__tools">
          {/*
            Sort order and grid/list density are ONE concept — how this library is displayed —
            that was spread across three persistently visible controls. Grouped behind a single
            `View` disclosure they are still one click and one Enter away, the current sort is
            still named on the summary so nothing has to be opened to read the state, and the
            toolbar keeps a visible primary action. This is the toolbar half of Q4 on this
            surface; the sidebar half is `mc-nav-group` in `MediaCenterView`.

            A native `<details>` rather than a custom popover: it is keyboard-operable and
            screen-reader-announced for free, and `onToggle` is the only state this needs.
            `viewRef` closes it on an outside pointerdown and on Escape — a toolbar disclosure
            that stays open after you have used it is the clunkiness this surface is scored on.
          */}
          <details className="medialib-view" ref={viewRef} onToggle={(e) => setViewOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="medialib-view__head">
              <Icon name="eye" size={14} />
              <span>{t('media.browser.view')}</span>
              <small>{activeSortLabel}</small>
              <Icon name="chevron" size={11} />
            </summary>
            <div className="medialib-view__body">
              <label className="medialib-view__field">
                <span>{t('media.browser.sort')}</span>
                <Select
                  aria-label={t('media.browser.sort')}
                  value={sort}
                  options={sortOptions}
                  onChange={(e) => onSortChange(e.target.value as MediaSortId)}
                />
              </label>
              <div className="medialib-view__field">
                <span>{t('media.browser.view')}</span>
                <div className="medialib-view-toggle" role="group" aria-label={t('media.browser.view')}>
                  <button
                    type="button"
                    aria-pressed={view === 'grid'}
                    aria-label={t('media.browser.viewGrid')}
                    onClick={() => onViewChange('grid')}
                  >
                    <Icon name="widgets" size={14} />
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'list'}
                    aria-label={t('media.browser.viewList')}
                    onClick={() => onViewChange('list')}
                  >
                    <Icon name="note" size={14} />
                  </button>
                </div>
              </div>
            </div>
          </details>
          <Button variant="primary" leftIcon={<Icon name="plus" size={14} />} onClick={onAdd}>
            {t('media.browser.add')}
          </Button>
        </div>
      </header>

      {chips.length > 1 && (
        <div className="medialib-chips" role="group" aria-label={t('media.browser.filter')}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="medialib-chip"
              aria-pressed={activeChip === chip.id}
              onClick={() => onChipChange(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="medialib-browser__body">
        {entries.length === 0 ? (
          empty ?? <div className="medialib-empty"><span>{t('media.browser.noMatch')}</span></div>
        ) : entries.length === 1 && view === 'grid' ? (
          // A single card in a pane sized for a library is a void, not a layout —
          // 284x602 of it at maximized. The surplus goes to the same title.
          // List view already spans the pane, so it keeps its row.
          <div className="medialib-spotlight-wrap">
            <MediaSpotlightCard
              entry={entries[0]}
              variant={variant}
              active={entries[0].id === selectedId
                || entries[0].items.some((i) => i.id === currentId)}
              onOpen={() => onActivate(entries[0])}
              onMenu={(anchor) => onMenu(entries[0], anchor)}
            />
          </div>
        ) : (
          <VirtualGrid
            items={entries}
            className="medialib-grid"
            minColWidth={view === 'list' ? 420 : CARD_METRICS[variant].minColWidth}
            // List rows are meant to span the pane, so they get no cap and stay on
            // the plain auto-fill path. Cards do: a shelf holding fewer titles than
            // it has tracks grows them into the surplus instead of leaving a void.
            maxColWidth={view === 'list' ? undefined : CARD_METRICS[variant].maxColWidth}
            gap={GRID_GAP}
            // A row's height is its own, not a function of the pane: the list
            // path is uncapped, so the ratio-derived height grew with the pane
            // and made each "row" a 945px poster. Grid keeps the callback,
            // because an aspect-ratio card genuinely does depend on its column.
            rowHeight={view === 'list' ? LIST_ROW_HEIGHT : cardRowHeight(variant, GRID_GAP)}
            getKey={(entry) => entry.id}
            renderItem={(entry) => (
              <MediaPosterCard
                variant={variant}
                layout={view === 'list' ? 'row' : 'card'}
                artworkId={entry.artworkItem.id}
                title={entry.title}
                subtitle={[
                  t(`media.category.${entry.category}`),
                  entry.year ? String(entry.year) : null,
                ].filter(Boolean).join(' · ')}
                badge={entry.grouping !== 'none'
                  ? `${entry.watchedCount} / ${entry.episodeCount}`
                  : undefined}
                durationSec={entry.grouping === 'none' ? entry.primary.durationSec : undefined}
                progress={entry.progress}
                status={mediaSubtitleStatus({
                  languages: entry.subtitleLanguages,
                  hasJapanese: entry.hasJapaneseSubtitles,
                  // `idle` means a search actually ran and found nothing, which
                  // is a different statement from having never looked.
                  search: entry.subtitlesChecked ? 'idle' : undefined,
                  metadataNeedsReview: entry.metadataNeedsReview,
                })}
                active={entry.id === selectedId || entry.items.some((i) => i.id === currentId)}
                onOpen={() => onActivate(entry)}
                onMenu={(anchor) => onMenu(entry, anchor)}
              />
            )}
          />
        )}
      </div>
    </section>
  );
}
