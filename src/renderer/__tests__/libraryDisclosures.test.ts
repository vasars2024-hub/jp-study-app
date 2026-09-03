/**
 * Library's three progressive disclosures — the import routes, the watch bar, and the
 * language/level refine banks.
 *
 * The third was added on 2026-09-03 when L9 re-scored the surface: the two earlier folds took
 * the scan to 11, then the inbox filter banks grew back onto the default view and Q4 measured
 * **13** against the same bar of 12. The banks now sit behind their own collapsed `<details>`,
 * which is why guard (4) below has a second half: the summary names whatever is currently
 * filtering, so a closed fold can hide the administration but never a missing book.
 *
 * Rubric category 5 question 4 ("advanced tools discoverable without cluttering")
 * scored NO on Library at 17 chrome controls against a bar of 12: four import
 * routes side by side plus a three-button watch bar, none of which is the
 * dominant task of a catalogue. Both groups now sit behind a collapsed
 * `<details>`, which took the scan to 11 and the cell to 10/10.
 *
 * The risk that buys is the one the plan calls out by name: a disclosure must
 * not become a deletion, and a control that is only reachable one way is a
 * regression. So this file guards the *contract*, not the appearance —
 *
 *   1. every tucked control still exists in the view, with its own handler;
 *   2. every tucked control is ALSO a menu item, so the disclosure is the
 *      second route rather than the only one;
 *   3. `+ Import file(s)` stays outside the disclosure — it is the surface's
 *      primary action and Q1/Q3 both resolve to it;
 *   4. the watch bar keeps its STATUS in the summary, so collapsing hides the
 *      administration and never the state;
 *   5. the chevron animates on a motion token, not a literal duration, so
 *      `prefers-reduced-motion` still collapses it.
 *
 * Read from source, not rendered: `LibraryView` reaches for `window.api` in its
 * first effect and cannot be mounted by a unit test, which is the same reason
 * `libraryShelfLayout.test.ts` reads its markup contract this way.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../../shared/i18n/catalogs/en';

const SRC = resolve(__dirname, '../..');
// Normalised on read: this tree is LF and a fresh worktree checks out CRLF, and a
// multi-line CSS matcher that skips that step passes only where it was written.
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8').replace(/\r\n/g, '\n');
const VIEW = read('renderer/views/LibraryView.tsx');
const CSS = read('renderer/styles.css');

/** The three import routes that moved behind `lib-more`, with the handler each one calls. */
const TUCKED_IMPORTS: ReadonlyArray<readonly [string, string]> = [
  ['library.btn.importFolder', 'onClick={importFolder}'],
  ['library.btn.webPaste', 'onClick={() => setImportOpen(true)}'],
  ['library.btn.randomWiki', 'onClick={() => setWikiOpen(true)}'],
];

/** The watch-bar actions, with the menu item id that keeps each one reachable elsewhere. */
const TUCKED_WATCH: ReadonlyArray<readonly [string, string]> = [
  ['onClick={syncNow}', "id: 'sync'"],
  ['onClick={chooseWatchFolder}', "id: 'watch-folder'"],
  ['onClick={stopWatching}', "id: 'stop-watch'"],
];

