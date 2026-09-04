/**
 * P5 §5.12's surface — *"Finishes on a calendar, per list. Answers 'what did I
 * read this year' in one screen."*
 *
 * A component rather than more of `ReadingListsView.tsx` (105 KB), for the same
 * reason §7's panel is one: a 365-cell grid with a year picker and a day
 * expander is testable on its own in a way a block inside a 2,700-line view is
 * not, and §10.2's rule about not growing the big files applies here too.
 *
 * It MUTATES NOTHING. A year is a reading of history; there is no state to write
 * and no undo to offer. What it does have is §11.1's contract — every book named
 * in an expanded day goes somewhere real, the bound one to the reader and the
 * unbound one to acquisition.
 *
 * ── Why empty days are not buttons ──────────────────────────────────────────
 *
 * A year is 365 cells and all but a handful are empty. Making them all focusable
 * would put 365 tab stops between the year picker and the next control, which is
 * §11.4's keyboard row failing on the most-used surface in the panel. An empty
 * cell is a `<span>` with no name; a day with finishes is a real button that
 * says its date and its count.
 */

import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import type { ReadingListsDocument } from '../../../shared/readingLists';
import { readingTimeline } from '../../../shared/readingListTimeline';
import type { LibraryItem } from '../../../shared/types';
import './readingTimeline.css';

export interface ReadingTimelineProps {
  document: ReadingListsDocument | null;
  items: readonly LibraryItem[];
  /** One list, or every list when `null`. §5.12 asks for both. */
  listId?: string | null;
  onOpenBook: (item: LibraryItem) => void;
  onFindWork: (title: string) => void;
  /** Injectable for tests. The real clock only decides which year opens. */
  now?: number;
}

/**
 * Four steps and no more. A ramp with ten stops on a data set whose peak is
 * usually 1 or 2 renders as one flat colour and reads as broken; four steps
 * against the year's own peak always uses its whole range.
 */
function heatStep(count: number, peak: number): number {
  if (count <= 0) return 0;
  if (peak <= 1) return 4;
  return Math.min(4, Math.max(1, Math.ceil((count / peak) * 4)));
}

/** Month name in the UI language, never the OS one (see `formatProjectionDay`). */
function monthName(year: number, month: number, lang: string): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    LANG_TAGS[lang as keyof typeof LANG_TAGS] ?? 'en',
    { month: 'long', timeZone: 'UTC' },
  );
}

function dayLabel(key: string, lang: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
    LANG_TAGS[lang as keyof typeof LANG_TAGS] ?? 'en',
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' },
  );
}

