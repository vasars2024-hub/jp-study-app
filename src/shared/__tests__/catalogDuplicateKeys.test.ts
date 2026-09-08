/**
 * No key may be defined twice for the same language.
 *
 * **Why a source scan and not an object check.** `catalogs/<lang>.ts` is not the
 * whole catalog: it spreads six module catalogs (`gameArena`, `scraperUi`,
 * `malSync`, `miningUi`, `mooncapLore`, `grammarTaxonomy`) and then continues
 * with its own literals. A duplicate is therefore invisible at runtime — the
 * later definition silently wins and `Object.keys()` shows one entry — so any
 * check that inspects the composed object can never see it.
 *
 * Two real incidents motivated this. A session added a `novels.*` block without
 * noticing the namespace already existed further down the same file (esbuild's
 * duplicate-key warning was the only signal). A later one grepped
 * `catalogs/*.ts` for `games.def.*`, found nothing, concluded the keys were
 * missing, and re-added all 30 — they lived in `gameArena/` the whole time, and
 * because the inline literals come *after* the spreads, the re-added copies
 * silently overrode the established translations.
 *
 * Grepping one file is not enough, and the runtime object cannot tell you. This
 * reads every source that contributes to a language and compares definitions.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_LANGS } from '../i18n/core';

const I18N_ROOT = join(__dirname, '..', 'i18n');
/** `  'some.key':` — the form every catalog entry is written in. */
const KEY_LINE = /^\s+'([^']+)':/;

function sourcesFor(lang: string): string[] {
  const files = [join(I18N_ROOT, 'catalogs', `${lang}.ts`)];
  for (const entry of readdirSync(I18N_ROOT)) {
    if (entry === 'catalogs') continue;
    const dir = join(I18N_ROOT, entry);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, `${lang}.ts`);
    if (existsSync(file)) files.push(file);
  }
  return files;
}

describe('catalog duplicate keys', () => {
  for (const lang of UI_LANGS) {
    it(`defines every ${lang} key exactly once`, () => {
      const where = new Map<string, string[]>();
      for (const file of sourcesFor(lang)) {
        const name = file.slice(file.indexOf('i18n'));
        readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
          const key = KEY_LINE.exec(line)?.[1];
          if (!key) return;
          const list = where.get(key) ?? [];
          list.push(`${name}:${index + 1}`);
          where.set(key, list);
        });
      }
      const duplicates = [...where.entries()]
        .filter(([, sites]) => sites.length > 1)
        .map(([key, sites]) => `${key} → ${sites.join(' | ')}`);
      expect(where.size, 'the scan actually found keys').toBeGreaterThan(1000);
      expect(duplicates, 'no key is defined twice for this language').toEqual([]);
    });
  }
});
