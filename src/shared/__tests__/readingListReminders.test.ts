/**
 * §11.3's reminder rules, which are almost entirely rules about NOT firing.
 *
 * Every hard clause in that section is a suppression: off by default, one a day
 * across all kinds, once a week for pace, nothing on first run, silent on a day
 * you already read, dismissible forever. So most of this file asserts `null`,
 * and each of those cases is paired with the one input change that turns it into
 * a reminder — otherwise a rule that suppresses EVERYTHING passes all of them.
 */

import { describe, expect, it } from 'vitest';
import {
  createReadingReminderState,
  defaultReadingReminderSettings,
  evaluateReadingReminders,
  normalizeReadingReminderSettings,
  normalizeReadingReminderState,
  READING_REMINDER_KINDS,
  recordReadingReminderFired,
  silenceReadingReminderKind,
  type ReadingReminderInput,
  type ReadingReminderKind,
  type ReadingReminderSettings,
  type ReadingReminderState,
} from '../readingListReminders';
import type {
  ReadingEntryState,
  ReadingList,
  ReadingListsDocument,
  ReadingWorkRef,
} from '../readingLists';

const DAY = 86_400_000;
/** A Wednesday, 21:00 local — past any sane `dailyHour`, so the hour gate is open. */
const NOW = new Date(2026, 4, 13, 21, 0, 0).getTime();
const INSTALLED = NOW - 30 * DAY;

function work(patch: Partial<ReadingWorkRef> & { id: string; titleRaw: string }): ReadingWorkRef {
  return { boundItemIds: [], bindConfidence: 0, ...patch };
}

function list(
  states: readonly ReadingEntryState[],
  patch: Partial<ReadingList> = {},
): ReadingList {
  return {
    id: 'l1',
    name: 'From Aya',
    kind: 'pool',
    createdAt: NOW - 20 * DAY,
    updatedAt: NOW,
    entries: states.map((state, index) => ({
      id: `e${index}`,
      workId: `w${index}`,
      order: index,
      addedAt: NOW - 20 * DAY + index,
      state,
    })),
    imports: [],
    ...patch,
  };
}

function documentOf(lists: ReadingList[], works: ReadingWorkRef[]): ReadingListsDocument {
  return { schemaVersion: 1, revision: 1, lists, works };
}

function settingsWith(...kinds: ReadingReminderKind[]): ReadingReminderSettings {
  const settings = defaultReadingReminderSettings();
  for (const kind of kinds) settings.enabled[kind] = true;
  return settings;
}

function state(patch: Partial<ReadingReminderState> = {}): ReadingReminderState {
  return { ...createReadingReminderState(INSTALLED), ...patch };
}

/** One list with one book being read, bound to an item last touched 30 days ago. */
function stalledInput(patch: Partial<ReadingReminderInput> = {}): ReadingReminderInput {
  const states: ReadingEntryState[] = ['reading'];
  return {
    now: NOW,
    document: documentOf(
      [list(states)],
      [work({ id: 'w0', titleRaw: '雪国', boundItemIds: ['it1'] })],
    ),
    settings: settingsWith('stalled-book'),
    state: state(),
    activity: {
      lastReadAt: NOW - 30 * DAY,
      items: [{ itemId: 'it1', percent: 0.42, lastReadAt: NOW - 30 * DAY }],
    },
    ...patch,
  };
}

describe('the defaults are silence', () => {
  it('has every kind off, so nothing can fire before a settings screen turns it on', () => {
    const settings = defaultReadingReminderSettings();
    for (const kind of READING_REMINDER_KINDS) {
      expect(settings.enabled[kind], kind).toBe(false);
    }
    expect(settings.silenced).toEqual([]);
    expect(evaluateReadingReminders(stalledInput({ settings }))).toBeNull();
  });

  it('fires the same input once the kind is switched on — the control for the row above', () => {
    expect(evaluateReadingReminders(stalledInput())?.kind).toBe('stalled-book');
  });
});

describe('nothing fires on first run', () => {
  it('is silent for the first day after the state was created', () => {
    const fresh = stalledInput({ state: state({ installedAt: NOW - 3 * 3_600_000 }) });
    expect(evaluateReadingReminders(fresh)).toBeNull();
    // Same input, one day older: the gate is the age, not the data.
    expect(
      evaluateReadingReminders(
        stalledInput({ state: state({ installedAt: NOW - DAY - 1 }) }),
      )?.kind,
    ).toBe('stalled-book');
  });

  it('is silent while there are no lists at all', () => {
    const empty = stalledInput({ document: documentOf([], []) });
    expect(evaluateReadingReminders(empty)).toBeNull();
  });
});

