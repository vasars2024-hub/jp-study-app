// @vitest-environment jsdom
/**
 * L8 category 4 — a dense table reflows to its pane, and loses no value doing it.
 *
 * Measured on the live Scraper maximized: `main.scr-main` reported scrollWidth 1611
 * against clientWidth 664, because the qBittorrent mirror's fifteen columns have a
 * 1582px min-content and the indexer's nine have 909, both inside a 606px card. No
 * ancestor between the row and `.scr-main` scrolls, so the whole PAGE scrolled
 * sideways and dragged the page head and every other card with it.
 *
 * jsdom has no layout and no container queries, so what is pinned here are the two
 * things that silently turn the reflow back off:
 *
 *  1. NO TABLE MAY SET AN INLINE `grid-template-columns`. An inline declaration —
 *     including an inline custom property — outranks a container query, so a template
 *     written that way is unreachable by every tier in `scraper.css`. This is the
 *     defect itself, and re-introducing it would restore the 1582px overflow while
 *     every rule below still reads as present.
 *  2. EVERY COLUMN A TIER HIDES MUST STILL BE RENDERED IN ITS OWN ROW. The tiers drop
 *     columns with `display: none`; the values move to `.scr-t-fold`. The indexer
 *     table has no per-row inspector at all, so a column dropped without a fold line
 *     would delete the value outright rather than relocate it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(__dirname, '..', 'components', 'scraper', 'scraper.css'),
  'utf8',
);
const MIRROR_SRC = readFileSync(
  join(__dirname, '..', 'components', 'scraper', 'pages', 'TorrentManagerPage.tsx'),
  'utf8',
);
const RESULTS_SRC = readFileSync(
  join(__dirname, '..', 'components', 'scraper', 'result', 'ResultPanels.tsx'),
  'utf8',
);

/** The `display: none` bodies of one `@container scr-pane` tier, by its max-width. */
function tierBlock(maxWidth: number): string {
  const head = `@container scr-pane (max-width: ${maxWidth}px)`;
  const at = CSS.indexOf(head);
  expect(at, `tier ${maxWidth} exists`).toBeGreaterThan(-1);
  // Walk to the matching close brace: these tiers nest one level of rules.
  let depth = 0;
  let i = CSS.indexOf('{', at);
  const start = i;
  for (; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return CSS.slice(start, i);
}

/** Column keys a tier hides, read from its `[data-col='x']` selectors. */
function hiddenCols(maxWidth: number): string[] {
  const block = tierBlock(maxWidth);
  return [...block.matchAll(/\[data-col='([a-z]+)'\]/g)].map((m) => m[1]).sort();
}

describe('Scraper dense tables — the pane container drives the columns', () => {
  it('routes every table track list through --scr-cols, never an inline template', () => {
    expect(CSS).toContain('container-name: scr-pane');
    expect(CSS).toContain('grid-template-columns: var(--scr-cols)');
    // Only the two tables the live measurement failed on were migrated; the other
    // result tables in this file keep their inline templates and are out of scope,
    // so the assertion is scoped to `TorrentTable`'s own body rather than the file.
    const torrentTable = RESULTS_SRC.slice(
      RESULTS_SRC.indexOf('export function TorrentTable('),
      RESULTS_SRC.indexOf('export function TorrentResultPanel('),
    );
    expect(torrentTable.length).toBeGreaterThan(200);
    expect(torrentTable, 'indexer table sets no inline grid template').not.toContain('gridTemplateColumns');
    expect(MIRROR_SRC, 'mirror table sets no inline grid template').not.toContain('gridTemplateColumns');
    expect(CSS).toContain('.scr-table--mirror');
    expect(CSS).toContain('.scr-table--torrents');
  });

  it('folds every column the indexer tier hides back into its own row', () => {
    const hidden = hiddenCols(980);
    expect(hidden).toEqual(['age', 'group', 'subs', 'tracker']);
    // Each hidden column's value is re-rendered inside the name cell's fold line.
    const fold = RESULTS_SRC.slice(
      RESULTS_SRC.indexOf('<span className="scr-t-fold">'),
      RESULTS_SRC.indexOf('</span>', RESULTS_SRC.indexOf('<span className="scr-t-fold">')),
    );
    expect(fold).toContain('row.releaseGroup'); // group
    expect(fold).toContain('row.ageDays'); //      age
    expect(fold).toContain('row.subtitleLanguages'); // subs
    expect(fold).toContain('row.tracker'); //      tracker
    expect(CSS).toContain('.scr-table--torrents .scr-t-fold');
  });

  it('folds every column the two mirror tiers hide back into its own row', () => {
    expect(hiddenCols(1650)).toEqual(['avail', 'category', 'completed', 'peers', 'ratio', 'seeds', 'tags']);
    expect(hiddenCols(1000)).toEqual(['down', 'eta', 'progress', 'up']);

    const foldA = MIRROR_SRC.slice(
      MIRROR_SRC.indexOf('<span className="scr-t-fold">'),
      MIRROR_SRC.indexOf('<span className="scr-t-fold scr-t-fold--b">'),
    );
    for (const expr of ['t.ratio', 't.seedsConnected', 't.peersConnected', 't.availability', 't.category', 't.tags', 't.completedOn']) {
      expect(foldA, `${expr} survives tier A`).toContain(expr);
    }
    const bAt = MIRROR_SRC.indexOf('<span className="scr-t-fold scr-t-fold--b">');
    const foldB = MIRROR_SRC.slice(bAt, MIRROR_SRC.indexOf('</span>', bAt) + 400);
    for (const expr of ['t.progress', 't.downloadSpeedBps', 't.uploadSpeedBps', 't.etaSec']) {
      expect(foldB, `${expr} survives tier B`).toContain(expr);
    }
  });

  it('keeps tier A from painting the tier-B line as well', () => {
    // `--b` carries `.scr-t-fold` too, so tier A must exclude it or four values
    // appear twice: once in a column that is still shown, once in the fold.
    expect(tierBlock(1650)).toContain('.scr-t-fold:not(.scr-t-fold--b)');
  });

  it('tags every mirror column so a tier can address it', () => {
    const keys = [...MIRROR_SRC.matchAll(/\[\s*'([a-z]+)',\s*'/g)].map((m) => m[1]);
    expect(keys).toEqual([
      'name', 'state', 'progress', 'down', 'up', 'eta', 'ratio', 'seeds',
      'peers', 'avail', 'size', 'category', 'tags', 'completed', 'actions',
    ]);
    for (const k of keys) {
      if (k === 'name' || k === 'actions') continue;
      expect(MIRROR_SRC, `${k} cell is tagged`).toContain(`data-col="${k}"`);
    }
  });
});
