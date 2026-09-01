// @vitest-environment jsdom
/**
 * MINING gate 10 — "One Mining surface hosts the catalogue, replacing the
 * epub-only 'simple mining' entry point without losing any capability it had."
 *
 * Two halves, and this file proves both against the real component:
 *
 * 1. The Mining surface is no longer epub-only. The catalogue lists a
 *    transcript and a subtitle file beside the book, and mines any of them
 *    through the same chain the Files app uses — no epub involved.
 * 2. Nothing was lost. The three EPUB tabs are still rendered by
 *    `FlashcardsContent`, which `filesAppRouteParity.test.ts` also re-derives
 *    from the `action:mine.book` row.
 *
 * The controls are the point in each case: a filter that shows everything is
 * not a filter, and a machine-origin mark that appears on every row is not a
 * mark. Both are checked against a row that must NOT carry them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MiningCataloguePanel from '../components/MiningCataloguePanel';
import {
  countByCategory,
  deriveCrossStoreFlags,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';

const added: unknown[][] = [];
const removed: string[][] = [];

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [],
  addDeckCardsTracked: (drafts: unknown[]) => {
    added.push(drafts);
    return drafts.map((_, i) => ({ id: `card-${i}` }));
  },
  removeDeckCards: (ids: string[]) => {
    removed.push(ids);
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

async function unmount(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

function all(selector: string): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>(selector) ?? []);
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function rowNames(): string[] {
  return all('.mining-catalogue-name').map((el) => el.textContent ?? '');
}

/** Source with comments removed, so a scan cannot be satisfied by prose. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

function chip(label: string): HTMLElement | undefined {
  return all('.mining-catalogue-chip').find((b) => (b.textContent ?? '').startsWith(label));
}

/* --------------------------- the fixture --------------------------- */

function item(
  over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId'>,
): FilesItem {
  return {
    provenance: 'unknown',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'derived', describes: 'test' },
    flags: {},
    source: 'test',
    ...over,
  };
}

const TRANSCRIPT = item({
  id: 'transcript:abc',
  name: 'a whispered talk',
  kind: 'transcript',
  categoryId: 'sources/text',
  provenance: 'whisper-transcript',
  location: { store: 'file', path: 'C:\\p\\abc.json' },
});

const SUBTITLE = item({
  id: 'subs:1',
  name: 'episode 39.ja.ass',
  kind: 'subtitle',
  categoryId: 'sources/text',
  provenance: 'human-subs',
  sizeBytes: 4096,
  location: { store: 'file', path: 'C:\\p\\ep39.ja.ass' },
});

const BOOK = item({
  id: 'library:b1',
  name: 'a novel',
  kind: 'book',
  categoryId: 'sources/books',
  provenance: 'book-text',
  location: { store: 'file', path: 'C:\\p\\book.epub' },
});

/** Present so the panel has something it must REFUSE to list. */
const VIDEO = item({
  id: 'media:1',
  name: 'the video itself.mkv',
  kind: 'video',
  categoryId: 'sources/video',
  location: { store: 'file', path: 'C:\\p\\video.mkv' },
});

const ALL = [TRANSCRIPT, SUBTITLE, BOOK, VIDEO];

function snapshot(items: FilesItem[]): FilesIndexSnapshot {
  const derived = deriveCrossStoreFlags(items);
  return {
    items: derived,
    counts: countByCategory(derived),
    enumerators: [{ source: 'test', itemCount: derived.length, elapsedMs: 1 }],
    builtAt: Date.now(),
  };
}

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();
const filesMineSource = vi.fn();

beforeEach(() => {
  localStorage.clear();
  added.length = 0;
  removed.length = 0;
  filesIndex.mockReset();
  filesIndex.mockImplementation(async () => snapshot(ALL));
  filesMineSource.mockReset();
  filesMineSource.mockImplementation(async () => ({
    ok: true,
    readCount: 2,
    passages: [
      { text: '猫が好きです', index: 0 },
      { text: '犬も好きです', index: 1 },
    ],
  }));
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesIndex, filesMineSource },
  });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe('gate 10 — the Mining surface stops being epub-only', () => {
  it('lists the transcript and the subtitle beside the book, and refuses the video', async () => {
    await mount(<MiningCataloguePanel />);
    expect(rowNames().sort()).toEqual(['a novel', 'a whispered talk', 'episode 39.ja.ass']);
    // The control: the video is IN the index and is deliberately absent, so the
    // list is a mineability judgement and not "everything the index holds".
    expect(rowNames()).not.toContain('the video itself.mkv');
  });

  it('mines a transcript end to end without an epub anywhere in the chain', async () => {
    await mount(<MiningCataloguePanel />);
    const row = all('.mining-catalogue-row').find(
      (r) => r.querySelector('.mining-catalogue-name')?.textContent === 'a whispered talk',
    );
    await click(row?.querySelector('.mining-catalogue-mine'));

    expect(filesMineSource).toHaveBeenCalledTimes(1);
    expect(filesMineSource.mock.calls[0][1]).toBe('transcript');
    expect(added).toHaveLength(1);
    expect(added[0]).toHaveLength(2);

    const receipt = host?.querySelector('.mining-catalogue-receipt');
    expect(receipt?.textContent).toContain('2');
    // Transcript-derived material must SAY so. This is the plan's binding
    // constraint, and the control below is a human-subtitle row that must not.
    expect(host?.querySelector('.mining-catalogue-machine')).toBeTruthy();
  });

  it('control: a human-subtitle mine carries no machine-derived mark', async () => {
    await mount(<MiningCataloguePanel />);
    const row = all('.mining-catalogue-row').find(
      (r) => r.querySelector('.mining-catalogue-name')?.textContent === 'episode 39.ja.ass',
    );
    await click(row?.querySelector('.mining-catalogue-mine'));

    expect(added).toHaveLength(1);
    expect(host?.querySelector('.mining-catalogue-machine')).toBeNull();
  });

  it('undoes a mine through the same chain the Files app uses', async () => {
    await mount(<MiningCataloguePanel />);
    await click(all('.mining-catalogue-mine')[0]);
    await click(
      all('.mining-catalogue-refresh').find((b) => (b.textContent ?? '').includes('Undo')),
    );
    expect(removed).toEqual([['card-0', 'card-1']]);
  });

  it('a refusal names its reason instead of reporting zero cards', async () => {
    filesMineSource.mockImplementation(async () => ({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.brokenLink',
    }));
    await mount(<MiningCataloguePanel />);
    await click(all('.mining-catalogue-mine')[0]);
    const receipt = host?.querySelector('.mining-catalogue-receipt.refused');
    expect(receipt?.textContent).toContain('missing');
    expect(added).toHaveLength(0);
  });
});

