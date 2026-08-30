/**
 * L8 YouTube — rubric category 5's three repairs, pinned at source.
 *
 * The live harness took this surface 7/10 -> 10/10, but each repair is a handful of
 * declarations that an unrelated edit reverts without anyone noticing:
 *
 * 1. `--fg` IS NOT A TOKEN IN THIS REPO. `color: var(--fg, #eee)` therefore always resolved
 *    to the literal `#eee`, which happens to look right on the six dark palettes and is
 *    invisible on the six light ones — 75 of 106 painted text runs failing in
 *    `classic-light`, minimum ratio 1.00. The guard is not "the surface uses --text"; it is
 *    that `--fg` appears NOWHERE in the stylesheet, because the whole defect was a token
 *    name that reads plausibly and is defined by nothing.
 * 2. Secondary text is a colour, not an opacity. `--text` at 0.65 alpha over white still
 *    misses the 4.5 bar, so dimming by opacity cannot be repaired by fixing the token above
 *    it. `--muted` is the per-theme token that already clears it.
 * 3. Two `<details>` disclosures are what took the default state from 29 controls to scan
 *    down to 10, against the rubric's ceiling of 12. They must be UNCONTROLLED and default
 *    closed: an `open` prop, or React state driving them, would make the resting state
 *    depend on history, and category 5 measures the default state.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = resolve(__dirname, '..');
const read = (...parts: string[]) => readFileSync(resolve(RENDERER, ...parts), 'utf8');

/** The declarations of one top-level rule, addressed by its exact selector line. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {\n`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  const start = at + selector.length + 4;
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

/** The whole YouTube section, so a `--muted` elsewhere in a 700 KB sheet cannot pass this. */
function ytSection(css: string): string {
  const start = css.indexOf('\n.yt-shell {\n');
  const end = css.indexOf('\n/* ===== Mining rules page (ProfileRulesPage)', start);
  expect(start, 'no .yt-shell rule').toBeGreaterThan(-1);
  expect(end, 'no marker after the YouTube section').toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('L8 YouTube — category 5 clarity guards', () => {
  it('never READS --fg, which no palette in this repo defines', () => {
    const css = read('styles.css');
    // `var(--fg`, not the bare name: the repair's own comment says why the name is wrong,
    // and an assertion that forbids saying so would be repaired by deleting the warning.
    expect(css).not.toContain('var(--fg');
    expect(css).not.toMatch(/^\s*--fg\s*:/m);
  });

  it('takes its text colour from the window rather than overriding it with a literal', () => {
    const body = ruleBody(read('styles.css'), '.yt-root');
    expect(body).toContain('color: var(--text)');
    expect(body).not.toMatch(/color:\s*#/);
  });

  it('dims secondary text with --muted, never with opacity', () => {
    const section = ytSection(read('styles.css'));
    // Any `opacity:` under 1 on a rule that also sets a font-size is a dimmed text run.
    // 0.9 on the status chips is a border/fill treatment and carries no font-size of its own.
    const dimmedText = section
      .split('\n}')
      .filter((rule) => /font-size:/.test(rule) && /opacity:\s*0\.[0-8]/.test(rule))
      .map((rule) => rule.trim().split('\n')[0]);
    expect(dimmedText, `these rules still dim TEXT with opacity: ${dimmedText.join(', ')}`).toEqual([]);
    expect(section).toContain('color: var(--muted)');
  });

  it('states its one error colour through the palette-remapped danger family', () => {
    expect(ruleBody(read('styles.css'), '.yt-status-err')).toContain('color: var(--danger-text)');
  });

  it('tucks the rail tools and the preference form into uncontrolled, default-closed disclosures', () => {
    const view = read('views', 'YouTubePlaylistsView.tsx');
    expect(view).toContain('<details className="yt-side-tools">');
    expect(view).toContain('<details className="yt-prefs-disclosure">');
    // `open` in either form would make the resting state a function of history.
    expect(view).not.toMatch(/<details[^>]*\sopen[=\s>]/);
  });

  it('keeps paste-a-URL out of a disclosure, because it is the rail one obvious way in', () => {
    const view = read('views', 'YouTubePlaylistsView.tsx');
    const add = view.indexOf('className="yt-add"');
    const tools = view.indexOf('<details className="yt-side-tools">');
    expect(add).toBeGreaterThan(-1);
    expect(tools).toBeGreaterThan(add);
  });

  it('gives both summaries the 32px pointer floor the hit scope cannot reach', () => {
    const body = ruleBody(read('styles.css'), '.yt-side-tools > summary,\n.yt-prefs-disclosure > summary');
    expect(body).toContain('min-height: var(--lq-hit-target)');
  });
});
