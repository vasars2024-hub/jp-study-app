/**
 * "Continue reading": the books started and not finished, most recently read
 * first, one click (or Enter) from opening at their saved place.
 *
 * Every fact it shows already lives on the item — `lastReadAt` is written by
 * main with each progress save, `progress.percent` with it — so this is a view,
 * not a store. Titles are study content and are never translated.
 */
import { useMemo } from 'react';
import type { LibraryItem } from '../../../shared/types';
import { continueReadingItems, progressFraction } from '../../utils/libraryShelf';
import { LANG_TAGS, type UiLang as Lang } from '../../../shared/i18n/core';
import './readingEcosystem.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "today" / "yesterday" / "N days ago" for a last-read stamp. */
export function lastReadLabel(at: number, now: number, t: Translate): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (at >= startOfToday.getTime()) return t('read2.library.continue.today');
  const days = Math.max(1, Math.ceil((startOfToday.getTime() - at) / DAY_MS));
  if (days === 1) return t('read2.library.continue.yesterday');
  return t('read2.library.continue.daysAgo', { count: days });
}

export default function ContinueReadingShelf({
  items,
  onOpen,
  t,
  lang,
  now = Date.now(),
}: {
  items: readonly LibraryItem[];
  onOpen: (item: LibraryItem) => void;
  t: Translate;
  lang: Lang;
  now?: number;
}) {
  const shelf = useMemo(() => continueReadingItems(items), [items]);
  const pctFormat = useMemo(
    () => new Intl.NumberFormat(LANG_TAGS[lang], { style: 'percent', maximumFractionDigits: 0 }),
    [lang],
  );
  if (!shelf.length) return null;
  return (
    <section className="lib-continue" aria-label={t('read2.library.continue.title')}>
      <h2 className="lib-continue-head">{t('read2.library.continue.title')}</h2>
      <ul className="lib-continue-row">
        {shelf.map((item) => {
          const fraction = progressFraction(item);
          const when = lastReadLabel(item.lastReadAt ?? now, now, t);
          return (
            <li key={item.id}>
              <button
                type="button"
                className="lib-continue-card"
                data-continue-item={item.id}
                title={t('read2.library.continue.openTitle', { title: item.title })}
                onClick={() => onOpen(item)}
              >
                <span className="lib-continue-title">{item.title}</span>
                <span className="lib-continue-meta muted">
                  {pctFormat.format(fraction)} · {when}
                </span>
                <span
                  className="lib-progress-bar"
                  role="progressbar"
                  aria-label={t('library.table.progress')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(fraction * 100)}
                >
                  <span style={{ width: `${Math.round(fraction * 100)}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The slim bar a list row shows beside its percentage. */
export function LibraryProgressCell({ item, t }: { item: Pick<LibraryItem, 'progress'>; t: Translate }) {
  const pct = Math.round(progressFraction(item) * 100);
  if (pct <= 0) return <span>{t('library.progress.notStarted')}</span>;
  return (
    <span className="lib-list-progress">
      <span className="lib-progress-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span>{`${pct}%`}</span>
    </span>
  );
}
