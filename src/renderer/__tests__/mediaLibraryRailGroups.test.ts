// @vitest-environment node
/**
 * The library rail's three groups are disclosures, and two of their properties are
 * the kind that break silently.
 *
 * 1. A collapsed group must still be REACHABLE. The narrow-rail container query
 *    used to `display: none` the whole heading; once the heading is the group's
 *    `<summary>`, that rule would leave a closed group with no visible way back
 *    open — the rows hidden by `<details>` and the toggle hidden by CSS. The query
 *    must hide the heading's TEXT and keep the summary.
 * 2. State comes from `onToggle`, not a click handler on the summary. `<details>`
 *    also opens from the keyboard and from find-in-page, and a click handler misses
 *    both and leaves the stored preference lying about what is on screen.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf8');

const COMPONENT = 'renderer/components/media/library/MediaLibrarySidebar.tsx';
const STYLES = 'renderer/components/media/library/mediaLibrary.css';

/** The body of the first at-rule whose prelude contains `needle`. Brace-balanced. */
function atRuleBody(css: string, needle: string): string {
  const start = css.indexOf(needle);
  expect(start, `no at-rule containing ${needle}`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced at-rule for ${needle}`);
}

describe('media library rail groups', () => {
  it('renders each group as a real disclosure with its heading as the summary', () => {
    const source = read(COMPONENT);
    expect(source).toContain('<details');
    expect(source).toContain('className="medialib-rail__group"');
    expect(source).toContain('<summary className="medialib-rail__heading">');
    expect(source).toContain('className="medialib-rail__heading-text"');
    // The old markup. If either comes back the group stops being collapsible.
    expect(source).not.toContain('<div className="medialib-rail__group">');
    expect(source).not.toContain('<div className="medialib-rail__heading">');
  });

  it('drives state from onToggle rather than a click on the summary', () => {
    const source = read(COMPONENT);
    expect(source).toContain('onToggle=');
    expect(source).not.toMatch(/<summary[^>]*onClick/);
  });

  it('opens Library by default and leaves the two secondary groups closed', () => {
    const source = read(COMPONENT);
    const block = source.slice(source.indexOf('RAIL_GROUP_DEFAULTS'), source.indexOf('readRailGroupState'));
    expect(block).toMatch(/library:\s*true/);
    expect(block).toMatch(/mediaType:\s*false/);
    expect(block).toMatch(/collections:\s*false/);
  });

  it('merges a stored preference over the defaults instead of replacing them', () => {
    const source = read(COMPONENT);
    // A blob written before a group existed must not decide that group's first
    // render, so the read starts from the defaults and only copies booleans.
    expect(source).toContain('const next = { ...RAIL_GROUP_DEFAULTS };');
    expect(source).toMatch(/typeof parsed\?\.\[id\] === 'boolean'/);
    expect(source).toContain('return { ...RAIL_GROUP_DEFAULTS };');
  });

  it('force-opens whichever group holds the active scope', () => {
    const source = read(COMPONENT);
    expect(source).toContain('const activeGroup = GROUP_OF[value.kind];');
    // Keyed on the group id, not the whole scope: moving between two shelves must
    // not re-open a group the user just closed.
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*?\[activeGroup\]\)/);
  });

  it('keeps a collapsed group reachable on a rail too narrow for labels', () => {
    const css = read(STYLES);
    // Comments out first, or the rule's leading comment rides along on the first
    // selector and an exact match silently never fires.
    const narrow = atRuleBody(css, '@container medialibrail (max-width: 120px)').replace(/\/\*[\s\S]*?\*\//g, '');
    // Every rule in the query that hides something, by its selector list.
    const hidden = [...narrow.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /display:\s*none/.test(body))
      .flatMap(([, selectors]) => selectors.split(',').map((s) => s.trim()));

    expect(hidden).toContain('.medialib-rail__heading-text');
    // The summary itself must survive the query — it is the only way back open.
    expect(hidden).not.toContain('.medialib-rail__heading');
  });

  it('gives the summary a pointer, a focus ring and no UA triangle', () => {
    const css = read(STYLES);
    const rule = css.slice(css.indexOf('.medialib-rail__heading {'), css.indexOf('.medialib-rail .ui-sidebar {'));
    expect(rule).toContain('cursor: pointer');
    expect(rule).toContain('list-style: none');
    expect(rule).toContain('.medialib-rail__heading::-webkit-details-marker { display: none; }');
    expect(rule).toContain('.medialib-rail__heading:focus-visible');
    expect(rule).toContain('outline:');
  });
});

/**
 * The rail is the Video window's navigation region, and rubric category 3 asks that every
 * contextual-navigation region use the SHARED primitive rather than a local re-implementation.
 * Measured on the live Liquid Video window before this landed: `liquidTreatedEligible` 3 of 4,
 * with `nav.medialib-rail` the one miss, painting its own opaque `rgb(8, 15, 12)`.
 */
describe('media library rail — the Liquid role is declared, not re-implemented', () => {
  it('renders the rail through ContextualSurface as a nav', () => {
    const source = read(COMPONENT);
    expect(source).toContain("import { ContextualSurface } from '../../liquid/LiquidSurface';");
    expect(source).toContain('<ContextualSurface as="nav" className="medialib-rail"');
    expect(source).toContain('</ContextualSurface>');
    // The bare element it replaced. If it comes back the rail silently stops carrying the
    // material in Liquid presentation and category 3 drops to 3 of 4 with no test failing.
    expect(source).not.toContain('<nav className="medialib-rail"');
  });

  it('does not paint a muted count on the active row, where the pill is the ground', () => {
    const css = read(STYLES);
    // `--muted` is solved against the rail's own fill, not against `--accent-soft`. Measured
    // #7fa08e over the composited pill: 2.83:1 in a Liquid window, 3.16:1 in a standard one,
    // both under the 4.5 bar for 11px text. The row's own `color: var(--text)` measures 6.77.
    expect(css).toMatch(
      /\.medialib-rail \.ui-sidebar__item\[aria-current='true'\] \.medialib-rail__count\s*\{[^}]*color:\s*inherit/,
    );
  });

  it('never hardcodes the material on the rail itself', () => {
    const css = read(STYLES);
    const rule = css.slice(css.indexOf('.medialib-rail {'), css.indexOf('.medialib-rail__group'));
    // §2 non-negotiable 1: a conventional window is unchanged, so the Liquid material may only
    // ever arrive from `liquid-window.css` under `.fwin-liquid` — never from this sheet.
    expect(rule).not.toMatch(/backdrop-filter/);
    expect(rule).not.toMatch(/--lq-liquid-/);
  });
});
