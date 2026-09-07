// @vitest-environment node
/**
 * The pop-out allow-list exists TWICE, and the two halves silently disagreed.
 *
 * `main.ts` decides which sections may be opened as their own window
 * (`ARGV_OPEN_SECTIONS`, whose own comment says it "mirrors createPopoutWindow"),
 * and `App.tsx` decides which ones the renderer will recognise when the window
 * loads — `popoutSection()` validates with `raw in POPOUT_LABELS`, so that label
 * map is an allow-list wearing a label map's clothes.
 *
 * FILES_APP_PLAN gate 8 deleted the Notebook section. `notebook: 'Notebook'` went
 * out of the label map with it, and `files` was added to `ARGV_OPEN_SECTIONS` but
 * never to the map. Net effect measured at 00cb7b98: main would open
 * `?popout=files` and the renderer would answer `null` — a capability Notebook had
 * and Files did not inherit, which is exactly the regression the plan's
 * "never a gatekeeper" constraint forbids. Nothing failed; the window just came up
 * wrong, and no test in the repo compared the two lists.
 *
 * The renderer half used to be read out of App.tsx with a regex, for the reason this
 * comment gave: importing `App.tsx` evaluates the entire renderer, which a parity
 * assertion should not need. That reason is gone — the table now lives in
 * `renderer/popoutLabels.ts`, a leaf module with one type import, moved there so it could
 * be unit-tested (`popoutLabels.test.ts`). Reading it as a VALUE also removes the failure
 * mode the regex had: it went red on the rename to `POPOUT_LABEL_KEYS`, and a scraper that
 * stops matching reports an empty set, which is how a parity check passes vacuously.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESKTOP_WIN_SECTIONS } from '../../shared/desktop';
import { POPOUT_LABEL_KEYS } from '../popoutLabels';

const SRC = resolve(__dirname, '../..');

/** The keys of the renderer's pop-out allow-list. */
function rendererPopoutSections(): string[] {
  return Object.keys(POPOUT_LABEL_KEYS);
}

/** The members of `ARGV_OPEN_SECTIONS` in main.ts. */
function mainOpenSections(): string[] {
  const source = readFileSync(resolve(SRC, 'main.ts'), 'utf8');
  const body = /const ARGV_OPEN_SECTIONS = new Set\(\[([\s\S]*?)\]\);/.exec(source)?.[1];
  if (!body) throw new Error('could not find ARGV_OPEN_SECTIONS in main.ts');
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('the pop-out allow-list agrees with itself across the process boundary', () => {
  /*
   * The positive control, first: both readers must actually find something. Every
   * assertion below is a set comparison, and two empty sets agree perfectly.
   */
  it('both halves parse, so an agreement is a real agreement', () => {
    expect(rendererPopoutSections().length).toBeGreaterThan(15);
    expect(mainOpenSections().length).toBeGreaterThan(15);
  });

  it('every section main will open, the renderer recognises', () => {
    const renderer = new Set(rendererPopoutSections());
    // `youtube` is an argv-only alias handled before the section lookup, not a
    // DesktopWinSection, so it is the one member that is not expected in the map.
    const expected = mainOpenSections().filter((s) => s !== 'youtube');
    expect(expected.filter((s) => !renderer.has(s))).toEqual([]);
  });

  it('Files inherited the pop-out that Notebook had', () => {
    // Gate 8's specific casualty, asserted by name so a future deletion of the
    // key fails here rather than in a user's second window.
    expect(rendererPopoutSections()).toContain('files');
    expect(mainOpenSections()).toContain('files');
    // And `notebook` is gone from both, because desktop.ts demoted it to an alias.
    expect(rendererPopoutSections()).not.toContain('notebook');
    expect(DESKTOP_WIN_SECTIONS).not.toContain('notebook');
    expect(DESKTOP_WIN_SECTIONS).toContain('files');
  });

  it('the renderer map names only real sections', () => {
    const sections = new Set<string>(DESKTOP_WIN_SECTIONS);
    expect(rendererPopoutSections().filter((s) => !sections.has(s))).toEqual([]);
  });
});
