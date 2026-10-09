// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Files app: the root
 * view, and each top-level scope and a few leaves of the tree (sources, decks,
 * notes, dictionaries, memory, statistics, the study queue).
 */
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, stubBridge } from './helpers/axeHarness';

vi.mock('../flashcardDeck', async (importOriginal) => ({
  ...await importOriginal<typeof import('../flashcardDeck')>(),
  loadDeck: () => [
    { id: 'c1', word: '猫', reading: 'ねこ', meaning: 'cat', addedAt: 1, source: 'import' },
  ],
}));

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [], displayList: [] });
});

afterEach(async () => {
  await cleanup();
  localStorage.clear();
});

const SCOPES = [
  null,
  'sources/books',
  'sources/video',
  'outputs/decks',
  'outputs/notes',
  'reference/dictionaries',
  'system/memory',
  'system/statistics',
  'workspaces/queue',
] as const;

describe('Files — axe-core', () => {
  for (const scope of SCOPES) {
    it(`scope: ${scope ?? 'root'}`, async () => {
      const { FilesApp } = await import('../components/filesapp/FilesApp');
      const { host } = await mount(createElement(FilesApp, { initialScope: scope as never }), 40);
      expect(host.querySelector('.fa-toolbar, [role="toolbar"]'), 'Files chrome painted').not.toBeNull();
      expect(await a11yViolations(host)).toEqual([]);
    });
  }
});
