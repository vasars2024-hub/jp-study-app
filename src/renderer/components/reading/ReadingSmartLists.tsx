/**
 * P5 §7's surface — the three presets, answered live.
 *
 * A component rather than more of `ReadingListsView.tsx` (102 KB): §10.2's rule
 * about the readers applies to this file too by now, and a panel that derives
 * from the document plus the library is testable on its own in a way a block
 * inside a 2,500-line view is not.
 *
 * It MUTATES NOTHING. A smart list is a question re-asked on every render, so
 * there is no state to write and no undo to offer — which is also why it is a
 * panel on the grid rather than a `kind: 'smart'` row alongside real lists: a
 * card whose contents change under you without an edit would be indistinguishable
 * from a bug in the ones that do not.
 *
 * Every row goes somewhere real (§11.1): bound → the reader, unbound → the
 * acquisition path. Neither branch is a card that swallows the click.
 */

import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { Button } from '../ui';
import type { ReadingListsDocument } from '../../../shared/readingLists';
import {
  READY_TO_READ_DEFAULT_LEVEL,
  SMART_LIST_PRESET_IDS,
  buildSmartListPresetQuery,
  evaluateSmartList,
  lastFinishedAuthor,
  smartListFactsFromItem,
  type SmartListPresetId,
} from '../../../shared/readingListSmartLists';
import type { LibraryItem } from '../../../shared/types';
import './readingSmartLists.css';

const PRESET_KEYS: Record<SmartListPresetId, string> = {
  abandoned: 'readingLists.smart.preset.abandoned',
  'ready-to-read': 'readingLists.smart.preset.readyToRead',
  'author-sweep': 'readingLists.smart.preset.authorSweep',
};

const STATE_KEYS: Record<string, string> = {
  wanted: 'readingLists.entryState.wanted',
  owned: 'readingLists.entryState.owned',
  reading: 'readingLists.entryState.reading',
  finished: 'readingLists.entryState.finished',
  abandoned: 'readingLists.entryState.abandoned',
  skipped: 'readingLists.entryState.skipped',
};

export interface ReadingSmartListsProps {
  document: ReadingListsDocument | null;
  items: readonly LibraryItem[];
  onOpenBook: (item: LibraryItem) => void;
  onFindWork: (title: string) => void;
}

export default function ReadingSmartLists({
  document,
  items,
  onOpenBook,
  onFindWork,
}: ReadingSmartListsProps) {
  const { t, lang } = useT();
  const [preset, setPreset] = useState<SmartListPresetId | null>(null);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const facts = useMemo(() => items.map(smartListFactsFromItem), [items]);

  /**
   * `Date.now()` lives INSIDE the memo, so "untouched 30 days" is fixed for as
   * long as the answer is on screen. Reading the clock per render would let two
   * rows of one result be judged against two different nows.
   */
  const answer = useMemo(() => {
    if (!document || !preset) return null;
    const context = { items: facts, now: Date.now() };
    const query = buildSmartListPresetQuery(preset, document, context);
    if (!query) return { rows: null, query: null };
    return { rows: evaluateSmartList(document, query, context), query };
  }, [document, preset, facts]);

  const sweepAuthor = useMemo(
    () => (document ? lastFinishedAuthor(document) : ''),
    [document],
  );

  // Nothing to ask questions about yet. The grid's own empty state is already
  // teaching the user to paste a message; a second empty panel under it would
  // be noise, and §11.4 asks for real states rather than decorative ones.
  if (!document || document.works.length === 0) return null;

  const hint = (id: SmartListPresetId): string => {
    if (id === 'abandoned') return t('readingLists.smart.hint.abandoned');
    if (id === 'ready-to-read') {
      return t('readingLists.smart.hint.readyToRead', { level: READY_TO_READ_DEFAULT_LEVEL });
    }
    return sweepAuthor
      ? t('readingLists.smart.hint.authorSweep', { author: sweepAuthor })
      : t('readingLists.smart.hint.authorSweepEmpty');
  };

  return (
    <section className="rlsm" data-lang={lang} data-testid="rlv-smart-lists">
      <h3 className="rlsm__title">{t('readingLists.smart.title')}</h3>
      <p className="rlsm__lede">{t('readingLists.smart.lede')}</p>
      <div className="rlsm__presets" role="group" aria-label={t('readingLists.smart.title')}>
        {SMART_LIST_PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="rlsm__chip ui-focusable"
            /*
              `aria-pressed` rather than a radio group: these are three
              independent questions and the panel closes when the open one is
              pressed again, which is toggle behaviour, not selection.
            */
            aria-pressed={preset === id}
            data-active={preset === id}
            title={hint(id)}
            onClick={() => setPreset((current) => (current === id ? null : id))}
          >
            {t(PRESET_KEYS[id])}
          </button>
        ))}
      </div>
      {preset && answer ? (
        <div className="rlsm__answer">
          <p className="rlsm__hint">{hint(preset)}</p>
          {answer.rows === null ? (
            /*
              §7's Author sweep with nothing finished. It says what would fill
              it in rather than showing an empty list, because an empty list
              here reads as "you own nothing by them" — an answer to a question
              that was never asked.
            */
            <p className="rlsm__empty" role="status">
              {t('readingLists.smart.unavailable')}
            </p>
          ) : answer.rows.length === 0 ? (
            <p className="rlsm__empty" role="status">
              {t('readingLists.smart.empty')}
            </p>
          ) : (
            <>
              <p className="rlsm__count" role="status">
                {t('readingLists.smart.count', { count: answer.rows.length })}
              </p>
              <ul
                className="rlsm__rows"
                aria-label={t('readingLists.smart.rowsLabel', { name: t(PRESET_KEYS[preset]) })}
              >
                {answer.rows.map((row) => {
                  const item = row.itemId ? itemsById.get(row.itemId) : undefined;
                  return (
                    <li key={row.workId} className="rlsm__row">
                      <span className="rlsm__row-title">{row.title}</span>
                      <span className="rlsm__row-state">{t(STATE_KEYS[row.state] ?? row.state)}</span>
                      {/*
                        An unmeasured book says so instead of showing nothing.
                        It is IN this result on purpose — `difficultyMax` keeps
                        unrated works rather than dropping them — so the row has
                        to admit the level is unknown, or the band reads as
                        verified for every row in it.
                      */}
                      <span className="rlsm__row-level" data-unrated={row.level == null}>
                        {row.level == null
                          ? t('readingLists.smart.unrated')
                          : t('readingLists.smart.level', { level: row.level })}
                      </span>
                      <Button
                        onClick={() => (item ? onOpenBook(item) : onFindWork(row.title))}
                      >
                        {item
                          ? t('readingLists.view.rowOpen')
                          : t('readingLists.view.rowFind')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
