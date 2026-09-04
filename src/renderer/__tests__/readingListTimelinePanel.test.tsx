// @vitest-environment jsdom
/**
 * P5 §5.12's panel, on the real component.
 *
 * `readingListTimeline.test.ts` proves the calendar. What only this can prove is
 * the three things the core cannot see: that a day the user can actually PRESS
 * exists and names itself, that the year picker changes what is drawn, and that
 * a book named inside a day goes somewhere real rather than sitting in a card
 * that swallows the click (§11.1).
 *
 * Every fixture timestamp except one is mid-day UTC, so no plausible offset
 * moves it off its date and the assertions hold in any timezone this suite runs
 * in. The exception is the zone test itself, which stubs `getTimezoneOffset` —
 * because the fact it is asserting is precisely the one a mid-day fixture cannot
 * see, and a version written against the real clock passes vacuously on a UTC
 * build box with the offset deleted. That was measured: the first pass of this
 * file scored a dropped `offsetMinutes` as GREEN.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingTimeline from '../components/reading/ReadingTimeline';
import type {
  ReadingList,
  ReadingListsDocument,
  ReadingWorkRef,
} from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

let host: HTMLDivElement;
let root: Root;
let opened: LibraryItem[];
let sought: string[];
let mounted = false;

const MAR_4 = Date.UTC(2026, 2, 4, 12, 0, 0);
const JUL_9_2025 = Date.UTC(2025, 6, 9, 12, 0, 0);
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

const ITEM: LibraryItem = {
  id: 'item-1',
  title: 'Kino no Tabi',
  type: 'book',
  addedAt: 1,
} as unknown as LibraryItem;

function work(id: string, titleRaw: string, boundItemIds: string[] = []): ReadingWorkRef {
  return { id, titleRaw, boundItemIds, bindConfidence: 0 };
}

function list(id: string, entries: ReadingList['entries']): ReadingList {
  return {
    id,
    name: `List ${id}`,
    kind: 'pool',
    createdAt: 1,
    updatedAt: 1,
    entries,
    imports: [],
  };
}

function finished(id: string, workId: string, at: number): ReadingList['entries'][number] {
  return { id, workId, order: 0, addedAt: 1, state: 'finished', finishedAt: at };
}

/** A second list, on a different day, so scoping has something to exclude. */
const MAY_20 = Date.UTC(2026, 4, 20, 12, 0, 0);

const DOC: ReadingListsDocument = {
  schemaVersion: 1,
  revision: 1,
  works: [
    work('w1', 'Kino no Tabi', ['item-1']),
    work('w2', 'Unbound Book'),
    work('w3', 'Other List Book'),
  ],
  lists: [
    list('l1', [finished('e1', 'w1', MAR_4), finished('e2', 'w2', JUL_9_2025)]),
    list('l2', [finished('e3', 'w3', MAY_20)]),
  ],
};

/**
 * A FRESH root each time, not `root.render` twice.
 *
 * Re-rendering the same root keeps the component's `openDay`, so a second mount
 * in one test arrives with a day already expanded and the click that is supposed
 * to open it TOGGLES IT SHUT — which reads exactly like the panel failing to
 * render its rows. That confound cost a run here; it is the same one the
 * `ReadingListsView` suite records for its own `render()`.
 */
