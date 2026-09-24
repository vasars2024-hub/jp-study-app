/**
 * Reading Lists §11.3 — the scheduler half. Main process, because a renderer
 * `setTimeout` dies with its window and fires nothing.
 *
 * `buddyScheduler.ts` is the precedent and this follows its shape: one interval,
 * one evaluation per tick, a broadcast to every live window. Two things are
 * deliberately different, and both are §11.3 clauses rather than taste:
 *
 *   · **The schedule is not pushed from a renderer.** Buddy takes its entries
 *     from the window that owns them; reminders are computed from the lists
 *     document, which main already owns, so nothing has to be alive for a
 *     reminder to be due. That is the point of putting them here.
 *   · **The fired-state is PERSISTED, not a `Set` in memory.** "At most one a
 *     day" that resets on every app start is "at most one per launch", and this
 *     app is launched several times a day.
 *
 * All decision-making is in `shared/readingListReminders.ts`. This file owns the
 * file, the clock and the wire, and nothing else — the rate rules are proven
 * against a fake clock there rather than against a real interval here.
 */

import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { readJsonSync, writeFileAtomicSync } from './atomicJson';
import {
  createReadingReminderState,
  defaultReadingReminderSettings,
  evaluateReadingReminders,
  normalizeReadingReminderSettings,
  normalizeReadingReminderState,
  READING_REMINDER_KINDS,
  recordReadingReminderFired,
  silenceReadingReminderKind,
  type ReadingReminder,
  type ReadingReminderBinding,
  type ReadingReminderItemActivity,
  type ReadingReminderKind,
  type ReadingReminderSettings,
  type ReadingReminderState,
} from '../shared/readingListReminders';
import type { ReadingListsDocument } from '../shared/readingLists';
import { getReadingListsStore, type ReadingListsStore } from './readingListsStore';

export const READING_REMINDERS_FILE = 'reading-lists-reminders.json';

/**
 * A minute. The rules are day-grained and hour-grained, so a tighter interval
 * buys nothing and a looser one can miss a chosen hour on a machine that sleeps.
 */
const TICK_MS = 60_000;

/** Bindings queued between ticks. Small by construction — an import binds a few. */
const BINDING_QUEUE_LIMIT = 50;

export interface ReadingRemindersActivity {
  lastReadAt: number | null;
  items: ReadingReminderItemActivity[];
}

export interface ReadingRemindersDeps {
  /** Resolved per call, exactly as `readingListsIpc` resolves its store. */
  resolveStore?: () => ReadingListsStore;
  /** What the library knows about reading. Injected so the rules stay testable. */
  readActivity: () => ReadingRemindersActivity;
  broadcast?: (reminder: ReadingReminder) => void;
  now?: () => number;
}

export interface ReadingRemindersScheduler {
  readonly filePath: string;
  settings(): ReadingReminderSettings;
  updateSettings(patch: unknown): ReadingReminderSettings;
  silence(kind: ReadingReminderKind): ReadingReminderSettings;
  /** §3.1 auto-bound a work. Queued, and spent by the next tick that may fire. */
  noteBinding(binding: ReadingReminderBinding): void;
  /** One evaluation. Returns what it fired, or `null` — usually `null`. */
  tick(): ReadingReminder | null;
  start(): void;
  stop(): void;
}

interface PersistedFile {
  settings: ReadingReminderSettings;
  state: ReadingReminderState;
}

function broadcastToWindows(reminder: ReadingReminder): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('readingLists:reminder', reminder);
  }
}

function atomicWrite(filePath: string, text: string): void {
  writeFileAtomicSync(filePath, text, { mode: 0o600 });
}

