// @vitest-environment node
/**
 * The readers must stay out of the boot preload set (audit robust #6): the
 * packaged index.html preloaded NovelReader (450 KB) and MangaReader chunks
 * because App.tsx and FocusShell.tsx imported them statically. A module that is
 * statically imported ANYWHERE in the entry graph is preloaded even if it is
 * also lazy elsewhere, so this checks the two entry-graph importers — a source
 * guard, because the property is about the import graph, not runtime behaviour.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC_READER_IMPORT = /^\s*import\s+[^;]*from\s+['"][./]+(?:views\/)?(?:NovelReader|MangaReader)['"]/m;

describe('boot graph', () => {
  for (const file of ['../App.tsx', '../components/FocusShell.tsx']) {
    it(`${file} loads the readers lazily`, () => {
      const src = readFileSync(resolve(__dirname, file), 'utf8');
      expect(src).not.toMatch(STATIC_READER_IMPORT);
      expect(src).toMatch(/lazy\(\(\) => import\(['"][./]+views\/NovelReader['"]\)\)/);
      expect(src).toMatch(/lazy\(\(\) => import\(['"][./]+views\/MangaReader['"]\)\)/);
    });
  }
});
