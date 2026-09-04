/**
 * Reading Lists §11.2 — four widgets, registered in the existing gallery.
 *
 * The section is explicit that these must NOT be a parallel widget system: they
 * are `WidgetDef`s like any other, so they can be pinned, resized, hidden and
 * restored with everything else, and they are i18n'd by construction through
 * `titleKey`/`descKey`.
 *
 * Three rules the section states and this file keeps:
 *
 *   · **Each picks its list in its own settings.** A widget with no list chosen
 *     falls back to the most recently changed one, which is what a person who
 *     just pasted a message expects to see. The picker is a plain `<select>`
 *     inside the widget, exactly as `musicWidgetSettings` does it.
 *   · **A real empty state, never a blank box.** No lists at all is an
 *     invitation to make one; a list with nothing left to read says so.
 *   · **It survives its list being deleted.** The chosen id simply stops
 *     matching, and the widget falls back rather than throwing — a widget that
 *     crashes takes the desktop's whole widget layer with it.
 *
 * Navigation goes through the app's existing `os:open` bus with a Reading
 * workspace route, which is the same path the command palette and Blanc use.
 * A widget that opened books its own way would disagree with the library about
 * which window the reader is in, which §11.1 forbids by name.
 */
import { useCallback, useMemo } from 'react';
import Icon from '../components/Icons';
import { useT } from '../i18n';
import { useReadingListsDocument } from '../readingListsDocument';
import { coverFallbackImage, coverUrlFor } from '../utils/coverArt';
import { useLibraryItems } from './hooks';
import { readSetting, type WidgetProps } from './types';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  type ReadingWorkspaceRoute,
} from '../../shared/readingWorkspace';
import {
  nextUpReadingRow,
  readingChallengePace,
  recentReadingFinishes,
  sortReadingListSummaries,
  summarizeReadingList,
  summarizeReadingLists,
  type ReadingListSummary,
} from '../../shared/readingListViews';
import type { ReadingList, ReadingListsDocument } from '../../shared/readingLists';
import './readingLists.css';

const LIST_SETTING = 'listId';

function openReadingRoute(route: Omit<ReadingWorkspaceRoute, 'version'>): void {
  window.dispatchEvent(
    new CustomEvent('os:open', {
      detail: { version: READING_WORKSPACE_SCHEMA_VERSION, ...route },
    }),
  );
}

function openList(listId: string): void {
  openReadingRoute({ section: 'lists', intent: 'browse', listId });
}

function openItem(itemId: string): void {
  openReadingRoute({ section: 'library', intent: 'open', itemId });
}

/**
 * The list a widget instance is showing.
 *
 * A chosen id that no longer matches falls through to the fallback rather than
 * returning `undefined`: §11.2 requires the widget to survive its list being
 * deleted, and "shows the next list" is a better answer than "shows nothing"
 * for a surface the user cannot see an error in.
 */
function useChosenList(
  document: ReadingListsDocument | null,
  settings: Record<string, unknown>,
): { list: ReadingList | null; summaries: ReadingListSummary[] } {
  return useMemo(() => {
    if (!document) return { list: null, summaries: [] };
    const summaries = sortReadingListSummaries(summarizeReadingLists(document), 'recent');
    const chosen = readSetting(settings, LIST_SETTING, '');
    const byId = document.lists.find((candidate) => candidate.id === chosen);
    const fallbackId = summaries.find((summary) => !summary.archived)?.listId;
    const list =
      byId ?? document.lists.find((candidate) => candidate.id === fallbackId) ?? null;
    return { list, summaries };
  }, [document, settings]);
}