export function createReadingRemindersScheduler(
  rootDirectory: string,
  deps: ReadingRemindersDeps,
): ReadingRemindersScheduler {
  const filePath = path.join(rootDirectory, READING_REMINDERS_FILE);
  const now = deps.now ?? (() => Date.now());
  const resolveStore = deps.resolveStore ?? getReadingListsStore;
  const broadcast = deps.broadcast ?? broadcastToWindows;
  let bindings: ReadingReminderBinding[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * Read on every use rather than cached.
   *
   * The file is tiny and read at most once a minute, and a cached copy is how a
   * settings change made in one place stops being true in another. It also means
   * the first read is what stamps `installedAt`, so a profile that has never had
   * reminders cannot be nagged in its first day — the clause is enforced by the
   * data, not by a boot-time flag.
   */
  const load = (): PersistedFile => {
    // A damaged file is moved aside (and `.bak` served) by the reader, so the
    // reseed below only happens when there is nothing left to recover.
    const parsed = readJsonSync<unknown>(filePath, null, {
      validate: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
    });
    const at = now();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      const fresh: PersistedFile = {
        settings: defaultReadingReminderSettings(),
        state: createReadingReminderState(at),
      };
      save(fresh);
      return fresh;
    }
    const raw = parsed as Record<string, unknown>;
    return {
      settings: normalizeReadingReminderSettings(raw.settings),
      state: normalizeReadingReminderState(raw.state, at),
    };
  };

  function save(file: PersistedFile): void {
    try {
      atomicWrite(filePath, JSON.stringify(file, null, 2));
    } catch {
      // Best effort: a settings write that fails must not take the tick down.
      // The consequence is a reminder that may repeat, never one that crashes.
    }
  }

  const self: ReadingRemindersScheduler = {
    filePath,
    settings: () => load().settings,

    updateSettings: (patch) => {
      const file = load();
      // Merged through the normalizer rather than assigned: the patch arrives
      // from a renderer, and a half-valid one must leave the rest intact.
      const merged = normalizeReadingReminderSettings({
        ...file.settings,
        ...(typeof patch === 'object' && patch !== null && !Array.isArray(patch) ? patch : {}),
        enabled: {
          ...file.settings.enabled,
          ...(typeof patch === 'object' && patch !== null
            ? ((patch as { enabled?: Record<string, unknown> }).enabled ?? {})
            : {}),
        },
      });
      save({ ...file, settings: merged });
      return merged;
    },

    silence: (kind) => {
      const file = load();
      if (!READING_REMINDER_KINDS.includes(kind)) return file.settings;
      const settings = silenceReadingReminderKind(file.settings, kind);
      save({ ...file, settings });
      return settings;
    },

    noteBinding: (binding) => {
      bindings = [...bindings, binding].slice(-BINDING_QUEUE_LIMIT);
    },

    tick: () => {
      let file: PersistedFile;
      let activity: ReadingRemindersActivity;
      let document: ReadingListsDocument;
      try {
        file = load();
        activity = deps.readActivity();
        document = resolveStore().read().document;
      } catch {
        // An unreadable store is the lists surface's problem to report, not a
        // reason for a scheduler to start throwing once a minute forever.
        return null;
      }

      const at = now();
      const reminder = evaluateReadingReminders({
        now: at,
        document,
        settings: file.settings,
        state: file.state,
        activity,
        newBindings: bindings,
      });
      if (!reminder) return null;

      // Recorded BEFORE the broadcast. A window that throws while rendering a
      // notification must not leave the reminder un-recorded and therefore due
      // again on the very next tick.
      save({ ...file, state: recordReadingReminderFired(file.state, reminder, at) });
      if (reminder.kind === 'new-binding') {
        bindings = bindings.filter((binding) => binding.workId !== reminder.subjectId);
      }
      try {
        broadcast(reminder);
      } catch {
        // Every window is gone or one of them is mid-teardown.
      }
      return reminder;
    },

    start: () => {
      if (timer) return;
      timer = setInterval(() => {
        try {
          self.tick();
        } catch {
          // A tick that throws must not kill the interval.
        }
      }, TICK_MS);
      // Deliberately no immediate tick: `buddyScheduler` fires one because its
      // schedule arrives late, and this one's data is already on disk. Firing at
      // launch would make "one a day" mean "one per launch" on the first day.
    },

    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };

  return self;
}

let scheduler: ReadingRemindersScheduler | null = null;

export function setReadingRemindersSchedulerForTesting(
  value: ReadingRemindersScheduler | null,
): void {
  scheduler = value;
}

export function getReadingRemindersScheduler(): ReadingRemindersScheduler | null {
  return scheduler;
}

/**
 * Wire the scheduler and its three renderer channels.
 *
 * `readActivity` is supplied by the caller rather than imported here so that
 * `main/library.ts` stays the only module that knows where the library file is.
 */
export function registerReadingRemindersIpc(
  rootDirectory: string,
  deps: ReadingRemindersDeps,
): ReadingRemindersScheduler {
  const created = createReadingRemindersScheduler(rootDirectory, deps);
  scheduler = created;

  ipcMain.handle('readingListsReminders:get', (): ReadingReminderSettings => created.settings());
  ipcMain.handle(
    'readingListsReminders:set',
    (_event, raw: unknown): ReadingReminderSettings => created.updateSettings(raw),
  );
  ipcMain.handle(
    'readingListsReminders:silence',
    (_event, raw: unknown): ReadingReminderSettings => {
      const kind = READING_REMINDER_KINDS.find((candidate) => candidate === raw);
      return kind ? created.silence(kind) : created.settings();
    },
  );

  created.start();
  return created;
}
