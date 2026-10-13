// @vitest-environment jsdom
/**
 * Notes can never be lost (docs/SCORECARD.md bugs 5 and 6, work package 4).
 *
 * Before: the learner's notes shared one 500-entry FIFO with automatic mining /
 * lookup / translation events, so about 500 mines after a note was written it
 * was silently deleted, and every body was cut to 4,000 characters. These tests
 * pin the fix: notes live in their own durable store with no cap, the old list
 * is migrated out (idempotently, with a backup), the activity cap only ever
 * touches automatic events, and delete / trash / restore / export / import keep
 * every byte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kv = vi.hoisted(() => ({
  map: new Map<string, unknown>(),
  failWrites: false,
  clone: (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
}));

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => kv.clone(kv.map.get(key)),
  kvSet: async (key: string, value: unknown) => {
    if (kv.failWrites) throw new DOMException('refused', 'QuotaExceededError');
    kv.map.set(key, kv.clone(value));
  },
  kvUpdate: async () => undefined,
  kvDelete: async (key: string) => {
    if (kv.failWrites) throw new DOMException('refused', 'QuotaExceededError');
    kv.map.delete(key);
  },
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    if (kv.failWrites) throw new DOMException('refused', 'QuotaExceededError');
    for (const op of ops) {
      if (op.type === 'put') kv.map.set(op.key, kv.clone(op.value));
      else kv.map.delete(op.key);
    }
  },
  kvScanPrefix: async (prefix: string) =>
    [...kv.map.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, kv.clone(v)]),
  idbWritesBlocked: () => false,
}));

import {
  NOTEBOOK_LEGACY_BACKUP_PREFIX,
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  appendNotebookEvent,
  findNotebookEntry,
  loadActivityTimeline,
  loadNotebookTimeline,
  migrateLegacyNotebookNotes,
  removeNotebookEntry,
  resetNotebookStartForTests,
  updateNotebookEntry,
  type NotebookTimelineEntry,
} from '../notebookTimeline';
import {
  USER_NOTES_JOURNAL_KEY,
  USER_NOTE_KEY_PREFIX,
  createUserNote,
  flushUserNotes,
  getUserNote,
  importUserNotes,
  allUserNotes,
  purgeUserNote,
  resetUserNotesForTests,
  restoreUserNote,
  restoreUserNoteVersion,
  trashUserNote,
  updateUserNote,
  userNoteSaveState,
  whenUserNotesReady,
} from '../userNotesStore';
import {
  ACTIVITY_TIMELINE_CAP,
  isUserNoteEntry,
  notesToJson,
  notesToMarkdown,
  parseNotesImport,
  searchUserNotes,
  type UserNote,
} from '../../shared/userNotes';
import { migrateBlancQuickNotes } from '../components/blanc/blancQuickNotes';
import { BLANC_QUICK_NOTES_KEY } from '../components/blanc/blancMechBus';

function storedNoteIds(): string[] {
  return [...kv.map.keys()].filter((k) => k.startsWith(USER_NOTE_KEY_PREFIX)).map((k) => k.slice(USER_NOTE_KEY_PREFIX.length));
}

/** A new window: memory gone, then the store loads from IndexedDB and the journal. */
async function restart(): Promise<void> {
  resetUserNotesForTests();
  await whenUserNotesReady();
}

function legacyEvent(i: number): NotebookTimelineEntry {
  return { id: `ev-${i}`, stream: 'extension', title: `mined ${i}`, detail: `sentence ${i}`, folder: 'Mined', ts: 1_000_000 + i, origin: 'extension' };
}

function legacyNote(i: number, extra: Partial<NotebookTimelineEntry> = {}): NotebookTimelineEntry {
  return { id: `nb-note-${i}`, stream: 'media', title: `Episode ${i}: explain`, detail: `My note ${i}`, folder: 'Media study', ts: 2_000_000 + i, ...extra };
}

beforeEach(async () => {
  vi.useRealTimers();
  localStorage.clear();
  kv.map.clear();
  kv.failWrites = false;
  resetNotebookStartForTests();
  resetUserNotesForTests();
  await whenUserNotesReady();
});

