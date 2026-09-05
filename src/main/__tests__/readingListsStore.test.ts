/**
 * P0's acceptance, from `docs/ACTIVE/READING_LISTS_PLAN.md` §9:
 *
 *   "Round-trips through a restart; two windows agree; corrupt file recovers to
 *    last good with a diagnostic."
 *
 * All three are driven here against a real temporary userData root, because all
 * three are about what reaches disk. A restart is modelled as a second store
 * built over the same directory with no shared memory — which is exactly what a
 * relaunch is — and "two windows agree" as two stores over one directory, which
 * is the property the plan's §0 says `preferredSubtitleId` exists to guarantee.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createReadingListsStore,
  READING_LISTS_EVENT_LIMIT,
  type ReadingListsStore,
} from '../readingListsStore';
import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';

let root = '';

function fixture(): ReadingListsDocument {
  return {
    ...emptyReadingListsDocument(),
    lists: [
      {
        id: 'list-1',
        name: 'from Kenji',
        kind: 'ordered',
        createdAt: 1_000,
        updatedAt: 1_000,
        entries: [
          {
            id: 'entry-1',
            workId: 'work-1',
            order: 0,
            addedAt: 1_000,
            state: 'wanted',
          },
        ],
        imports: [],
      },
    ],
    works: [
      {
        id: 'work-1',
        titleRaw: '君の膵臓をたべたい',
        boundItemIds: [],
        bindConfidence: 0,
      },
    ],
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-reading-lists-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the document survives a restart', () => {
  it('reads back exactly what was written, from a store with no shared memory', () => {
    const before: ReadingListsStore = createReadingListsStore(root);
    const written = before.write(0, fixture(), [
      { at: 1_000, kind: 'list-created', listId: 'list-1' },
    ]);
    expect(written.applied).toBe(true);

    // The restart. Nothing is carried across but the directory.
    const after = createReadingListsStore(root);
    const reopened = after.read();
    expect(reopened.health.state).toBe('ok');
    expect(reopened.document.lists).toHaveLength(1);
    expect(reopened.document.lists[0].entries[0].workId).toBe('work-1');
    expect(reopened.document.works[0].titleRaw).toBe('君の膵臓をたべたい');
    expect(reopened.document.revision).toBe(1);
  });

  it('reports first run as `empty`, which is not a fault', () => {
    const snapshot = createReadingListsStore(root).read();
    expect(snapshot.health.state).toBe('empty');
    expect(snapshot.document.lists).toEqual([]);
    // The distinction that matters: nothing was recovered and nothing was lost,
    // so the surface must not offer a recovery it does not need.
    expect(snapshot.health.lostRevisions).toBe(0);
    expect(snapshot.health.detectedAt).toBeUndefined();
  });
});

describe('two windows cannot disagree', () => {
  it('refuses a write from a stale revision and hands back the current document', () => {
    const windowA = createReadingListsStore(root);
    const windowB = createReadingListsStore(root);

    const loadedByBoth = windowA.read().document.revision;
    expect(windowB.read().document.revision).toBe(loadedByBoth);

    const first = windowA.write(loadedByBoth, fixture());
    expect(first.applied).toBe(true);
    expect(first.snapshot.document.revision).toBe(1);

    // B still holds revision 0 — it has been open since before A wrote.
    const second = windowB.write(loadedByBoth, {
      ...emptyReadingListsDocument(),
      lists: [],
    });
    expect(second.applied).toBe(false);
    // The refusal is not an error: B is handed the document it must re-apply against.
    expect(second.snapshot.document.revision).toBe(1);
    expect(second.snapshot.document.lists).toHaveLength(1);

    // And the refused write reached nothing.
    expect(createReadingListsStore(root).read().document.lists).toHaveLength(1);
  });

  it('mints the revision in main, so a renderer cannot choose or rewind it', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    const forged = store.write(1, { ...fixture(), revision: 999 });
    expect(forged.applied).toBe(true);
    expect(forged.snapshot.document.revision).toBe(2);
  });
});

describe('a corrupt document recovers to last-good, and says so', () => {
  it('serves the last document that parsed, with a diagnostic', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    // The read is what promotes a parsed document to the restore point.
    expect(store.read().health.state).toBe('ok');
    expect(fs.existsSync(store.lastGoodPath)).toBe(true);

    fs.writeFileSync(store.filePath, '{"lists": [{"id": "list-1"', 'utf8');

    const recovered = createReadingListsStore(root).read();
    expect(recovered.health.state).toBe('recovered');
    expect(recovered.health.lostRevisions).toBeGreaterThan(0);
    expect(recovered.health.detectedAt).toBeGreaterThan(0);
    // The point of the whole mechanism: the list is still there.
    expect(recovered.document.lists).toHaveLength(1);
    expect(recovered.document.lists[0].name).toBe('from Kenji');
  });

  it('does not read valid JSON of the wrong shape as an empty library', () => {
    // The trap this guards: `normalizeReadingListsDocument` is total, so `null`
    // and `[]` both normalize to a document with zero lists. Without the shape
    // check in `readDocument`, a file truncated to `[]` would be served as "you
    // have no lists" and would then overwrite the restore point with itself.
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    store.read();

    for (const corruption of ['null', '[]', '"lists"', '42']) {
      fs.writeFileSync(store.filePath, corruption, 'utf8');
      const snapshot = createReadingListsStore(root).read();
      expect(snapshot.health.state, `\`${corruption}\` was served as a document`)
        .toBe('recovered');
      expect(snapshot.document.lists).toHaveLength(1);
    }
  });

  it('does not read an OBJECT of the wrong shape as an empty library', () => {
    // Boss audit 2026-09-05, Finding 1, P0. The check above rejected `null`, an
    // array and scalars — but `{}` is an object, so it sailed through, normalized
    // to zero lists, and was reported `ok`. `{}` is precisely the shape a
    // half-written or hand-truncated file lands on, so this was the likely case,
    // not the exotic one.
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    store.read();

    for (const corruption of ['{}', '{"revision":3}', '{"lists":{}}', '{"lists":[],"works":7}']) {
      fs.writeFileSync(store.filePath, corruption, 'utf8');
      const snapshot = createReadingListsStore(root).read();
      expect(snapshot.health.state, `\`${corruption}\` was served as a document`)
        .toBe('recovered');
      expect(snapshot.document.lists).toHaveLength(1);
    }
  });

  it('does not let a corrupt read overwrite the restore point', () => {
    // The half that turns a bad read into permanent loss: `snapshot()` promotes
    // whatever it accepted to last-good. If `{}` is accepted once, the only copy
    // of the lists is gone and the NEXT read has nothing to recover from.
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    store.read();

    fs.writeFileSync(store.filePath, '{}', 'utf8');
    createReadingListsStore(root).read();

    const lastGood = JSON.parse(fs.readFileSync(store.lastGoodPath, 'utf8')) as {
      lists: unknown[];
    };
    expect(lastGood.lists).toHaveLength(1);
  });

  it('still reads a document written by a build that predates a field', () => {
    // The control on the fix: the shape check must reject corruption without
    // rejecting forward compatibility. A document with `lists` but no `works`
    // and no `schemaVersion` is what an older build wrote, and refusing it would
    // be data loss of its own making.
    const store = createReadingListsStore(root);
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(
      store.filePath,
      JSON.stringify({ lists: [{ id: 'list-1', name: 'from Kenji', kind: 'ordered', entries: [] }] }),
      'utf8',
    );

    const snapshot = createReadingListsStore(root).read();
    expect(snapshot.health.state).toBe('ok');
    expect(snapshot.document.lists).toHaveLength(1);
  });

  it('does not serve a document whose lists are all unusable as a healthy library', () => {
    // Boss audit 2026-09-05 attempt 4, Finding 3 — the residual hole in the fix
    // above. The shape guard is DOCUMENT-level, so a file that keeps the shape
    // and loses only its members walked straight past it: measured
    // `{state:'ok', lists:0, lastGood:0, revision:7}` from a file still claiming
    // revision 7. Same wipe as `{}`, one level down.
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    store.read();

    const attacks = [
      // A: document shape fully intact, every member missing its `id`.
      '{"schemaVersion":1,"revision":7,"works":[],"lists":[{"name":"from Kenji"},{"name":"B"}]}',
      // B: members that are not records at all.
      '{"revision":7,"lists":[1,2,"x",null]}',
    ];
    for (const corruption of attacks) {
      fs.writeFileSync(store.filePath, corruption, 'utf8');
      const snapshot = createReadingListsStore(root).read();
      expect(snapshot.health.state, `\`${corruption}\` was served as a document`)
        .toBe('recovered');
      expect(snapshot.document.lists).toHaveLength(1);

      const lastGood = JSON.parse(fs.readFileSync(store.lastGoodPath, 'utf8')) as {
        lists: unknown[];
      };
      expect(lastGood.lists, 'the restore point was overwritten').toHaveLength(1);
    }
  });

  it('still accepts a document that legitimately has no lists, and one that loses only some', () => {
    // The control on Finding 3's fix, and the reason it tests TOTAL loss only.
    // An empty library claims nothing and must stay `ok`, or a user who deleted
    // their last list can never read their own file again. And a file that loses
    // SOME members to deduplication is being repaired, not destroyed.
    const store = createReadingListsStore(root);
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });

    fs.writeFileSync(store.filePath, '{"schemaVersion":1,"revision":4,"lists":[],"works":[]}', 'utf8');
    const empty = createReadingListsStore(root).read();
    expect(empty.health.state).toBe('ok');
    expect(empty.document.lists).toEqual([]);

    const partial = { ...fixture(), lists: [fixture().lists[0], { name: 'no id' }] };
    fs.writeFileSync(store.filePath, JSON.stringify(partial), 'utf8');
    const kept = createReadingListsStore(root).read();
    expect(kept.health.state).toBe('ok');
    expect(kept.document.lists).toHaveLength(1);
  });

  it('reports `reset` — not `recovered` — when there is no restore point', () => {
    const store = createReadingListsStore(root);
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(store.filePath, 'not json at all', 'utf8');

    const snapshot = createReadingListsStore(root).read();
    expect(snapshot.health.state).toBe('reset');
    expect(snapshot.document.lists).toEqual([]);
    expect(snapshot.health.detectedAt).toBeGreaterThan(0);
  });

  it('logs the recovery, so it is answerable after the fact', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    store.read();
    fs.writeFileSync(store.filePath, '{', 'utf8');
    createReadingListsStore(root).read();

    const events = createReadingListsStore(root).events(50);
    expect(events.some((event) => event.kind === 'document-recovered')).toBe(true);
  });
});

describe('the event log', () => {
  it('records one line per applied mutation, newest first, stamped with the revision', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture(), [{ at: 1, kind: 'list-created', listId: 'list-1' }]);
    store.write(1, fixture(), [{ at: 2, kind: 'entry-added', entryId: 'entry-1' }]);

    const events = store.events(10);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('entry-added');
    expect(events[0].revision).toBe(2);
    expect(events[1].kind).toBe('list-created');
    expect(events[1].revision).toBe(1);
  });

  it('records nothing for a refused write', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture(), [{ at: 1, kind: 'list-created', listId: 'list-1' }]);
    const refused = store.write(0, fixture(), [
      { at: 2, kind: 'list-deleted', listId: 'list-1' },
    ]);
    expect(refused.applied).toBe(false);
    expect(store.events(10).map((event) => event.kind)).toEqual(['list-created']);
  });

  it('survives a torn line rather than losing the log', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture(), [{ at: 1, kind: 'list-created', listId: 'list-1' }]);
    fs.appendFileSync(store.eventsPath, '{"kind":"entry-add\n', 'utf8');
    store.write(1, fixture(), [{ at: 3, kind: 'entry-added', entryId: 'entry-1' }]);

    const kinds = store.events(10).map((event) => event.kind);
    expect(kinds).toContain('list-created');
    expect(kinds).toContain('entry-added');
  });

  it('caps the log so an append-only file cannot grow without bound', () => {
    const store = createReadingListsStore(root);
    const line = `${JSON.stringify({ at: 1, kind: 'entry-added', revision: 1 })}\n`;
    fs.mkdirSync(path.dirname(store.eventsPath), { recursive: true });
    fs.writeFileSync(store.eventsPath, line.repeat(READING_LISTS_EVENT_LIMIT + 40), 'utf8');
    store.write(0, fixture(), [{ at: 2, kind: 'list-created', listId: 'list-1' }]);

    const lines = fs.readFileSync(store.eventsPath, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(READING_LISTS_EVENT_LIMIT);
    // Trimming keeps the NEWEST: the mutation just written must still be there.
    expect(store.events(1)[0].kind).toBe('list-created');
  });
});

describe('the write is atomic', () => {
  it('leaves no temporary file behind', () => {
    const store = createReadingListsStore(root);
    store.write(0, fixture());
    const strays = fs.readdirSync(root).filter((name) => name.endsWith('.tmp'));
    expect(strays).toEqual([]);
  });
});
