// @vitest-environment jsdom
/**
 * a11y — axe-core over the "Sync with Anki" panel (Study OS and Blanc mount the
 * same component), in its busiest state: a paused sync with its explanation and
 * re-bind action, answers waiting, and a per-deck table.
 */
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/db')>()),
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, value);
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(idb.get(key));
    if (next !== undefined) idb.set(key, next);
    return idb.get(key);
  },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge, type Mounted } from './helpers/axeHarness';

let app: Mounted;

beforeAll(async () => {
  installJsdomShims();
  stubBridge({ ankiLinkState: { state: 'connected', consecutiveFailures: 0 } });
  idb.set('anki-sync-state-v1', {
    boundProfile: 'User 1',
    seenProfile: 'User 2',
    answeredTotal: 3,
    unlinked: [{ cardId: 'x', word: '鳥', at: 1 }],
    outboxCount: 2,
    pullCursor: 0,
    lastSyncAt: Date.UTC(2026, 9, 8, 10),
    lastError: { kind: 'profile-mismatch', detail: 'User 1 -> User 2', at: 2 },
  });
  idb.set('anki-review-outbox-v1', {
    r1: { reviewId: 'r1', cardId: 'a', noteId: 1, ease: 3, reviewedAt: Date.now(), queuedAt: Date.now(), attempts: 0 },
  });
  const { addDeckCardsTracked } = await import('../flashcardDeck');
  addDeckCardsTracked([
    { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'dictionary', ankiNoteId: 1, ankiExported: true, ankiDeck: 'Mining' },
    { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'dictionary', ankiPending: true, ankiDeck: 'Mining' },
  ]);
  const { default: AnkiSyncStatus } = await import('../components/anki/AnkiSyncStatus');
  app = await mount(createElement(AnkiSyncStatus), 120);
  await settle(60);
}, 60_000);

afterAll(async () => {
  await cleanup();
});

describe('Sync with Anki — axe-core', () => {
  it('explains a paused sync, offers the re-bind, and lists the decks without violations', async () => {
    const text = app.host.textContent ?? '';
    expect(text).toContain('User 2');
    expect(text).toContain('1 answer waiting');
    expect(text).toContain('1 card waiting');
    expect(app.host.querySelector('[role="alert"] button')?.textContent).toContain('User 2');
    expect(app.host.querySelector('table caption')).not.toBeNull();
    expect(await a11yViolations(app.host)).toEqual([]);
  });
});