afterEach(async () => {
  kv.failWrites = false;
  await flushUserNotes();
});

describe('which old timeline rows are notes', () => {
  it('keeps anything not provably automatic', () => {
    expect(isUserNoteEntry({ stream: 'media', title: 'x' })).toBe(true);
    expect(isUserNoteEntry({ stream: 'highlights', title: 'x' })).toBe(true);
    expect(isUserNoteEntry({ stream: 'notes', title: 'x' })).toBe(true);
    expect(isUserNoteEntry({ stream: 'translations', title: 'x', meta: { translationId: 't1' } })).toBe(true);
    expect(isUserNoteEntry({ title: 'no stream at all' })).toBe(true);
    expect(isUserNoteEntry({ stream: 'extension', title: 'x', detail: 'y'.repeat(401) })).toBe(true);
    expect(isUserNoteEntry({ stream: 'extension', title: 'x', detail: 'short' })).toBe(false);
    expect(isUserNoteEntry({ stream: 'translations', title: 'x', detail: 'preview' })).toBe(false);
    expect(isUserNoteEntry({ stream: 'audio', title: 'x' })).toBe(false);
  });
});

describe('the bug: notes vs. the 500-entry activity cap', () => {
  it('a note survives any number of automatic events', async () => {
    const note = appendNotebookEvent({ stream: 'media', title: 'Episode 1: explain', detail: 'keep me' });
    for (let i = 0; i < 700; i++) appendNotebookEvent({ stream: 'extension', title: `mine ${i}`, detail: `s ${i}` });
    expect(loadActivityTimeline()).toHaveLength(ACTIVITY_TIMELINE_CAP);
    expect(loadActivityTimeline().some((e) => e.id === note.id)).toBe(false);
    expect(findNotebookEntry(note.id)?.detail).toBe('keep me');
    expect(loadNotebookTimeline().filter((e) => e.id === note.id)).toHaveLength(1);
    await flushUserNotes();
    expect(storedNoteIds()).toContain(note.id);
  });

  it('a note body is never cut (100 KB)', async () => {
    const body = 'あ'.repeat(50_000) + 'x'.repeat(50_000);
    const note = appendNotebookEvent({ stream: 'media', title: 'Long', detail: body });
    expect(findNotebookEntry(note.id)?.detail).toHaveLength(100_000);
    const edited = `${body}\nmore`;
    expect(updateNotebookEntry(note.id, { detail: edited })?.detail).toBe(edited);
    await flushUserNotes();
    await restart();
    expect(getUserNote(note.id)?.detail).toBe(edited);
    expect(getUserNote(note.id)?.history?.[0]?.detail).toBe(body);
  });

  it('a long title is kept whole', () => {
    const title = 't'.repeat(500);
    const note = appendNotebookEvent({ stream: 'media', title, detail: 'b' });
    expect(findNotebookEntry(note.id)?.title).toBe(title);
  });

  it('editing an automatic event makes it a note, out of reach of the cap', () => {
    const ev = appendNotebookEvent({ stream: 'extension', title: 'mined', detail: 'sentence' });
    expect(updateNotebookEntry(ev.id, { detail: 'my own words about this' })?.detail).toBe('my own words about this');
    expect(getUserNote(ev.id)).not.toBeNull();
    expect(loadActivityTimeline().some((e) => e.id === ev.id)).toBe(false);
    for (let i = 0; i < 600; i++) appendNotebookEvent({ stream: 'ocr', title: `ocr ${i}` });
    expect(findNotebookEntry(ev.id)?.detail).toBe('my own words about this');
  });
});