describe('library progressive disclosures', () => {
  it('tucks the three secondary import routes away and keeps the primary one in the open', () => {
    const details = VIEW.slice(VIEW.indexOf('<details className="lib-more">'));
    const body = details.slice(0, details.indexOf('</details>'));
    expect(body).not.toBe('');
    for (const [key, handler] of TUCKED_IMPORTS) {
      expect(body).toContain(`t('${key}')`);
      expect(body).toContain(handler);
    }
    // The dominant task is not a "more" item. Q1 and Q3 both resolve to this button,
    // and hiding it would have traded one NO for two.
    expect(body).not.toContain("t('library.btn.importFiles')");
    expect(VIEW).toContain("<button className=\"btn primary\" disabled={busy} onClick={importFiles}>");
  });

  it('leaves every tucked import route in the File menu as well', () => {
    for (const id of ['import-folder', 'import-web', 'import-wiki']) {
      expect(VIEW).toContain(`id: '${id}'`);
    }
  });

  it('makes the watch bar a disclosure whose summary still carries the status', () => {
    expect(VIEW).toContain('<details className="watch-bar lq-hit-scope">');
    const summary = VIEW.slice(VIEW.indexOf('<summary className="watch-summary">'));
    const head = summary.slice(0, summary.indexOf('</summary>'));
    // Both states of the status line stay above the fold; only the buttons move.
    expect(head).toContain("t('library.watch.autoFrom')");
    expect(head).toContain("t('library.watch.hint')");
    expect(head).not.toContain('<button');
  });

  it('keeps each watch action present and separately reachable from the menu', () => {
    const actions = VIEW.slice(VIEW.indexOf('<div className="watch-actions">'));
    const body = actions.slice(0, actions.indexOf('</details>'));
    for (const [handler, menuId] of TUCKED_WATCH) {
      expect(body).toContain(handler);
      expect(VIEW).toContain(menuId);
    }
  });

  it('collapses all three disclosures by default — the scan count must not depend on state', () => {
    // `<details ... open>` on any of them puts the controls straight back into the
    // default view, which is precisely what Q4 counts.
    expect(VIEW).not.toContain('<details className="lib-more" open>');
    expect(VIEW).not.toContain('<details className="watch-bar lq-hit-scope" open>');
    expect(VIEW).not.toContain('<details className="lib-filter-bar lq-hit-scope" open>');
    // Nor a controlled `open` — an attribute React re-asserts on every render would fight
    // the user's own toggle, and the memory of that failure mode is why this is spelled out.
    expect(VIEW).not.toMatch(/<details className="lib-filter-bar lq-hit-scope" open=/);
  });

  it('tucks both refine banks away without removing either chip bank or its handler', () => {
    const details = VIEW.slice(VIEW.indexOf('<details className="lib-filter-bar lq-hit-scope">'));
    const body = details.slice(0, details.indexOf('</details>'));
    expect(body).not.toBe('');
    // Both banks, both setters: the fold is a fold, not a deletion.
    expect(body).toContain('filterOptions.langs.map');
    expect(body).toContain('onClick={() => setLangFilter(lang)}');
    expect(body).toContain('filterOptions.levels.map');
    expect(body).toContain('onClick={() => setLevelFilter(lv)}');
    // The chips themselves must stay out of the summary or the fold buys nothing.
    const summary = body.slice(0, body.indexOf('</summary>'));
    expect(summary).not.toContain('<button');
  });

  it('names the applied filter in the summary, so a closed fold never hides a missing book', () => {
    const summary = VIEW.slice(VIEW.indexOf('<summary className="lib-filter-summary">'));
    const head = summary.slice(0, summary.indexOf('</summary>'));
    expect(head).toContain('activeFilterLabel');
    // And the label is derived from the live selection, not a static string.
    expect(VIEW).toContain("if (langFilter !== 'all') parts.push(t(`library.inbox.lang.${langFilter}`));");
    expect(VIEW).toContain("if (levelFilter !== 'all') parts.push(`L${levelFilter}`);");
    // Keyed on `lang`, not `t`: `t` is stable across a language change.
    expect(VIEW).toContain('}, [langFilter, levelFilter, lang]);');
  });

  it('labels the refine disclosure through i18n in all four catalogues', () => {
    expect(VIEW).toContain("t('library.filter.refine')");
    expect(en['library.filter.refine']).toBeTruthy();
    for (const lang of ['ja', 'zh', 'ru']) {
      const catalogue = read(`shared/i18n/catalogs/${lang}.ts`);
      expect(catalogue).toContain("'library.filter.refine':");
    }
  });

  it('labels the disclosure through i18n in all four catalogues', () => {
    expect(VIEW).toContain("t('library.btn.moreImports')");
    expect(en['library.btn.moreImports']).toBeTruthy();
    for (const lang of ['ja', 'zh', 'ru']) {
      const catalogue = read(`shared/i18n/catalogs/${lang}.ts`);
      expect(catalogue).toContain("'library.btn.moreImports':");
    }
  });

  it('gives a details a block box, because the flex .watch-bar rule would inline the summary', () => {
    expect(CSS).toContain('details.watch-bar {\n  display: block;\n}');
  });

  it('animates the chevron on a motion token so reduced motion still collapses it', () => {
    expect(CSS).toContain('transition: transform var(--lq-motion-move, 140ms) var(--lq-ease-move, ease);');
    // A literal duration here would survive `prefers-reduced-motion`.
    expect(CSS).not.toContain('transition: transform 140ms');
  });
});
