// @vitest-environment node
/**
 * Handler behaviour for the Reading Lists bridge.
 *
 * The store's own suite proves what reaches disk. What is pinned here is the part
 * only the boundary can get wrong, and it is P0's second acceptance condition —
 * "two windows agree":
 *
 *   · a write pushes the whole snapshot to every OTHER window, and skips the one
 *     that made it, which already has the handler's return value;
 *   · a REFUSED write pushes nothing, because the document did not move and a
 *     conflict must not look like a change to surfaces that are already correct;
 *   · a malformed request is refused at the boundary rather than normalized. A
 *     write with no `baseRevision` would otherwise be defaulted into a blind
 *     overwrite, which is the exact failure compare-and-swap exists to prevent.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  id: number;
  destroyed: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  duplicates: [] as string[],
  windows: [] as FakeWindow[],
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      if (registry.handlers.has(channel)) registry.duplicates.push(channel);
      else registry.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        id: window.id,
        send: (channel: string, payload: unknown) => window.sent.push({ channel, payload }),
      },
    })),
  },
}));

import {
  READING_LISTS_CHANNELS,
  type ReadingListsEventsResult,
  type ReadingListsResult,
} from '../../shared/readingListsBridge';
import { emptyReadingListsDocument } from '../../shared/readingLists';
import { createReadingListsStore, type ReadingListsStore } from '../readingListsStore';
import { broadcastReadingLists, registerReadingListsIpc } from '../readingListsIpc';

let root = '';
let store: ReadingListsStore;

const invoke = <T>(channel: string, sender: unknown, ...args: unknown[]): T => {
  const handler = registry.handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({ sender }, ...args) as T;
};

function makeWindow(id: number): FakeWindow {
  const window: FakeWindow = { id, destroyed: false, sent: [] };
  registry.windows.push(window);
  return window;
}

function document(name: string) {
  return {
    ...emptyReadingListsDocument(),
    lists: [
      {
        id: 'list-1',
        name,
        kind: 'pool' as const,
        createdAt: 1,
        updatedAt: 1,
        entries: [],
        imports: [],
      },
    ],
  };
}

beforeEach(() => {
  registry.handlers.clear();
  registry.duplicates.length = 0;
  registry.windows.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-reading-lists-ipc-'));
  store = createReadingListsStore(root);
  registerReadingListsIpc(() => store);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('registration', () => {
  it('registers each channel exactly once', () => {
    expect(registry.duplicates).toEqual([]);
    expect([...registry.handlers.keys()].sort()).toEqual(
      [
        READING_LISTS_CHANNELS.load,
        READING_LISTS_CHANNELS.write,
        READING_LISTS_CHANNELS.events,
      ].sort(),
    );
  });
});

describe('load', () => {
  it('serves the document and its health', () => {
    const result = invoke<ReadingListsResult>('readingLists:load', null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.health.state).toBe('empty');
    expect(result.applied).toBe(true);
  });

  it('returns a code, never a message that could name a user-data path', () => {
    registry.handlers.clear();
    registerReadingListsIpc(() => {
      throw new Error(`ENOENT: ${root}\\reading-lists.json`);
    });
    const result = invoke<ReadingListsResult>('readingLists:load', null);
    expect(result).toEqual({ ok: false, code: 'read-failed' });
  });
});

describe('write', () => {
  it('pushes the new snapshot to every window except the one that wrote it', () => {
    const author = makeWindow(1);
    const other = makeWindow(2);

    const result = invoke<ReadingListsResult>(
      'readingLists:write',
      { id: author.id },
      { baseRevision: 0, document: document('from Kenji') },
    );
    expect(result.ok && result.applied).toBe(true);

    expect(author.sent).toEqual([]);
    expect(other.sent).toHaveLength(1);
    expect(other.sent[0].channel).toBe('readingLists:changed');
    // The WHOLE snapshot, so the second window renders without a round trip.
    const payload = other.sent[0].payload as { document: { lists: { name: string }[] } };
    expect(payload.document.lists[0].name).toBe('from Kenji');
  });

  it('pushes nothing when the write is refused', () => {
    const first = makeWindow(1);
    const second = makeWindow(2);
    invoke<ReadingListsResult>(
      'readingLists:write',
      { id: first.id },
      { baseRevision: 0, document: document('from Kenji') },
    );
    second.sent.length = 0;

    const stale = invoke<ReadingListsResult>(
      'readingLists:write',
      { id: second.id },
      { baseRevision: 0, document: document('overwritten') },
    );
    // A refusal is a success with `applied: false`: the caller is handed the
    // current document to re-apply against, not an error to surface.
    expect(stale.ok).toBe(true);
    if (!stale.ok) return;
    expect(stale.applied).toBe(false);
    expect(stale.snapshot.document.lists[0].name).toBe('from Kenji');
    expect(first.sent).toEqual([]);
    expect(second.sent).toEqual([]);
  });

  it('refuses a request with no revision token instead of defaulting one', () => {
    const result = invoke<ReadingListsResult>(
      'readingLists:write',
      null,
      { document: document('no token') },
    );
    expect(result).toEqual({ ok: false, code: 'invalid-request' });
    // And nothing reached the store.
    expect(store.read().document.lists).toEqual([]);
  });

  it('refuses a request with no document', () => {
    expect(invoke<ReadingListsResult>('readingLists:write', null, { baseRevision: 0 }))
      .toEqual({ ok: false, code: 'invalid-request' });
  });

  it('refuses a malformed document instead of normalizing it into a wipe', () => {
    // Boss audit 2026-09-05, Finding 1, the write half. The guard accepted any
    // object, and `write` normalizes what it is given — so a caller holding the
    // CORRECT revision could commit `{}` and erase every list, applied and
    // broadcast as a healthy write. The refusal has to happen at the seam.
    store.write(0, document('from Kenji'));
    expect(store.read().document.lists).toHaveLength(1);

    for (const malformed of [{}, [], { revision: 1 }, { lists: {} }]) {
      expect(
        invoke<ReadingListsResult>('readingLists:write', null, {
          baseRevision: 1,
          document: malformed,
        }),
        `${JSON.stringify(malformed)} was accepted as a document`,
      ).toEqual({ ok: false, code: 'invalid-request' });
    }

    // The list survived every one of them.
    expect(store.read().document.lists).toHaveLength(1);
    expect(store.read().document.revision).toBe(1);
  });

  it('refuses a document-SHAPED write whose every list would normalize away', () => {
    // Boss audit 2026-09-05 attempt 4, Finding 3, attack C. The guard above only
    // asked for the document shape, so `{lists:[{name:'no id'}]}` passed it and
    // `write` returned `applied:true` with zero lists — the caller believes it
    // sent a list, and the store commits and broadcasts the erasure.
    store.write(0, document('from Kenji'));
    expect(store.read().document.lists).toHaveLength(1);

    for (const malformed of [
      { lists: [{ name: 'no id' }] },
      { schemaVersion: 1, revision: 7, works: [], lists: [{ name: 'from Kenji' }, { name: 'B' }] },
      { revision: 7, lists: [1, 2, 'x', null] },
    ]) {
      expect(
        invoke<ReadingListsResult>('readingLists:write', null, {
          baseRevision: 1,
          document: malformed,
        }),
        `${JSON.stringify(malformed)} was accepted as a document`,
      ).toEqual({ ok: false, code: 'invalid-request' });
    }

    expect(store.read().document.lists).toHaveLength(1);
    expect(store.read().document.revision).toBe(1);
  });

  it('still accepts a genuinely empty library, which is not malformed', () => {
    // The control on the guard: `{lists: []}` is a user who deleted their last
    // list, and refusing it would make the product unable to reach empty.
    store.write(0, document('from Kenji'));
    const cleared = invoke<ReadingListsResult>('readingLists:write', null, {
      baseRevision: 1,
      document: { schemaVersion: 1, revision: 1, lists: [], works: [] },
    });
    expect(cleared.ok).toBe(true);
    expect(store.read().document.lists).toEqual([]);
  });

  it('skips a destroyed window rather than throwing into the handler', () => {
    const gone = makeWindow(2);
    gone.destroyed = true;
    const result = invoke<ReadingListsResult>(
      'readingLists:write',
      { id: 1 },
      { baseRevision: 0, document: document('from Kenji') },
    );
    expect(result.ok).toBe(true);
    expect(gone.sent).toEqual([]);
  });
});

describe('events', () => {
  it('serves the log newest first', () => {
    invoke<ReadingListsResult>(
      'readingLists:write',
      null,
      {
        baseRevision: 0,
        document: document('from Kenji'),
        events: [{ at: 1, kind: 'list-created', listId: 'list-1' }],
      },
    );
    const result = invoke<ReadingListsEventsResult>('readingLists:events', null, { limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0].kind).toBe('list-created');
    expect(result.events[0].revision).toBe(1);
  });
});

describe('a write main made itself', () => {
  it('reaches every window, because none of them asked for it', () => {
    // The completion detector's case: main ticks a book on the `library:setProgress`
    // path with no renderer involved, so there is no origin to skip.
    const a = makeWindow(1);
    const b = makeWindow(2);
    broadcastReadingLists(store.read());
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    expect(a.sent[0].channel).toBe('readingLists:changed');
  });
});