describe('migration out of the old shared list', () => {
  it('moves every note out of a list already over 500 entries, keeping a verbatim backup', async () => {
    // 650 events and 60 notes, notes spread through the list including its tail.
    const list: NotebookTimelineEntry[] = [];
    for (let i = 0; i < 710; i++) list.push(i % 12 === 5 && list.filter(isUserNoteEntry).length < 60 ? legacyNote(i) : legacyEvent(i));
    const notesBefore = list.filter(isUserNoteEntry);
    expect(notesBefore.length).toBeGreaterThan(50);
    expect(list.length).toBeGreaterThan(ACTIVITY_TIMELINE_CAP);
    const raw = JSON.stringify(list);
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, raw);

    // Before migration nothing is hidden or lost.
    expect(loadNotebookTimeline()).toHaveLength(710);

    const result = await migrateLegacyNotebookNotes();
    expect(result.found).toBe(notesBefore.length);
    expect(result.moved).toBe(notesBefore.length);
    expect(result.skipped).toBeUndefined();
    expect(kv.map.get(result.backupKey!)).toMatchObject({ raw });

    expect(storedNoteIds().sort()).toEqual(notesBefore.map((n) => n.id).sort());
    for (const n of notesBefore) expect(getUserNote(n.id)).toMatchObject({ title: n.title, detail: n.detail, folder: n.folder, ts: n.ts });
    expect(loadActivityTimeline().some(isUserNoteEntry)).toBe(false);
    expect(loadActivityTimeline()).toHaveLength(ACTIVITY_TIMELINE_CAP);
    for (const n of notesBefore) expect(findNotebookEntry(n.id)?.detail).toBe(n.detail);
  });

  it('is idempotent: a second run, or the same list written back by an old build, adds nothing', async () => {
    const list = [legacyNote(1), legacyEvent(1), legacyNote(2)];
    const raw = JSON.stringify(list);
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, raw);
    const first = await migrateLegacyNotebookNotes();
    expect(first.moved).toBe(2);
    const second = await migrateLegacyNotebookNotes();
    expect(second).toMatchObject({ found: 0, moved: 0 });

    // An older build writes the old list back.
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, raw);
    const third = await migrateLegacyNotebookNotes();
    expect(third.moved).toBe(2);
    expect(storedNoteIds()).toHaveLength(2);
    expect(allUserNotes()).toHaveLength(2);
    expect([...kv.map.keys()].filter((k) => k.startsWith(NOTEBOOK_LEGACY_BACKUP_PREFIX))).toHaveLength(1);
  });

  it('keeps the newer note and the old text as a version when both differ', async () => {
    const legacy = legacyNote(7);
    createUserNote({ ...legacy, detail: 'edited since' });
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, JSON.stringify([legacy]));
    await migrateLegacyNotebookNotes();
    expect(getUserNote(legacy.id)?.detail).toBe('edited since');
    expect(getUserNote(legacy.id)?.history?.some((h) => h.detail === legacy.detail)).toBe(true);
  });

  it('moves nothing when IndexedDB refuses, and the old list keeps every note uncapped', async () => {
    const list: NotebookTimelineEntry[] = [legacyNote(1)];
    for (let i = 0; i < 600; i++) list.push(legacyEvent(i));
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, JSON.stringify(list));
    kv.failWrites = true;
    const result = await migrateLegacyNotebookNotes();
    expect(result.moved).toBe(0);
    expect(result.skipped).toBe('backup-failed');
    // New events keep landing; the cap still never removes the old note.
    for (let i = 0; i < 50; i++) appendNotebookEvent({ stream: 'extension', title: `new ${i}`, detail: 'x' });
    expect(loadActivityTimeline().some((e) => e.id === 'nb-note-1')).toBe(true);
    expect(findNotebookEntry('nb-note-1')?.detail).toBe('My note 1');
  });
});

