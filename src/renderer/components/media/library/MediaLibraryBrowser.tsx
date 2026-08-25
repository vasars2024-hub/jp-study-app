/**
 * The centre pane: page heading, sort/filter/view toolbar, type chips, and the
 * virtualized card grid.
 *
 * The pane itself never scrolls — the grid does. That is what keeps the heading
 * and the chips in place while a 6,000-episode library moves under them, and it
 * is the reason the old `height: 60vh; max-height: 640px` grid box is gone.
 */

import { useMemo } from 'react';
import VirtualGrid from '../../VirtualGrid';
import { Button, Select } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import MediaPosterCard, { CARD_METRICS, cardRowHeight, type MediaCardVariant } from './MediaPosterCard';
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
          <Select
            aria-label={t('media.browser.sort')}
            value={sort}
            options={sortOptions}
            onChange={(e) => onSortChange(e.target.value as MediaSortId)}
          />
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
            rowHeight={cardRowHeight(variant, GRID_GAP)}
            getKey={(entry) => entry.id}
            renderItem={(entry) => (
              <MediaPosterCard
                variant={variant}
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