describe('gate 10 — provenance is the primary axis, and empty categories say so', () => {
  it('filters on provenance and the counts match the list they open', async () => {
    await mount(<MiningCataloguePanel />);
    // Every provenance is offered WITH ITS COUNT, including the ones at zero.
    expect(chip('Auto captions')?.textContent).toContain('(0)');
    expect(chip('Auto captions')?.dataset.empty).toBe('true');
    expect(chip('Human subtitles')?.textContent).toContain('(1)');

    await click(chip('Human subtitles'));
    expect(rowNames()).toEqual(['episode 39.ja.ass']);
    // Control: a filter that shows everything is not a filter.
    expect(rowNames()).not.toContain('a novel');

    await click(chip('Whisper transcript'));
    expect(rowNames()).toEqual(['a whispered talk']);
  });

  it('the media filter is secondary and recomputes the provenance counts', async () => {
    await mount(<MiningCataloguePanel />);
    expect(chip('Book text')?.textContent).toContain('(1)');
    await click(chip('Subtitles'));
    // Narrowed to subtitle files, the book-text count must fall to 0 — a count
    // that did not move would be describing a different set than the list.
    expect(chip('Book text')?.textContent).toContain('(0)');
    expect(rowNames()).toEqual(['episode 39.ja.ass']);
  });
});

describe('gate 10 — honest states', () => {
  it('an index that failed to read is not an empty list', async () => {
    filesIndex.mockImplementation(async () => {
      throw new Error('dict.db is locked');
    });
    await mount(<MiningCataloguePanel />);
    expect(host?.querySelector('.mining-catalogue-error')).toBeTruthy();
    expect(host?.textContent).toContain('dict.db is locked');
    expect(host?.querySelector('.mining-catalogue-list')).toBeNull();
  });

  it('a genuinely empty index says what to do, and does not read as an error', async () => {
    filesIndex.mockImplementation(async () => snapshot([VIDEO]));
    await mount(<MiningCataloguePanel />);
    expect(host?.querySelector('.mining-catalogue-error')).toBeNull();
    expect(host?.textContent).toContain('minable text');
  });

  it('no desktop binding at all is its own state', async () => {
    Object.defineProperty(window, 'api', { configurable: true, writable: true, value: {} });
    await mount(<MiningCataloguePanel />);
    expect(host?.textContent).toContain('desktop app');
  });
});

/**
 * The wiring half, and the "without losing any capability it had" half.
 *
 * Read from the source with COMMENTS STRIPPED, deliberately: this file's own
 * prose names every one of these symbols, and a scan that counted a comment
 * would pass on a panel that was never mounted.
 */
describe('gate 10 — the catalogue is mounted BESIDE the three epub tools', () => {
  const flashcards = code(
    readFileSync(resolve(__dirname, '../components/flashcards/FlashcardsContent.tsx'), 'utf-8'),
  );

  it('renders the catalogue panel', () => {
    expect(flashcards).toContain('<MiningCataloguePanel');
    expect(flashcards).toContain("import MiningCataloguePanel from '../MiningCataloguePanel'");
    expect(flashcards).toContain("epubMiningUi === 'catalogue'");
  });

  it('still renders all three EPUB tools — nothing was replaced', () => {
    for (const symbol of ['<EpubMiningSimplePanel', '<EpubMiningPanel', '<JitenMiningPanel']) {
      expect(flashcards).toContain(symbol);
    }
  });

  it('control: the stripper actually removes comments, so the scan cannot self-satisfy', () => {
    expect(code('// <NotAComponentAtAll\nconst x = 1;\n')).not.toContain('NotAComponentAtAll');
    expect(code('/* <NotAComponentAtAll */\nconst x = 1;\n')).not.toContain('NotAComponentAtAll');
    expect(code('const x = 1;\n')).toContain('const x = 1;');
  });

  it('one mine chain, not two: the panel imports the Files app chain rather than repeating it', () => {
    const panel = code(
      readFileSync(resolve(__dirname, '../components/MiningCataloguePanel.tsx'), 'utf-8'),
    );
    expect(panel).toContain("from './filesapp/filesMineChain'");
    // The chain's own steps must NOT be re-run here — a second copy is how the
    // two surfaces would mine one file to two different results.
    expect(panel).not.toContain('buildFilesMineDrafts');
    expect(panel).not.toContain('addDeckCardsTracked');
    const filesApp = code(
      readFileSync(resolve(__dirname, '../components/filesapp/FilesApp.tsx'), 'utf-8'),
    );
    expect(filesApp).toContain("from './filesMineChain'");
    expect(filesApp).not.toContain('buildFilesMineDrafts');
  });
});