describe('durability', () => {
  it('a change IndexedDB refuses stays in the journal and survives a restart', async () => {
    kv.failWrites = true;
    const note = createUserNote({ title: 'offline', detail: 'written while IndexedDB refused' });
    await flushUserNotes();
    expect(userNoteSaveState(note.id)).toBe('local');
    expect(localStorage.getItem(USER_NOTES_JOURNAL_KEY)).toContain('written while IndexedDB refused');

    kv.failWrites = false;
    await restart();
    expect(getUserNote(note.id)?.detail).toBe('written while IndexedDB refused');
    await flushUserNotes();
    expect(storedNoteIds()).toContain(note.id);
    expect(userNoteSaveState(note.id)).toBe('saved');
    expect(localStorage.getItem(USER_NOTES_JOURNAL_KEY)).toBeNull();
  });

  it('holds 10,000 notes: listed, searched, stored, and untouched by the activity cap', async () => {
    const now = Date.now();
    const notes: UserNote[] = [];
    for (let i = 0; i < 10_000; i++) {
      notes.push({ id: `bulk-${i}`, stream: 'notes', title: `Note ${i}`, detail: i === 4242 ? 'the needle ねこ' : `body ${i}`, ts: now - i, updatedAt: now - i, tags: i % 2 ? ['odd'] : ['even'] });
    }
    const plan = importUserNotes(notes);
    expect(plan.added).toBe(10_000);
    expect(allUserNotes()).toHaveLength(10_000);
    await flushUserNotes();
    expect(storedNoteIds()).toHaveLength(10_000);

    const started = performance.now();
    const hits = searchUserNotes(allUserNotes(), { query: 'ＮＥＥＤＬＥ ネコ' });
    expect(hits.map((n) => n.id)).toEqual(['bulk-4242']);
    expect(searchUserNotes(allUserNotes(), { tag: 'odd' })).toHaveLength(5_000);
    expect(performance.now() - started).toBeLessThan(2_000);

    for (let i = 0; i < 600; i++) appendNotebookEvent({ stream: 'extension', title: `mine ${i}` });
    expect(allUserNotes()).toHaveLength(10_000);
    expect(loadNotebookTimeline()).toHaveLength(10_000 + ACTIVITY_TIMELINE_CAP);

    await restart();
    expect(allUserNotes()).toHaveLength(10_000);
  });
});

describe('delete, trash and restore', () => {
  it('Delete moves a note to the trash; restore brings it back whole', async () => {
    const note = appendNotebookEvent({ stream: 'media', title: 'Delete me', detail: 'precious' });
    expect(removeNotebookEntry(note.id)).toBe(true);
    expect(findNotebookEntry(note.id)).toBeNull();
    expect(loadNotebookTimeline().some((e) => e.id === note.id)).toBe(false);
    expect(getUserNote(note.id)?.deletedAt).toEqual(expect.any(Number));
    await flushUserNotes();
    expect(storedNoteIds()).toContain(note.id);

    expect(restoreUserNote(note.id)).toBe(true);
    expect(findNotebookEntry(note.id)?.detail).toBe('precious');
  });

  it('only a trashed note can be deleted forever', async () => {
    const note = createUserNote({ title: 'a', detail: 'b' });
    expect(purgeUserNote(note.id)).toBe(false);
    trashUserNote(note.id);
    expect(purgeUserNote(note.id)).toBe(true);
    await flushUserNotes();
    expect(getUserNote(note.id)).toBeNull();
    expect(storedNoteIds()).not.toContain(note.id);
    await restart();
    expect(getUserNote(note.id)).toBeNull();
  });

  it('an old note deleted from Files before it was migrated goes to the trash too', () => {
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, JSON.stringify([legacyNote(3), legacyEvent(3)]));
    expect(removeNotebookEntry('nb-note-3')).toBe(true);
    expect(getUserNote('nb-note-3')).toMatchObject({ detail: 'My note 3', deletedAt: expect.any(Number) });
    expect(loadActivityTimeline().map((e) => e.id)).toEqual(['ev-3']);
  });
});

describe('versions', () => {
  it('an explicit save keeps the previous text as a version, and restoring one is itself undoable', () => {
    const note = createUserNote({ title: 'v', detail: 'one' });
    updateUserNote(note.id, { detail: 'two' }, { checkpoint: true });
    updateUserNote(note.id, { detail: 'three' }, { checkpoint: true });
    const history = getUserNote(note.id)?.history ?? [];
    expect(history.map((h) => h.detail)).toEqual(['two', 'one']);
    const oldest = history[1];
    expect(restoreUserNoteVersion(note.id, oldest.at)?.detail).toBe('one');
    expect(getUserNote(note.id)?.history?.[0]?.detail).toBe('three');
  });
});

