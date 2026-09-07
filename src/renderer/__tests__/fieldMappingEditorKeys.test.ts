/**
 * D233 — `src/shared/i18n/miningUi/` was written, translated into all four
 * languages, imported into all four catalogs, and then never called.
 *
 * 92 keys, of which 77 had ZERO consumers anywhere in the renderer: `fm.*` 36,
 * `jiten.*` 33, `cardPreview.*` 8. Meanwhile `FieldMappingEditor.tsx` rendered
 * the same 36 English sentences as literals, a few lines from a `useT()` it
 * already held. This is CLAUDE.md's own warning realised — "a new i18n module
 * is invisible until something actually imports/wires it, and key-count checks
 * alone will not catch that" — and `i18n-orphan-key-check` had all 77 parked in
 * its baseline, counted but never acted on.
 *
 * So the fix added NOT ONE KEY. It connected the two halves.
 *
 * This file guards the connection: every `fm.*` key the catalogs carry must be
 * reachable from the component, and the component must not ask for one the
 * catalogs cannot answer. Either direction failing puts the module back where
 * it was.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';
import { translate } from '../../shared/i18n/core';

const REPO = resolve(__dirname, '../../..');
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

const SOURCE = readFileSync(
  resolve(REPO, 'src/renderer/components/FieldMappingEditor.tsx'),
  'utf8',
)
  // Comments out: a key named in prose must not count as a consumer. This repo
  // has a recorded case of exactly that scoring a source ratchet green.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Keys the component actually asks for, read out of `t('…')` calls. */
function requestedKeys(): string[] {
  const out = new Set<string>();
  for (const m of SOURCE.matchAll(/\bt\(\s*'(fm\.[a-zA-Z0-9.]+)'/g)) out.add(m[1]);
  return [...out].sort();
}

/** Keys the catalog defines. */
function catalogKeys(lang: (typeof LANGS)[number]): string[] {
  return Object.keys(catalogFor(lang))
    .filter((k) => k.startsWith('fm.'))
    .sort();
}

beforeAll(async () => {
  for (const lang of LANGS) await ensureCatalog(lang);
});

describe('the fm.* module and its consumer are connected in both directions', () => {
  it('asks for a real number of keys, not a token one', () => {
    // The guard against a "fix" that wires two keys and leaves 34 orphaned.
    expect(requestedKeys().length).toBeGreaterThanOrEqual(30);
  });

  it('asks for nothing the English catalog cannot answer', () => {
    const en = catalogFor('en');
    for (const key of requestedKeys()) {
      expect(typeof en[key], `en cannot answer ${key}`).toBe('string');
    }
  });

  it('leaves no fm.* key without a consumer', () => {
    const requested = new Set(requestedKeys());
    const orphaned = catalogKeys('en').filter((k) => !requested.has(k));
    expect(orphaned, `these fm.* keys went back to having no consumer`).toEqual([]);
  });

  it.each(LANGS)('answers every requested key in %s, with no English left behind', (lang) => {
    const catalog = catalogFor(lang);
    const en = catalogFor('en');
    for (const key of requestedKeys()) {
      const value = catalog[key];
      expect(typeof value, `${lang} cannot answer ${key}`).toBe('string');
      if (lang !== 'en') {
        expect(value, `${lang}'s ${key} is still the English string`).not.toBe(en[key]);
      }
    }
  });

  /**
   * Six of them carry slots. A translation that drops one loses the number or
   * the field name from the sentence, and no catalog check would see it.
   * `fallback: {}` so a key missing from the active catalog surfaces as itself
   * rather than silently resolving through English.
   */
  const SLOTTED: Array<[string, Record<string, string | number>, string[]]> = [
    ['fm.summary.mapped', { mapped: 3, total: 7 }, ['3', '7']],
    ['fm.title.translatedTo', { base: 'expression', lang: 'Russian' }, ['expression', 'Russian']],
    ['fm.field.fallbackSuffix', { field: 'Word' }, ['Word']],
  ];

  /**
   * NOT slotted, and the distinction cost a test run: `fm.summary.palette`
   * reads "Insert {placeholders} into fields" and `fm.placeholder.fallbackEg`
   * reads "e.g. {expression:ru}". Those braces are the literal syntax the user
   * types into a field — the string is ABOUT placeholders. All four catalogs
   * correctly keep them verbatim, so a raw-slot assertion here would demand
   * they be broken.
   */
  const BRACES_ARE_CONTENT = ['fm.summary.palette', 'fm.placeholder.fallbackEg'];

  it.each(LANGS)('keeps the literal braces in %s, where they are the content', (lang) => {
    for (const key of BRACES_ARE_CONTENT) {
      const rendered = translate(key, {}, { lang, catalog: catalogFor(lang), fallback: {} });
      expect(rendered, `${lang} lost the brace syntax from ${key}`).toMatch(/\{/);
    }
  });

  it.each(LANGS)('fills every slot in %s', (lang) => {
    for (const [key, vars, expected] of SLOTTED) {
      const rendered = translate(key, vars, { lang, catalog: catalogFor(lang), fallback: {} });
      expect(rendered, `${lang} never answered ${key}`).not.toBe(key);
      expect(rendered, `${lang} printed a raw slot in ${key}`).not.toMatch(/\{[a-z]+\}/i);
      for (const value of expected) {
        expect(rendered, `${lang} dropped "${value}" from ${key}`).toContain(value);
      }
    }
  });

  /**
   * The status messages are the half the scanners could never see — they are
   * built inside an event handler and passed to `onMessage`, not rendered in a
   * scored JSX position. CLAUDE.md names this shape explicitly.
   */
  it('routes the four onMessage strings through the catalog', () => {
    for (const key of ['fm.msg.saved', 'fm.msg.saveFailed', 'fm.msg.reverted', 'fm.msg.resetFailed']) {
      expect(SOURCE, `${key} is not used`).toContain(`t('${key}')`);
    }
    for (const literal of [
      "'Field mapping saved.'",
      "'Could not save the field mapping.'",
      "'Reverted to automatic mapping.'",
      "'Could not reset the field mapping.'",
    ]) {
      expect(SOURCE, `the literal ${literal} is back`).not.toContain(literal);
    }
  });
});
