// @vitest-environment node
/**
 * Two shelves in the media library told the user they had filtered their media away when
 * the truth was they had never put anything there. Found live 2026-09-06 on the user's own
 * 39-item library: clicking **Favorites** emptied the grid to
 * "Nothing here matches the current filter." with the search box empty and the type chip
 * back on All — and the CONTROL, a genuine search miss on the Home shelf, produced the
 * byte-identical sentence. The two states were indistinguishable.
 *
 * `pickEmptyShelf` is the seam that separates them: it reads the count of files the SHELF
 * covers, which is computed before the search and the chip are applied.
 *
 * The i18n half is tested here too, because a shelf-specific empty state whose keys are
 * missing from one catalog is exactly as unhelpful as the sentence it replaced.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pickEmptyShelf } from '../components/media/library/MediaLibraryShell';
import type { LibraryScope } from '../components/media/library/MediaLibrarySidebar';

const shelf = (id: string): LibraryScope => ({ kind: 'shelf', id } as LibraryScope);

describe('pickEmptyShelf', () => {
  it('names the shelf when the shelf itself holds nothing', () => {
    // The measured live state: 39 files in the library, 0 of them favourited.
    expect(pickEmptyShelf(shelf('favorites'), 0, 39)).toBe('favorites');
    expect(pickEmptyShelf(shelf('queue'), 0, 39)).toBe('queue');
    expect(pickEmptyShelf(shelf('continue'), 0, 39)).toBe('continue');
  });

  it('stays out of the way when the shelf HAS files and a filter emptied the grid', () => {
    // This is the case "nothing matches the current filter" is actually about, and the
    // reason the fix cannot simply replace that string: 4 files are part-watched, the
    // search matched none of them.
    expect(pickEmptyShelf(shelf('favorites'), 3, 39)).toBeNull();
    expect(pickEmptyShelf(shelf('continue'), 4, 39)).toBeNull();
  });

  it('leaves the empty LIBRARY its own state, which offers the import buttons', () => {
    expect(pickEmptyShelf(shelf('favorites'), 0, 0)).toBeNull();
  });

  it('claims no shelf that cannot be empty on its own', () => {
    // `home` and `recent` show everything, so a zero there IS the empty library; the rail
    // lists a category or a collection only once something is in it; `tracking` renders a
    // dashboard rather than the grid.
    expect(pickEmptyShelf(shelf('home'), 0, 39)).toBeNull();
    expect(pickEmptyShelf(shelf('recent'), 0, 39)).toBeNull();
    expect(pickEmptyShelf(shelf('tracking'), 0, 39)).toBeNull();
    expect(pickEmptyShelf({ kind: 'category', id: 'anime' } as LibraryScope, 0, 39)).toBeNull();
    expect(pickEmptyShelf({ kind: 'collection', id: 'Temp' } as LibraryScope, 0, 39)).toBeNull();
  });
});

describe('the shelf-empty strings exist in every catalog', () => {
  const CATALOGS = resolve(__dirname, '..', '..', 'shared', 'i18n', 'catalogs');
  const KEYS = (['favorites', 'queue', 'continue'] as const)
    .flatMap((id) => [`media.shelfEmpty.${id}.title`, `media.shelfEmpty.${id}.hint`]);

  for (const lang of ['en', 'ja', 'zh', 'ru']) {
    it(`${lang} carries all six`, () => {
      const src = readFileSync(resolve(CATALOGS, `${lang}.ts`), 'utf8');
      for (const key of KEYS) expect(src, `${lang} is missing ${key}`).toContain(`'${key}'`);
    });
  }

  it('the browser still keeps the filter sentence for a real filter miss', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'components', 'media', 'library', 'MediaLibraryBrowser.tsx'),
      'utf8',
    );
    expect(src).toContain("t('media.browser.noMatch')");
    // The grid is REPLACED by this node, so the change has to be announced.
    expect(src).toMatch(/className="medialib-empty"\s+role="status"/);
  });
});