describe('export and re-import', () => {
  const tricky: UserNote[] = [
    {
      id: 'n1',
      stream: 'notes',
      title: 'Grammar: ～ばかり',
      detail: '# Heading\n\n- [ ] task\n<!-- gum-note {"id":"fake"} -->\n\n\ntrailing blank lines\n\n',
      ts: 1,
      updatedAt: 5,
      folder: 'Grammar',
      tags: ['n3', 'ばかり'],
      links: [{ kind: 'url', url: 'https://example.com/', label: 'ref' }, { kind: 'card', id: 'fc-1', label: '猫' }],
      pinned: true,
    },
    { id: 'n2', stream: 'translations', title: '', detail: '', ts: 2, updatedAt: 2, meta: { translationId: 't-9' } },
    { id: 'n3', stream: 'notes', title: 'trashed', detail: 'still here', ts: 3, updatedAt: 3, deletedAt: 9, history: [{ at: 2, title: 'trashed', detail: 'older' }] },
  ];

  it('Markdown round-trips exactly, even a body that contains a marker line', () => {
    const back = parseNotesImport(notesToMarkdown(tricky), 'export.md');
    expect(back).toHaveLength(3);
    for (const [i, note] of tricky.entries()) {
      const expected = JSON.parse(JSON.stringify({ id: note.id, title: note.title, detail: note.detail, folder: note.folder, tags: note.tags, links: note.links, deletedAt: note.deletedAt }));
      expect(back[i]).toMatchObject(expected);
    }
  });

  it('JSON round-trips everything, trash and history included', () => {
    expect(parseNotesImport(notesToJson(tricky), 'notes.json')).toEqual(tricky);
  });

  it('a plain Markdown file becomes one note', () => {
    const [note] = parseNotesImport('# Shopping\n\n- 卵\n- 牛乳\n', 'list.md');
    expect(note).toMatchObject({ title: 'Shopping', detail: '- 卵\n- 牛乳' });
  });

  it('re-importing an export changes nothing; a newer copy updates and keeps the old text', () => {
    const a = createUserNote({ title: 'A', detail: 'alpha', tags: 'x' });
    const b = createUserNote({ title: 'B', detail: 'beta' });
    const exported = notesToJson(allUserNotes({ includeTrashed: true }));
    const again = importUserNotes(parseNotesImport(exported));
    expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 2 });

    const newer = { ...getUserNote(a.id)!, detail: 'alpha v2', updatedAt: getUserNote(a.id)!.updatedAt + 1000 };
    const older = { ...getUserNote(b.id)!, detail: 'beta from an old backup', updatedAt: 0 };
    const plan = importUserNotes([newer, older]);
    expect(plan).toMatchObject({ updated: 1, keptAsVersion: 1 });
    expect(getUserNote(a.id)?.detail).toBe('alpha v2');
    expect(getUserNote(a.id)?.history?.some((h) => h.detail === 'alpha')).toBe(true);
    expect(getUserNote(b.id)?.detail).toBe('beta');
    expect(getUserNote(b.id)?.history?.some((h) => h.detail === 'beta from an old backup')).toBe(true);
  });
});

describe('Blanc Quick Notes', () => {
  it('the old text box becomes one note, once, with a backup', async () => {
    const text = 'Remember: 〜わけにはいかない\nsecond line';
    localStorage.setItem(BLANC_QUICK_NOTES_KEY, text);
    const id = await migrateBlancQuickNotes('Quick Notes');
    expect(getUserNote(id!)).toMatchObject({ title: 'Remember: 〜わけにはいかない', detail: text, folder: 'Quick Notes', tags: ['quick'] });
    expect(localStorage.getItem(BLANC_QUICK_NOTES_KEY)).toBeNull();
    expect([...kv.map.values()].some((v) => (v as { text?: string })?.text === text)).toBe(true);

    // A crash before the key was removed: the next run finds the same note.
    localStorage.setItem(BLANC_QUICK_NOTES_KEY, text);
    expect(await migrateBlancQuickNotes('Quick Notes')).toBe(id);
    expect(allUserNotes()).toHaveLength(1);
  });
});
