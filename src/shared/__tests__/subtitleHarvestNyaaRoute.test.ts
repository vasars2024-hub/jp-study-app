/**
 * The nyaa offer must name the tab that actually carries the nyaa button.
 *
 * **Why this test exists.** When Jimaku files nothing for a title, the harvest
 * panel does not run nyaa itself — it names it as the next step, in prose, via
 * `subHarvest.nyaa.offered`. All four catalogs shipped that sentence pointing at
 * the **Episodes** tab. The button is on the **Subtitles** tab, and has been for
 * as long as it has existed. A user who followed the instruction landed on a tab
 * that does not contain the thing, and every honest signal in the product told
 * them they were in the right place.
 *
 * That is the same defect shape as the settings-search miss the user hit
 * personally — a pointer to a surface that does not hold what it promises — and
 * neither a green suite nor `i18n-check` can see it, because both keys exist and
 * all four locales are present. Only the relationship between them is wrong.
 *
 * **Why a source scan.** The tab that guards the button is a JSX condition and
 * the label is resolved through `t()` at render time, so there is no runtime
 * value to assert on. Reading the two sources is the only way to compare the
 * route the prose names against the route the component implements.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHARED = join(__dirname, '..');
const EN_CATALOG = join(SHARED, 'i18n', 'catalogs', 'en.ts');
const DETAIL_PANEL = join(
  SHARED, '..', 'renderer', 'components', 'media', 'library', 'MediaDetailPanel.tsx',
);

/** The value of one single-quoted English catalog entry. */
function englishString(catalog: string, key: string): string {
  const match = new RegExp(`^  '${key.replace(/\./g, '\\.')}': '((?:[^'\\\\]|\\\\.)*)',$`, 'm').exec(catalog);
  if (!match) throw new Error(`en.ts has no entry for ${key}`);
  return match[1].replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Every tab id the detail panel declares, in render order. */
function tabIds(source: string): string[] {
  return [...source.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label:\s*t\('media\.detail\.tab\.\1'\)/g)]
    .map((m) => m[1]);
}

/**
 * The tab whose `{tab === '…' && (` block encloses the nyaa button.
 *
 * The nearest preceding guard wins, which is what JSX nesting means here: the
 * panel renders one flat sequence of `tab === x` blocks, not nested ones.
 */
function tabGuarding(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`MediaDetailPanel no longer mentions ${marker}`);
  const guards = [...source.matchAll(/\{tab === '([a-z]+)' &&/g)].filter((m) => m.index! < at);
  if (!guards.length) throw new Error(`${marker} is not inside any tab guard`);
  return guards[guards.length - 1][1];
}

describe('the nyaa offer names a route that exists', () => {
  const catalog = readFileSync(EN_CATALOG, 'utf8');
  const panel = readFileSync(DETAIL_PANEL, 'utf8');
  const offer = englishString(catalog, 'subHarvest.nyaa.offered');
  const ids = tabIds(panel);
  const owner = tabGuarding(panel, 'media.subtitles.nyaa.open');

  it('reads a plausible tab list and owner, so a silent parse failure cannot pass', () => {
    // Without these, a regex that matched nothing would make every assertion
    // below vacuously true — the way this class of scan usually fails.
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain(owner);
  });

  it('names the tab that actually carries the nyaa button', () => {
    const label = englishString(catalog, `media.detail.tab.${owner}`);
    expect(label.length).toBeGreaterThan(0);
    expect(offer).toContain(label);
  });

  it('names no other tab, so it cannot send the user somewhere the button is not', () => {
    const wrong = ids
      .filter((id) => id !== owner)
      .map((id) => englishString(catalog, `media.detail.tab.${id}`))
      // 'Details' is a common English word; only tab labels that read as
      // navigation are meaningful here.
      .filter((label) => label !== 'Details');
    expect(wrong.length).toBeGreaterThan(0);
    for (const label of wrong) expect(offer).not.toContain(label);
  });

  it('states the precondition the route has, rather than implying any title works', () => {
    // `listNyaaCandidates` refuses with "That media item is no longer in the
    // library" for anything `host.listItems()` does not hold, so a MAL title the
    // user has not downloaded has no route at all. The sentence has to say so.
    expect(offer).toMatch(/librar/i);
  });
});