function ListPicker({
  summaries,
  value,
  onChange,
}: {
  summaries: ReadingListSummary[];
  value: string;
  onChange: (listId: string) => void;
}) {
  const { t } = useT();
  if (summaries.length < 2) return null;
  return (
    <select
      className="wgt-select"
      aria-label={t('widgets.readingLists.pick')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {summaries.map((summary) => (
        <option key={summary.listId} value={summary.listId}>
          {summary.name}
        </option>
      ))}
    </select>
  );
}

/** The one empty state every widget here shows before any list exists. */
function NoLists() {
  const { t } = useT();
  return (
    <div className="wgt wgt-rl">
      <p className="wgt-rl-empty">{t('widgets.readingLists.noLists')}</p>
      <button
        type="button"
        className="wgt-btn"
        onClick={() => openReadingRoute({ section: 'lists', intent: 'browse' })}
      >
        {t('widgets.readingLists.makeOne')}
      </button>
    </div>
  );
}

function Loading() {
  const { t } = useT();
  return (
    <div className="wgt wgt-rl" aria-busy="true">
      <p className="wgt-rl-empty">{t('widgets.readingLists.loading')}</p>
    </div>
  );
}

function Unreadable() {
  const { t } = useT();
  return (
    <div className="wgt wgt-rl" role="alert">
      <p className="wgt-rl-empty">{t('widgets.readingLists.unreadable')}</p>
    </div>
  );
}

function Cover({ itemId, title }: { itemId: string | null; title: string }) {
  const items = useLibraryItems();
  const item = itemId ? items.find((candidate) => candidate.id === itemId) : undefined;
  const url = coverUrlFor(item?.coverPath, item?.id);
  return (
    <span
      className="wgt-rl-cover"
      aria-hidden="true"
      style={{ backgroundImage: url ? `url("${url}")` : coverFallbackImage(title) }}
    />
  );
}

/* ------------------------------------------------------------ 1. progress -- */

export function ReadingListProgressWidget({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const { document, failure } = useReadingListsDocument();
  const { list, summaries } = useChosenList(document, settings);
  const choose = useCallback(
    (listId: string) => setSettings({ [LIST_SETTING]: listId }),
    [setSettings],
  );

  if (failure) return <Unreadable />;
  if (!document) return <Loading />;
  if (!list) return <NoLists />;

  const summary = summarizeReadingList(list, document.works);
  const next = nextUpReadingRow(list, document.works);

  return (
    <div className="wgt wgt-rl">
      <div className="wgt-rl-head">
        <button type="button" className="wgt-rl-link" onClick={() => openList(list.id)}>
          {list.name}
        </button>
        <ListPicker summaries={summaries} value={list.id} onChange={choose} />
      </div>
      <div className="wgt-rl-mosaic" aria-hidden="true">
        {(summary.coverItemIds.length ? summary.coverItemIds : [list.id]).map((id) => (
          <Cover key={id} itemId={summary.coverItemIds.includes(id) ? id : null} title={list.name} />
        ))}
      </div>
      <p className="wgt-rl-count">
        {t('readingLists.view.progress', {
          finished: summary.finished,
          counted: summary.counted,
        })}
      </p>
      <div className="wgt-progress">
        <div className="wgt-progress-fill" style={{ width: `${Math.round(summary.progress * 100)}%` }} />
      </div>
      {next ? (
        <button
          type="button"
          className="wgt-rl-next"
          onClick={() => (next.itemId ? openItem(next.itemId) : openList(list.id))}
        >
          <span className="wgt-rl-next-label">{t('widgets.readingLists.nextUp')}</span>
          <span className="wgt-rl-next-title">{next.title}</span>
        </button>
      ) : (
        <p className="wgt-rl-empty">{t('widgets.readingLists.allDone')}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- 2. next up -- */

/**
 * Deliberately dumb, per §11.2: a cover, a title, and a Read button, with the
 * whole widget as the click target. It is a "start reading" button with a
 * picture, and adding a second control to it would make it a small list view.
 */
export function ReadingNextUpWidget({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const { document, failure } = useReadingListsDocument();
  const { list, summaries } = useChosenList(document, settings);
  const choose = useCallback(
    (listId: string) => setSettings({ [LIST_SETTING]: listId }),
    [setSettings],
  );

  if (failure) return <Unreadable />;
  if (!document) return <Loading />;
  if (!list) return <NoLists />;

  const next = nextUpReadingRow(list, document.works);
  if (!next) {
    return (
      <div className="wgt wgt-rl">
        <div className="wgt-rl-head">
          <span className="wgt-rl-link">{list.name}</span>
          <ListPicker summaries={summaries} value={list.id} onChange={choose} />
        </div>
        <p className="wgt-rl-empty">{t('widgets.readingLists.allDone')}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="wgt wgt-rl wgt-rl-oneshot"
      // An unbound row leads to the list, where §11.1's acquisition path is —
      // never to a button that does nothing because there is no file yet.
      onClick={() => (next.itemId ? openItem(next.itemId) : openList(list.id))}
    >
      <Cover itemId={next.itemId} title={next.title} />
      <span className="wgt-rl-next-title">{next.title}</span>
      <span className="wgt-btn wgt-rl-read">
        <Icon name={next.itemId ? 'novels' : 'search'} size={13} />
        {next.itemId ? t('widgets.readingLists.read') : t('readingLists.view.rowFind')}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------- 3. challenge -- */

export function ReadingChallengePaceWidget({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  const { document, failure } = useReadingListsDocument();
  const { summaries } = useChosenList(document, settings);
  const choose = useCallback(
    (listId: string) => setSettings({ [LIST_SETTING]: listId }),
    [setSettings],
  );

  // Only a list with a target date can carry a pace, so the picker offers those
  // and nothing else. Offering every list would produce a widget whose most
  // likely state is "this list has no target".
  const challenges = useMemo(() => {
    if (!document) return [];
    return document.lists.filter((list) => list.target?.by !== undefined);
  }, [document]);

  if (failure) return <Unreadable />;
  if (!document) return <Loading />;
  if (challenges.length === 0) {
    return (
      <div className="wgt wgt-rl">
        <p className="wgt-rl-empty">{t('widgets.readingLists.noChallenge')}</p>
      </div>
    );
  }

  const chosen = readSetting(settings, LIST_SETTING, '');
  const list = challenges.find((candidate) => candidate.id === chosen) ?? challenges[0];
  const summary = summarizeReadingList(list, document.works);
  const pace = readingChallengePace(summary, list.target, Date.now(), list.createdAt);

  return (
    <div className="wgt wgt-rl">
      <div className="wgt-rl-head">
        <button type="button" className="wgt-rl-link" onClick={() => openList(list.id)}>
          {list.name}
        </button>
        <ListPicker
          summaries={summaries.filter((entry) =>
            challenges.some((candidate) => candidate.id === entry.listId),
          )}
          value={list.id}
          onChange={choose}
        />
      </div>
      {pace ? (
        <>
          <p className="wgt-rl-count">
            {t('widgets.readingLists.remaining', {
              books: pace.remaining,
              days: Math.max(0, pace.daysLeft),
            })}
          </p>
          {/* Ahead and behind are the same sentence with a different number.
              §11.2: do not render "behind" as a red alarm. */}
          <p className="wgt-rl-pace">
            {pace.daysLeft <= 0
              ? t('widgets.readingLists.paceOver')
              : pace.aheadBy >= 0
                ? t('widgets.readingLists.paceAhead', { count: pace.aheadBy })
                : t('widgets.readingLists.paceBehind', { count: -pace.aheadBy })}
          </p>
        </>
      ) : (
        <p className="wgt-rl-empty">{t('widgets.readingLists.noTarget')}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ 4. finished -- */

export function ReadingRecentlyFinishedWidget({ size }: WidgetProps) {
  const { t } = useT();
  const { document, failure } = useReadingListsDocument();

  // One row is ~30px inside `.widget-body`'s padding and the frame's title bar.
  // Derived rather than fixed so a resized widget shows what it can hold.
  const limit = Math.max(1, Math.floor((size.h - 56) / 30));
  const finishes = useMemo(
    () => (document ? recentReadingFinishes(document, limit) : []),
    [document, limit],
  );

  if (failure) return <Unreadable />;
  if (!document) return <Loading />;
  if (finishes.length === 0) {
    return (
      <div className="wgt wgt-rl">
        <p className="wgt-rl-empty">{t('widgets.readingLists.noFinishes')}</p>
      </div>
    );
  }

  return (
    <ul className="wgt wgt-rl wgt-rl-finishes">
      {finishes.map((record) => (
        <li key={record.entryId}>
          <button
            type="button"
            className="wgt-rl-finish"
            onClick={() => (record.itemId ? openItem(record.itemId) : openList(record.listId))}
          >
            <span className="wgt-rl-finish-title">{record.title}</span>
            <span className="wgt-rl-finish-date">
              {new Date(record.finishedAt).toLocaleDateString()}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
