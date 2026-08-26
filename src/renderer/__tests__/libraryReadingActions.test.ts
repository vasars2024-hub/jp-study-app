/**
 * The Library drawer as the first host of the unified Reading action set.
 *
 * Track 4 asks to "unify planning, import/download, web extraction,
 * comprehension analysis, Novel Reader, progress, dictionary, mining, and Jiten
 * vocabulary actions" instead of per-surface buttons. Two things have to hold
 * for that to be true here, and both are guarded below:
 *
 *   1. the drawer's buttons come from the shared registry — label, icon and
 *      order included — rather than being hand-written for this view;
 *   2. nothing is rendered that this surface cannot actually perform, and
 *      nothing it *can* perform is routed through a mechanism that differs
 *      from the surface that already performed it.
 *
 * `libraryHostedActions` is real logic and is tested as such. The JSX contract
 * is read from source, the same way `libraryShelfLayout.test.ts` does — the
 * view reaches for `window.api` in its first effect and cannot be mounted in
 * jsdom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryHostedActions } from '../utils/libraryShelf';
import {
  READING_WORKSPACE_ACTION_SPECS,
  resolveReadingWorkspaceActions,
} from '../../shared/readingWorkspaceActions';
import { readingWorkspaceEntryFromLibraryItem } from '../../shared/readingWorkspace';
import type { LibraryItem } from '../../shared/types';

const SRC = resolve(__dirname, '../..');
const VIEW = readFileSync(resolve(SRC, 'renderer/views/LibraryView.tsx'), 'utf8');
const NOVELS = readFileSync(resolve(SRC, 'renderer/components/novels/NovelsContent.tsx'), 'utf8');

function book(patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'book-1',
    title: '君の名は。',
    kind: 'book',
    epubFile: 'C:/books/kimi.epub',
    createdAt: 1,
    ...patch,
  } as LibraryItem;
}

describe('libraryHostedActions', () => {
  it('always offers the two things this surface can do for any item', () => {
    expect(libraryHostedActions(book())).toContain('read');
    expect(libraryHostedActions(book())).toContain('dictionary');
    expect(libraryHostedActions({ kind: 'manga', epubFile: undefined })).toEqual([
      'read',
      'dictionary',
    ]);
  });

  it('offers mining only for the books the mining panel would actually list', () => {
    // EpubMiningSimplePanel filters to kind === 'book' with a real .epub.
    expect(libraryHostedActions(book())).toContain('mine');
    expect(libraryHostedActions(book({ epubFile: 'C:/books/scan.pdf' }))).not.toContain('mine');
    expect(libraryHostedActions(book({ epubFile: undefined }))).not.toContain('mine');
    expect(libraryHostedActions({ kind: 'manga', epubFile: 'C:/x/pages.epub' })).not.toContain(
      'mine',
    );
  });

  it('is case-insensitive about the extension, as the panel is', () => {
    expect(libraryHostedActions(book({ epubFile: 'C:/books/KIMI.EPUB' }))).toContain('mine');
  });

  it('claims nothing this surface has no wiring for', () => {
    const hosted = new Set(libraryHostedActions(book()));
    for (const id of ['import', 'extract', 'plan', 'analyze', 'progress', 'jitenVocabulary']) {
      expect(hosted.has(id as never), `Library must not claim ${id}`).toBe(false);
    }
  });
});

describe('what the drawer resolves to', () => {
  it('gives an EPUB three actions, in registry order', () => {
    const item = book();
    const actions = resolveReadingWorkspaceActions(
      readingWorkspaceEntryFromLibraryItem(item),
      libraryHostedActions(item),
    );
    expect(actions.map((a) => a.id)).toEqual(['read', 'dictionary', 'mine']);
    expect(actions[0].primary).toBe(true);
  });

  it('drops mining for a manga, because a page scan has no text to mine', () => {
    const item = book({ kind: 'manga', epubFile: undefined, pageCount: 17 });
    const actions = resolveReadingWorkspaceActions(
      readingWorkspaceEntryFromLibraryItem(item),
      libraryHostedActions(item),
    );
    expect(actions.map((a) => a.id)).toEqual(['read', 'dictionary']);
  });
});

describe('the drawer renders the registry, not its own buttons', () => {
  it('declares the view header through the shared contextual surface seam', () => {
    expect(VIEW).toContain("import { ContextualSurface } from '../components/liquid/LiquidSurface';");
    expect(VIEW).toContain('<ContextualSurface as="header" className="view-head">');
    expect(VIEW).toContain('</ContextualSurface>');
    expect(VIEW).not.toContain('<header className="view-head">');
  });

  it('maps the resolved set instead of hand-writing a button row', () => {
    expect(VIEW).toContain('resolveReadingWorkspaceActions(');
    expect(VIEW).toContain('readingWorkspaceEntryFromLibraryItem(selectedItem)');
    expect(VIEW).toContain('libraryHostedActions(selectedItem)');
    // Label, icon, prominence and identity all come from the spec.
    expect(VIEW).toContain('{t(action.labelKey)}');
    expect(VIEW).toContain('name={action.icon as');
    expect(VIEW).toContain("variant={action.primary ? 'primary' : undefined}");
    expect(VIEW).toContain('data-reading-action={action.id}');
  });

  it('no longer hard-codes the old single Open button in the drawer', () => {
    // `library.open` survives elsewhere in the view (the grid card menu); what
    // must be gone is the drawer's own primary button built around it.
    expect(VIEW).not.toContain(
      '<Button variant="primary" leftIcon={<Icon name="novels" size={14} />} onClick={() => onOpen(selectedItem)}>',
    );
  });

  it('keeps shelf management out of the shared set', () => {
    // Set-cover and remove are Library housekeeping, not Reading actions, and
    // no registry id covers them.
    expect(READING_WORKSPACE_ACTION_SPECS.map((s) => s.id)).not.toContain('remove');
    expect(VIEW).toContain("t('library.card.setCoverTitle')");
    expect(VIEW).toContain("t('common.remove')");
  });
});

describe('unifying the set does not fork the mechanism', () => {
  it('mines through the exact handoff Novels already dispatches', () => {
    for (const line of [
      "setHandoffJson('epubMining', { bookId",
      "new CustomEvent('os:open', { detail: 'flashcards' })",
      "new CustomEvent('flashcards:openEpubMining')",
    ]) {
      expect(VIEW, `LibraryView must reuse ${line}`).toContain(line);
    }
    expect(NOVELS).toContain("setHandoffJson('epubMining', { bookId");
    expect(NOVELS).toContain("new CustomEvent('os:open', { detail: 'flashcards' })");
    expect(NOVELS).toContain("new CustomEvent('flashcards:openEpubMining')");
  });

  it('looks words up through the global dictionary overlay channel', () => {
    expect(VIEW).toContain("new CustomEvent('dict:lookup', { detail: { query } })");
    const overlay = readFileSync(
      resolve(SRC, 'renderer/components/GlobalDictionaryOverlay.tsx'),
      'utf8',
    );
    expect(overlay).toContain("window.addEventListener('dict:lookup'");
  });

  it('does not dispatch a lookup with an empty query', () => {
    expect(VIEW).toContain('if (query) window.dispatchEvent');
  });

  it('looks up the same title the applicability rule accepted', () => {
    // `readingWorkspaceActionApplies('dictionary')` is true when
    // `titleNative || title` is non-empty; dispatching anything else would
    // make the rule and the behaviour disagree.
    expect(VIEW).toContain('(work.titleNative || work.title).trim()');
  });
});