describe('at most one reminder a day, across every kind', () => {
  it('refuses a second reminder on the same local day even for a different kind', () => {
    const earlierToday = new Date(2026, 4, 13, 8, 30, 0).getTime();
    const input = stalledInput({
      settings: settingsWith('stalled-book', 'daily-read'),
      state: state({ lastFiredAt: earlierToday }),
    });
    expect(evaluateReadingReminders(input)).toBeNull();
  });

  it('is eligible again the next calendar day, not 24 hours later', () => {
    // 23:50 yesterday is less than 24h before 21:00 today, and must NOT suppress.
    const lateYesterday = new Date(2026, 4, 12, 23, 50, 0).getTime();
    expect(NOW - lateYesterday).toBeLessThan(DAY);
    const input = stalledInput({ state: state({ lastFiredAt: lateYesterday }) });
    expect(evaluateReadingReminders(input)?.kind).toBe('stalled-book');
  });
});

describe('kind priority', () => {
  it('spends the day on news rather than on a nudge when both are due', () => {
    const input = stalledInput({
      settings: settingsWith('stalled-book', 'new-binding', 'daily-read'),
      newBindings: [
        { workId: 'w0', listId: 'l1', entryId: 'e0', itemId: 'it1', title: '雪国' },
      ],
    });
    expect(evaluateReadingReminders(input)?.kind).toBe('new-binding');
  });
});

describe('stalled book', () => {
  it('ignores a book under 10 %, however long it has sat', () => {
    const input = stalledInput();
    input.activity.items = [{ itemId: 'it1', percent: 0.04, lastReadAt: NOW - 90 * DAY }];
    expect(evaluateReadingReminders(input)).toBeNull();
  });

  it('ignores a book touched inside the window', () => {
    const input = stalledInput();
    input.activity.items = [{ itemId: 'it1', percent: 0.42, lastReadAt: NOW - 3 * DAY }];
    expect(evaluateReadingReminders(input)).toBeNull();
  });

  it('offers the same three answers §4.2 offers, and says how long it has been', () => {
    const reminder = evaluateReadingReminders(stalledInput());
    expect(reminder?.actions).toEqual(['continue', 'finish', 'abandon', 'silence']);
    expect(reminder?.params).toMatchObject({ title: '雪国', days: 30, percent: 42 });
    expect(reminder?.entryId).toBe('e0');
  });

  it('surfaces a given book once, not every day it stays stalled', () => {
    const first = evaluateReadingReminders(stalledInput());
    expect(first).not.toBeNull();
    const after = recordReadingReminderFired(state(), first!, NOW);
    // A day later, so the one-a-day gate is open and only `seen` can suppress it.
    const next = stalledInput({ now: NOW + DAY, state: after });
    expect(evaluateReadingReminders(next)).toBeNull();
  });

  it('says nothing about an archived list', () => {
    const input = stalledInput();
    input.document.lists[0].archivedAt = NOW - DAY;
    expect(evaluateReadingReminders(input)).toBeNull();
  });
});

describe('daily read', () => {
  const dailyInput = (patch: Partial<ReadingReminderInput> = {}): ReadingReminderInput => {
    const base = stalledInput({ settings: settingsWith('daily-read') });
    return { ...base, activity: { lastReadAt: NOW - 5 * DAY, items: [] }, ...patch };
  };

  it('is silent on a day you already read — the entire point of the kind', () => {
    const readThisMorning = new Date(2026, 4, 13, 7, 15, 0).getTime();
    const input = dailyInput();
    input.activity.lastReadAt = readThisMorning;
    expect(evaluateReadingReminders(input)).toBeNull();
  });

  it('fires on a day you have not, once the chosen hour has passed', () => {
    expect(evaluateReadingReminders(dailyInput())?.kind).toBe('daily-read');
  });

  it('waits for the chosen hour rather than firing at breakfast', () => {
    const morning = new Date(2026, 4, 13, 9, 0, 0).getTime();
    const input = dailyInput({ now: morning });
    input.activity.lastReadAt = NOW - 5 * DAY;
    expect(evaluateReadingReminders(input)).toBeNull();
  });

  it('says nothing when there is nothing left to read', () => {
    const finishedStates: ReadingEntryState[] = ['finished', 'abandoned'];
    const input = dailyInput({
      document: documentOf(
        [list(finishedStates)],
        [work({ id: 'w0', titleRaw: 'A' }), work({ id: 'w1', titleRaw: 'B' })],
      ),
    });
    expect(evaluateReadingReminders(input)).toBeNull();
  });
});