async function mount(document: ReadingListsDocument | null, listId: string | null = null) {
  if (mounted) {
    act(() => root.unmount());
    host.remove();
    host = window.document.createElement('div');
    window.document.body.appendChild(host);
    root = createRoot(host);
  }
  mounted = true;
  await act(async () => {
    root.render(
      <ReadingTimeline
        document={document}
        items={[ITEM]}
        listId={listId}
        now={NOW}
        onOpenBook={(item) => opened.push(item)}
        onFindWork={(title) => sought.push(title)}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function liveDays(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('button.rlt__day--live')];
}

function yearSelect(): HTMLSelectElement | null {
  return host.querySelector<HTMLSelectElement>('.rlt__year-select');
}

async function click(node: Element | null | undefined) {
  expect(node).toBeTruthy();
  await act(async () => {
    (node as HTMLElement).click();
    await Promise.resolve();
  });
}

async function pickYear(value: string) {
  const select = yearSelect();
  expect(select).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, value);
    select?.dispatchEvent(new window.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  opened = [];
  sought = [];
  mounted = false;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('ReadingTimeline panel — P5 §5.12', () => {
  it('draws exactly one pressable day per finish for the year on screen', async () => {
    await mount(DOC);
    const days = liveDays();
    expect(days.map((day) => day.dataset.day)).toEqual(['2026-03-04', '2026-05-20']);
    // The empty days are not tab stops — 365 of them between the picker and the
    // next control is §11.4's keyboard row failing on this panel alone.
    expect(host.querySelectorAll('span.rlt__day').length).toBeGreaterThan(300);
    expect(host.querySelectorAll('button.rlt__day').length).toBe(2);
    // And it says what it is, rather than being a coloured square with no name.
    expect(days[0].getAttribute('aria-label')).toContain('2026');
    expect(days[0].getAttribute('aria-label')).toContain('1');
  });

  it('the year picker changes what is drawn', async () => {
    await mount(DOC);
    expect(liveDays().map((d) => d.dataset.day)).toEqual(['2026-03-04', '2026-05-20']);
    await pickYear('2025');
    // A picker that re-labels the header but leaves the grid alone would pass a
    // header assertion and fail this one.
    expect(liveDays().map((d) => d.dataset.day)).toEqual(['2025-07-09']);
  });

  it('a book inside a day opens through the seam, bound and unbound both', async () => {
    await mount(DOC);
    await click(liveDays()[0]);
    await click(host.querySelector('.rlt__finish'));
    expect(opened.map((item) => item.id)).toEqual(['item-1']);

    await pickYear('2025');
    await click(liveDays()[0]);
    await click(host.querySelector('.rlt__finish'));
    // The unbound half of §11.1: acquisition, with the title — not a dead card.
    expect(sought).toEqual(['Unbound Book']);
  });

  it('a day panel toggles shut on a second press', async () => {
    await mount(DOC);
    await click(liveDays()[0]);
    expect(host.querySelector('.rlt__day-panel')).not.toBeNull();
    expect(liveDays()[0].getAttribute('aria-expanded')).toBe('true');
    await click(liveDays()[0]);
    expect(host.querySelector('.rlt__day-panel')).toBeNull();
  });

  it('scoped to one list, and says so by leaving the list name off each row', async () => {
    await mount(DOC, 'l1');
    // The scope has to reach the CORE, not just the chip: `l2`'s 20 May finish
    // must be absent from the grid. A panel that passed `listId` to the label
    // and `null` to `readingTimeline` would still hide the chip and still draw
    // the other list's day.
    expect(liveDays().map((d) => d.dataset.day)).toEqual(['2026-03-04']);
    await click(liveDays()[0]);
    expect(host.querySelector('.rlt__finish-list')).toBeNull();
    // The unscoped panel does carry it, because there a title alone cannot say
    // which list the finish came from.
    await mount(DOC, null);
    await click(liveDays()[0]);
    expect(host.querySelector('.rlt__finish-list')?.textContent).toBe('List l1');
  });

  it('places a finish by the USER’s calendar day, not by UTC', async () => {
    // 2026-03-03T20:00Z is already the 4th in UTC+9 and still the 3rd in UTC-5.
    // Stubbing `getTimezoneOffset` rather than the machine's TZ is what makes
    // this deterministic: on a UTC build box the two answers coincide and an
    // assertion written against the real clock would pass with the offset
    // deleted. The sign is Date's own — west of UTC is POSITIVE there.
    const doc: ReadingListsDocument = {
      schemaVersion: 1,
      revision: 1,
      works: [work('w1', 'Kino no Tabi', ['item-1'])],
      lists: [list('l1', [finished('e1', 'w1', Date.UTC(2026, 2, 3, 20, 0, 0))])],
    };
    const offset = vi.spyOn(window.Date.prototype, 'getTimezoneOffset');

    offset.mockReturnValue(-540); // UTC+9, Tokyo
    await mount(doc);
    expect(liveDays().map((d) => d.dataset.day)).toEqual(['2026-03-04']);

    offset.mockReturnValue(300); // UTC-5, New York
    await mount(doc);
    expect(liveDays().map((d) => d.dataset.day)).toEqual(['2026-03-03']);

    offset.mockRestore();
  });

  it('says nothing has been finished rather than drawing a blank grid', async () => {
    await mount({ schemaVersion: 1, revision: 1, works: [], lists: [] });
    expect(host.querySelector('.rlt__empty')).not.toBeNull();
    expect(liveDays()).toEqual([]);
    // A null document is the LOADING case and belongs to the host, so this
    // renders nothing at all rather than an empty state that would be wrong.
    await mount(null);
    expect(host.querySelector('.rlt')).toBeNull();
  });

  it('opens on the most recent year with something in it, not on the calendar year', async () => {
    const onlyOld: ReadingListsDocument = {
      ...DOC,
      lists: [list('l1', [finished('e2', 'w2', JUL_9_2025)])],
    };
    await mount(onlyOld);
    // `now` is mid-2026 and 2026 is empty. Landing there would show the user a
    // blank year and make them find the picker to see their own history.
    expect(liveDays().map((d) => d.dataset.day)).toEqual(['2025-07-09']);
    // The empty current year is still OFFERED, so "nothing yet this year" is
    // reachable rather than unaskable.
    expect([...(yearSelect()?.options ?? [])].map((o) => o.value)).toEqual(['2026', '2025']);
  });
});
