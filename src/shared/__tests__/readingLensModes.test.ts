// @vitest-environment node
/**
 * The lens mode buttons name their text with a template key.
 *
 * Both lens surfaces render `t(\`lens.mode.${mode}\`)` and
 * `t(\`lens.mode.${mode}.hint\`)`. A template key is invisible to
 * `tools/i18n-missing-key-check.cjs` by design, so without this file adding a
 * mode to `READING_LENS_MODES` would ship the raw string `lens.mode.whatever`
 * onto the button and every gate would still pass — exactly the failure
 * `agentNavigation.test.ts` compensates for on the navigation error codes.
 *
 * The catalogs are read as **source text** rather than imported, for the reason
 * that file records: importing `catalogs/en` pulls in split modules that exist
 * only as uncommitted files in some trees, which passes dirty and fails on the
 * commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { READING_LENS_MODES } from '../readingLens';

const CATALOG_DIR = path.resolve(__dirname, '..', 'i18n', 'catalogs');
const LANGUAGES = ['en', 'ja', 'zh', 'ru'] as const;

const catalogSource = (lang: string): string => {
  const parts = [fs.readFileSync(path.join(CATALOG_DIR, `${lang}.ts`), 'utf8')];
  for (const entry of fs.readdirSync(CATALOG_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(CATALOG_DIR, entry.name, `${lang}.ts`);
    if (fs.existsSync(nested)) parts.push(fs.readFileSync(nested, 'utf8'));
  }
  return parts.join('\n');
};

const SOURCES = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, catalogSource(lang)]),
) as Record<(typeof LANGUAGES)[number], string>;

describe('reading lens modes', () => {
  it('has at least one mode, so the radiogroup is never empty', () => {
    expect(READING_LENS_MODES.length).toBeGreaterThan(0);
  });

  it.each(LANGUAGES)('gives every mode a label and a hint in %s', (lang) => {
    const missing = READING_LENS_MODES.flatMap((mode) =>
      [`lens.mode.${mode}`, `lens.mode.${mode}.hint`].filter(
        (key) => !SOURCES[lang].includes(`'${key}':`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it('declares no lens.mode arm the list does not have', () => {
    // `lens.mode.label` is the radiogroup's own aria-label, not an arm; it is
    // called by literal so the missing-key check already covers it.
    const declared = [...SOURCES.en.matchAll(/'lens\.mode\.([a-z][\w-]*)':/g)]
      .map((match) => match[1])
      .filter((name) => name !== 'label');
    expect([...new Set(declared)].sort()).toEqual([...READING_LENS_MODES].sort());
  });
});