describe('challenge pace', () => {
  /** 10 books by a date 5 days out; 2 finished in the 20 days since it started. */
  const challenge = (patch: Partial<ReadingList> = {}) =>
    list(['finished', 'finished', 'reading', 'wanted', 'wanted'], {
      kind: 'challenge',
      target: { count: 10, by: NOW + 5 * DAY },
      ...patch,
    });

  const paceInput = (patch: Partial<ReadingReminderInput> = {}): ReadingReminderInput => ({
    now: NOW,
    document: documentOf(
      [challenge()],
      [0, 1, 2, 3, 4].map((index) => work({ id: `w${index}`, titleRaw: `Book ${index}` })),
    ),
    settings: settingsWith('challenge-pace'),
    state: state(),
    activity: { lastReadAt: NOW - DAY, items: [] },
    ...patch,
  });

  it('nudges when the required rate has risen above the measured one', () => {
    const reminder = evaluateReadingReminders(paceInput());
    expect(reminder?.kind).toBe('challenge-pace');
    // 10 goal - 2 finished = 8 left, 5 days. Stated plainly, no alarm wording.
    expect(reminder?.params).toMatchObject({ list: 'From Aya', books: 8, days: 5 });
  });

  it('stays quiet while the user is keeping up', () => {
    // 3 books by a date far out, 2 already done: required is far below measured.
    const input = paceInput();
    input.document.lists[0].target = { count: 3, by: NOW + 200 * DAY };
    expect(evaluateReadingReminders(input)).toBeNull();
  });

  it('fires at most once a week even on a fresh day', () => {
    const input = paceInput({
      state: state({ lastFiredByKind: { 'challenge-pace': NOW - 3 * DAY } }),
    });
    expect(evaluateReadingReminders(input)).toBeNull();
    const older = paceInput({
      state: state({ lastFiredByKind: { 'challenge-pace': NOW - 8 * DAY } }),
    });
    expect(evaluateReadingReminders(older)?.kind).toBe('challenge-pace');
  });

  it('says nothing about a list with no target date', () => {
    const input = paceInput();
    delete input.document.lists[0].target;
    expect(evaluateReadingReminders(input)).toBeNull();
  });
});

describe('dismissible forever, from the notification', () => {
  it('never offers a silenced kind again, and leaves the enable flag alone', () => {
    const silenced = silenceReadingReminderKind(settingsWith('stalled-book'), 'stalled-book');
    expect(silenced.enabled['stalled-book']).toBe(true);
    expect(evaluateReadingReminders(stalledInput({ settings: silenced }))).toBeNull();
  });
});

describe('a half-written settings or state file degrades, never throws', () => {
  it('falls back to the defaults for anything it cannot read', () => {
    expect(normalizeReadingReminderSettings(null)).toEqual(defaultReadingReminderSettings());
    expect(normalizeReadingReminderSettings('nonsense')).toEqual(
      defaultReadingReminderSettings(),
    );
    const repaired = normalizeReadingReminderSettings({
      enabled: { 'daily-read': true, 'made-up-kind': true },
      dailyHour: 99,
      stalledAfterDays: 0,
      silenced: ['daily-read', 'not-a-kind'],
    });
    expect(repaired.enabled['daily-read']).toBe(true);
    expect(repaired.enabled['new-binding']).toBe(false);
    expect(Object.keys(repaired.enabled).sort()).toEqual([...READING_REMINDER_KINDS].sort());
    expect(repaired.dailyHour).toBe(23);
    expect(repaired.stalledAfterDays).toBe(1);
    expect(repaired.silenced).toEqual(['daily-read']);
  });

  it('gives an unreadable state file a fresh install date, so it cannot nag at once', () => {
    const fresh = normalizeReadingReminderState(undefined, NOW);
    expect(fresh.installedAt).toBe(NOW);
    expect(evaluateReadingReminders(stalledInput({ state: fresh }))).toBeNull();
  });

  it('keeps the fields it can read', () => {
    const kept = normalizeReadingReminderState(
      {
        installedAt: INSTALLED,
        lastFiredAt: NOW - 2 * DAY,
        lastFiredByKind: { 'challenge-pace': NOW - DAY, bogus: 5 },
        seen: ['e0', 7, ''],
      },
      NOW,
    );
    expect(kept.installedAt).toBe(INSTALLED);
    expect(kept.lastFiredAt).toBe(NOW - 2 * DAY);
    expect(kept.lastFiredByKind).toEqual({ 'challenge-pace': NOW - DAY });
    expect(kept.seen).toEqual(['e0']);
  });
});
