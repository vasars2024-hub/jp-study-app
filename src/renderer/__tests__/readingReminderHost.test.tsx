// @vitest-environment jsdom
/**
 * §11.3's notification, and the clause that makes it more than a toast: every
 * answer it offers has to be a real one.
 *
 * So the assertions are about EFFECTS, not about the card's markup. Mark
 * finished must write `finished`; Move to abandoned must write `abandoned`;
 * Never again must reach main's `silenced` list rather than only closing the
 * card. A button that merely dismisses is exactly the "dead control" this
 * repo's honesty rules classify as a failure, and it is the cheapest thing to
 * ship by accident here.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingReminderHost from '../components/reading/ReadingReminderHost';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  addReadingListEntry,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../../shared/readingListMutations';
import { emptyReadingListsDocument, type ReadingListsDocument } from '../../shared/readingLists';
import type { ReadingReminder } from '../../shared/readingListReminders';

let host: HTMLDivElement;
let root: Root;
let openings: unknown[] = [];
let silenced: string[] = [];
let written: ReadingListsDocument[] = [];
let push: ((reminder: ReadingReminder) => void) | null = null;
let ids: { listId: string; entryId: string };

/** One list, one entry being read. The ids are what the reminder points at. */
function seeded(): ReadingListsDocument {
  const created = createReadingList(
    emptyReadingListsDocument(),
    { name: 'Summer' },
    createReadingListsMutationContext(1_700_000_000_000),
  );
  const added = addReadingListEntry(
    created.document,
    created.listId,
    { title: '雪国', state: 'reading' },
    createReadingListsMutationContext(1_700_000_000_001),
  );
  ids = { listId: created.listId, entryId: added.entryId ?? '' };
  return sealReadingListsDocument(added.document);
}

function installBridge(document: ReadingListsDocument) {
  (window as unknown as { api?: unknown }).api = {
    readingListsLoad: async () => ({
      ok: true,
      snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
    }),
    // Positional, exactly as `preload.ts` exposes it — an object-shaped stub
    // records `undefined` and every effect assertion below reads as a pass.
    readingListsWrite: async (_baseRevision: number, next: ReadingListsDocument) => {
      written.push(next);
      const stored = { ...next, revision: next.revision + 1 };
      return {
        ok: true,
        applied: true,
        snapshot: { document: stored, health: { state: 'ok', lostRevisions: 0 } },
      };
    },
    onReadingListsChanged: () => () => undefined,
    readingRemindersSilence: async (kind: string) => {
      silenced.push(kind);
      return null;
    },
    onReadingReminder: (cb: (reminder: ReadingReminder) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    },
  };
}

const STALLED: ReadingReminder = {
  kind: 'stalled-book',
  subjectId: 'e',
  listId: '',
  entryId: '',
  itemId: 'it1',
  titleKey: 'readingLists.reminder.stalled.title',
  bodyKey: 'readingLists.reminder.stalled.body',
  params: { title: '雪国', days: 30, percent: 42 },
  actions: ['continue', 'finish', 'abandon', 'silence'],
};

const recordOpen = (event: Event) => {
  openings.push((event as CustomEvent).detail);
};

async function mount(document = seeded()) {
  installBridge(document);
  // The client caches the snapshot the host's writes are applied against.
  const api = (window as unknown as { api: { readingListsLoad: () => Promise<unknown> } }).api;
  await act(async () => {
    root.render(<ReadingReminderHost />);
    await Promise.resolve();
  });
  await act(async () => {
    const { loadReadingLists } = await import('../readingListsClient');
    await loadReadingLists();
    void api;
  });
}

async function deliver(patch: Partial<ReadingReminder> = {}) {
  await act(async () => {
    push?.({ ...STALLED, listId: ids.listId, entryId: ids.entryId, ...patch });
    await Promise.resolve();
  });
}

function press(label: string): void {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.rl-reminder-btn')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`no button labelled ${label}`);
  button.click();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  openings = [];
  silenced = [];
  written = [];
  push = null;
  window.addEventListener('os:open', recordOpen);
  resetReadingListsClientForTesting();
});

afterEach(() => {
  window.removeEventListener('os:open', recordOpen);
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('the reminder card', () => {
  it('renders nothing until main pushes one', async () => {
    await mount();
    expect(host.querySelector('.rl-reminder')).toBeNull();
  });

  it('states the reminder as a sentence, not as a key', async () => {
    await mount();
    await deliver();
    expect(host.querySelector('.rl-reminder-title')?.textContent).toBe('Still reading 雪国?');
    expect(host.querySelector('.rl-reminder-body')?.textContent).toBe(
      '42% in, untouched for 30 days.',
    );
    // §11.3's dismissal clause: the never-again control is ON the notification.
    expect(host.textContent).toContain('Never again');
  });

  it('Mark finished actually writes finished', async () => {
    await mount();
    await deliver();
    await act(async () => {
      press('Mark finished');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(written).toHaveLength(1);
    expect(written[0].lists[0].entries[0].state).toBe('finished');
    expect(host.querySelector('.rl-reminder')).toBeNull();
  });

  it('Move to abandoned writes abandoned, not finished', async () => {
    await mount();
    await deliver();
    await act(async () => {
      press('Move to abandoned');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(written[0].lists[0].entries[0].state).toBe('abandoned');
  });

  it('Never again reaches main rather than only closing the card', async () => {
    await mount();
    await deliver();
    await act(async () => {
      press('Never again');
      await Promise.resolve();
    });
    expect(silenced).toEqual(['stalled-book']);
    expect(written).toEqual([]);
  });

  it('Continue opens the bound book through the same bus every surface uses', async () => {
    await mount();
    await deliver();
    await act(async () => {
      press('Continue');
      await Promise.resolve();
    });
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({ section: 'library', intent: 'open', itemId: 'it1' });
  });

  it('Continue on an unbound entry leads to the list, never to nothing', async () => {
    await mount();
    await deliver({ itemId: undefined });
    await act(async () => {
      press('Continue');
      await Promise.resolve();
    });
    expect(openings[0]).toMatchObject({ section: 'lists', intent: 'browse', listId: ids.listId });
  });

  it('closing is "not today" and writes nothing at all', async () => {
    await mount();
    await deliver();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.rl-reminder-close')?.click();
      await Promise.resolve();
    });
    expect(host.querySelector('.rl-reminder')).toBeNull();
    expect(written).toEqual([]);
    expect(silenced).toEqual([]);
  });
});
