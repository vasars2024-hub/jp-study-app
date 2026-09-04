/**
 * §11.3's scheduler, against a real temporary root.
 *
 * The rules themselves are proven in `shared/__tests__/readingListReminders.test.ts`
 * against a fake clock. What is only provable HERE is the part that made §11.3
 * demand a main-process scheduler in the first place:
 *
 *   · the fired-state survives a restart, so "one a day" is not "one a launch";
 *   · a settings write survives one too;
 *   · a tick with an unreadable store returns `null` instead of throwing once a
 *     minute forever.
 *
 * A restart is a second scheduler over the same directory with no shared memory,
 * which is exactly what a relaunch is — the same model `readingListsStore.test.ts`
 * uses for the same reason.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createReadingRemindersScheduler,
  READING_REMINDERS_FILE,
  type ReadingRemindersActivity,
  type ReadingRemindersScheduler,
} from '../readingListsReminders';
import type { ReadingListsStore } from '../readingListsStore';
import type { ReadingReminder } from '../../shared/readingListReminders';
import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';

const DAY = 86_400_000;
/** 21:00 local, so `dailyHour` is never the reason a test is silent. */
const NOW = new Date(2026, 4, 13, 21, 0, 0).getTime();

let root = '';
let clock = NOW;
let fired: ReadingReminder[] = [];

/** One list, one book being read, bound to an item untouched for 30 days. */
function stalledDocument(): ReadingListsDocument {
  return {
    ...emptyReadingListsDocument(),
    revision: 3,
    lists: [
      {
        id: 'l1',
        name: 'From Aya',
        kind: 'pool',
        createdAt: NOW - 40 * DAY,
        updatedAt: NOW - DAY,
        entries: [
          { id: 'e0', workId: 'w0', order: 0, addedAt: NOW - 40 * DAY, state: 'reading' },
        ],
        imports: [],
      },
    ],
    works: [{ id: 'w0', titleRaw: '雪国', boundItemIds: ['it1'], bindConfidence: 0.9 }],
  };
}

function storeOf(document: ReadingListsDocument | 'throws'): ReadingListsStore {
  return {
    filePath: 'x',
    lastGoodPath: 'x',
    eventsPath: 'x',
    read: () => {
      if (document === 'throws') throw new Error('unreadable');
      return { document, health: { state: 'ok', lostRevisions: 0 } };
    },
    write: () => {
      throw new Error('the scheduler never writes the lists document');
    },
    events: () => [],
  };
}

const activity = (): ReadingRemindersActivity => ({
  lastReadAt: NOW - 30 * DAY,
  items: [{ itemId: 'it1', percent: 0.42, lastReadAt: NOW - 30 * DAY }],
});

function scheduler(
  document: ReadingListsDocument | 'throws' = stalledDocument(),
): ReadingRemindersScheduler {
  return createReadingRemindersScheduler(root, {
    resolveStore: () => storeOf(document),
    readActivity: activity,
    broadcast: (reminder) => fired.push(reminder),
    now: () => clock,
  });
}

/** Enables a kind and back-dates `installedAt` past §11.3's first-run silence. */
function armed(target = scheduler()): ReadingRemindersScheduler {
  target.updateSettings({ enabled: { 'stalled-book': true } });
  const file = path.join(root, READING_REMINDERS_FILE);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  parsed.state = { ...parsed.state, installedAt: NOW - 30 * DAY };
  fs.writeFileSync(file, JSON.stringify(parsed), 'utf8');
  return target;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-reading-reminders-'));
  clock = NOW;
  fired = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the scheduler persists what it fired', () => {
  it('writes a defaults file on first read, with every kind off', () => {
    const settings = scheduler().settings();
    expect(fs.existsSync(path.join(root, READING_REMINDERS_FILE))).toBe(true);
    expect(Object.values(settings.enabled).every((value) => value === false)).toBe(true);
  });

  it('fires once, and a RESTART on the same day fires nothing', () => {
    const first = armed();
    expect(first.tick()?.kind).toBe('stalled-book');
    expect(fired).toHaveLength(1);

    // A second scheduler over the same directory, sharing no memory: a relaunch.
    const afterRestart = scheduler();
    expect(afterRestart.tick()).toBeNull();
    expect(fired).toHaveLength(1);
  });

  it('is eligible again on a later day — the control for the row above', () => {
    const target = armed();
    expect(target.tick()?.kind).toBe('stalled-book');
    clock = NOW + 2 * DAY;
    // Same subject, so `seen` suppresses it; a DIFFERENT subject proves the
    // day gate reopened rather than the whole scheduler having latched off.
    const document = stalledDocument();
    document.lists[0].entries.push({
      id: 'e1',
      workId: 'w1',
      order: 1,
      addedAt: NOW - 40 * DAY,
      state: 'reading',
    });
    document.works.push({
      id: 'w1',
      titleRaw: '砂の女',
      boundItemIds: ['it1'],
      bindConfidence: 0.9,
    });
    const next = createReadingRemindersScheduler(root, {
      resolveStore: () => storeOf(document),
      readActivity: activity,
      broadcast: (reminder) => fired.push(reminder),
      now: () => clock,
    });
    expect(next.tick()?.entryId).toBe('e1');
    expect(fired).toHaveLength(2);
  });

  it('records before it broadcasts, so a throwing window cannot re-arm it', () => {
    armed();
    const throwing = createReadingRemindersScheduler(root, {
      resolveStore: () => storeOf(stalledDocument()),
      readActivity: activity,
      broadcast: () => {
        throw new Error('the notification window went away mid-send');
      },
      now: () => clock,
    });
    expect(throwing.tick()?.kind).toBe('stalled-book');
    expect(scheduler().tick()).toBeNull();
  });
});

describe('settings round-trip', () => {
  it('keeps a patch across a restart and leaves the other kinds alone', () => {
    scheduler().updateSettings({ enabled: { 'daily-read': true }, dailyHour: 7 });
    const reloaded = scheduler().settings();
    expect(reloaded.enabled['daily-read']).toBe(true);
    expect(reloaded.enabled['stalled-book']).toBe(false);
    expect(reloaded.dailyHour).toBe(7);
  });

  it('silences a kind forever without switching its enable flag off', () => {
    const target = armed();
    const settings = target.silence('stalled-book');
    expect(settings.silenced).toEqual(['stalled-book']);
    expect(settings.enabled['stalled-book']).toBe(true);
    expect(target.tick()).toBeNull();
  });
});

describe('a failing tick is silent, not fatal', () => {
  it('returns null when the lists store cannot be read', () => {
    const target = armed(scheduler('throws'));
    expect(target.tick()).toBeNull();
    expect(fired).toEqual([]);
  });
});

describe('a queued binding is spent once', () => {
  it('reports the work that bound, then stops offering it', () => {
    const target = armed();
    target.updateSettings({ enabled: { 'new-binding': true, 'stalled-book': false } });
    target.noteBinding({
      workId: 'w0',
      listId: 'l1',
      entryId: 'e0',
      itemId: 'it1',
      title: '雪国',
    });
    const reminder = target.tick();
    expect(reminder?.kind).toBe('new-binding');
    expect(reminder?.params).toMatchObject({ title: '雪国' });

    clock = NOW + 2 * DAY;
    expect(target.tick()).toBeNull();
  });
});

describe('start and stop own exactly one interval', () => {
  it('does not fire at launch, and stops cleanly', () => {
    const target = armed();
    target.start();
    target.start();
    expect(fired).toEqual([]);
    target.stop();
    target.stop();
  });
});