export default function ReadingTimeline({
  document,
  items,
  listId = null,
  onOpenBook,
  onFindWork,
  now,
}: ReadingTimelineProps) {
  const { t, lang } = useT();
  const [year, setYear] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  /**
   * The zone is read ONCE and passed in, rather than the core reading it: a
   * calendar computed with `Date` getters inside a pure function gives a
   * different answer on a CI box than on the user's machine.
   */
  const offsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);
  const thisYear = useMemo(() => new Date(now ?? Date.now()).getFullYear(), [now]);

  const timeline = useMemo(
    () =>
      document
        ? readingTimeline(document, year ?? thisYear, { listId, offsetMinutes })
        : null,
    [document, year, thisYear, listId, offsetMinutes],
  );

  /**
   * Open on the most recent year that HAS something, not on the calendar year.
   * A user who read nothing since January would otherwise land on an empty grid
   * and have to discover the picker to see their own history.
   */
  useEffect(() => {
    if (year != null || !timeline) return;
    const years = timeline.years;
    if (years.length === 0) return;
    const latest = years[years.length - 1];
    if (latest !== thisYear && !years.includes(thisYear)) setYear(latest);
  }, [timeline, year, thisYear]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  if (!timeline) return null;
  // Nothing has ever been finished. Not an error, and not a blank panel either:
  // §11.4 wants empty to be a state that says what would fill it.
  if (timeline.years.length === 0) {
    return (
      <section className="rlt" aria-labelledby="rlt-title">
        <h3 className="rlt__title" id="rlt-title">
          {t('readingLists.timeline.title')}
        </h3>
        <p className="rlt__empty">{t('readingLists.timeline.empty')}</p>
      </section>
    );
  }

  const shown = timeline.year;
  const open = openDay
    ? timeline.months.flatMap((month) => month.days).find((day) => day.key === openDay)
    : null;

  return (
    <section className="rlt" aria-labelledby="rlt-title">
      <header className="rlt__head">
        <h3 className="rlt__title" id="rlt-title">
          {t('readingLists.timeline.title')}
        </h3>
        <p className="rlt__count">
          {/* `String(shown)` and not the number: `interpolate` runs every NUMBER
              through `Intl.NumberFormat`, which renders 2026 as "2,026". */}
          {t('readingLists.timeline.count', { count: timeline.total, year: String(shown) })}
        </p>
        {/*
          Honest state: the year on screen is not the whole history, and a panel
          that shows 3 books without mentioning the other 40 reads as a data loss.
        */}
        {timeline.elsewhere > 0 ? (
          <p className="rlt__elsewhere">
            {t('readingLists.timeline.elsewhere', { count: timeline.elsewhere })}
          </p>
        ) : null}
        <label className="rlt__year">
          <span className="rlt__year-label">{t('readingLists.timeline.year')}</span>
          <select
            className="rlt__year-select ui-focusable"
            value={String(shown)}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setOpenDay(null);
            }}
          >
            {/* The current year is offered even when it is empty, so "nothing
                yet this year" is answerable rather than unreachable. */}
            {[...new Set([...timeline.years, thisYear])]
              .sort((a, b) => b - a)
              .map((candidate) => (
                <option key={candidate} value={String(candidate)}>
                  {candidate}
                </option>
              ))}
          </select>
        </label>
      </header>

      <ol className="rlt__months">
        {timeline.months.map((month) => (
          <li className="rlt__month" key={month.month}>
            <span className="rlt__month-name">{monthName(shown, month.month, lang)}</span>
            <div className="rlt__days">
              {month.days.map((cell) =>
                cell.finishes.length === 0 ? (
                  <span
                    className="rlt__day"
                    key={cell.key}
                    data-heat="0"
                    aria-hidden="true"
                  />
                ) : (
                  <button
                    type="button"
                    className="rlt__day rlt__day--live ui-focusable"
                    key={cell.key}
                    data-heat={heatStep(cell.finishes.length, timeline.peak)}
                    data-day={cell.key}
                    aria-expanded={openDay === cell.key}
                    aria-label={t('readingLists.timeline.dayLabel', {
                      date: dayLabel(cell.key, lang),
                      count: cell.finishes.length,
                    })}
                    onClick={() => setOpenDay((current) => (current === cell.key ? null : cell.key))}
                  />
                ),
              )}
            </div>
          </li>
        ))}
      </ol>

      {open ? (
        <div className="rlt__day-panel">
          <p className="rlt__day-head">{dayLabel(open.key, lang)}</p>
          <ul className="rlt__day-list">
            {open.finishes.map((finish) => {
              const item = finish.itemId ? itemsById.get(finish.itemId) : undefined;
              return (
                <li key={finish.entryId}>
                  {/*
                    §11.1: bound goes to the reader, unbound to the acquisition
                    path. A row that only shows a title is the card that swallows
                    the click, which §11.1 exists to forbid.
                  */}
                  <button
                    type="button"
                    className="rlt__finish ui-focusable"
                    onClick={() => (item ? onOpenBook(item) : onFindWork(finish.title))}
                  >
                    <span className="rlt__finish-title">{finish.title}</span>
                    {listId == null ? (
                      <span className="rlt__finish-list">{finish.listName}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
