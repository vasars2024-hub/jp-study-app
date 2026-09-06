/**
 * Pre-sweep D95/D96/D97 — a button that LOOKS chosen must SAY it is chosen.
 *
 * D82 fixed this for `.sp-seg-btn`, the app's segmented-choice idiom. It is not the only
 * one. The scripted accessible-name + state pass
 * (`src/.coordination/presweep/a11y-name-scan.cjs`), run live on 2026-09-06 against
 * pid 14128, walked 24 of the 25 surfaces and found the same defect in three more
 * families, none of which uses `sp-seg-btn`:
 *
 *   library  `button.lib-folder-chip.active` named "All 24"            — 13 sites
 *   novels   `button.jiten-row.active` and the source picker's `.active` — 2 sites
 *   youtube  `button.yt-pl-item.active` and `button.yt-tab.active`      — 5 sites
 *
 * `NovelsContent.tsx` and `YouTubePlaylistsView.tsx` carried **zero** aria state
 * attributes in the whole file, so there was no local idiom to drift from; `LibraryView`
 * already had three correct sites and thirteen wrong ones.
 *
 * A source scan for the same reason D82's is one: `vitest.config.ts` is
 * `environment: 'node'` and these views reach singletons at module eval, so the scan
 * covers every call site rather than the handful a render harness could reach.
 *
 * Deliberately file-scoped rather than repo-wide: `active` is a common class and a
 * repo-wide rule would sweep in `<a>` navigation links and non-interactive markers,
 * where a pressed state would be a lie. These three files are the measured subject.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The three files the live pass implicated, each with the count measured on 2026-09-06. */
const FILES: Array<{ path: string; label: string; floor: number }> = [
  // 15, not 16: `aero-library-tile` (LibraryView.tsx:1917) is a `<div role="button">`,
  // which this scan deliberately does not reach. It already carries `aria-pressed`.
  { path: 'src/renderer/views/LibraryView.tsx', label: 'library', floor: 15 },
  { path: 'src/renderer/views/YouTubePlaylistsView.tsx', label: 'youtube', floor: 5 },
  { path: 'src/renderer/components/novels/NovelsContent.tsx', label: 'novels', floor: 2 },
];

const STATE_ATTR = /\saria-(pressed|checked|selected|current)[=\s]/;

type StatefulButton = { line: number; announced: boolean; tag: string };

/**
 * Every `<button>` opening tag in `src` whose className derives an `active` class from a
 * condition, with whether the same tag announces that state.
 *
 * Brace and quote tracking is load-bearing: `onClick={() => …}` and template literals
 * both contain `>` and `"`, so a scan-to-first-`>` truncates the tag and reports a
 * correctly-labelled button as silent. Same hazard D82's gate documents.
 */
export function analyseSource(src: string): StatefulButton[] {
  const out: StatefulButton[] = [];
  for (const open of src.matchAll(/<button(?=[\s>])/g)) {
    const start = open.index;
    let quote: string | null = null;
    let depth = 0;
    let end = src.length;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null;
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { end = i + 1; break; }
    }
    const tag = src.slice(start, end);
    // Only the CONDITIONAL form. A static `className="… active"` is not a state.
    if (!/\?\s*'\s?active'|\?\s*"\s?active"|\?\s*'\s?active\s/.test(tag)) continue;
    out.push({
      line: src.slice(0, start).split(/\r?\n/).length,
      announced: STATE_ATTR.test(tag),
      tag: tag.replace(/\s+/g, ' ').slice(0, 120),
    });
  }
  return out;
}

describe('a button that looks chosen announces that it is chosen', () => {
  for (const f of FILES) {
    it(`${f.label}: every conditional active button carries an aria state`, () => {
      const found = analyseSource(fs.readFileSync(f.path, 'utf8'));
      const silent = found.filter((b) => !b.announced).map((b) => `${f.path}:${b.line} ${b.tag}`);
      expect(silent).toEqual([]);
    });

    it(`${f.label}: the scan reaches enough sites that an empty pass is not vacuous`, () => {
      // Floors, not equalities — new controls are expected and arrive already covered.
      expect(analyseSource(fs.readFileSync(f.path, 'utf8')).length).toBeGreaterThanOrEqual(f.floor);
    });
  }
});

describe('the analyser detects what it claims to', () => {
  // Without these, the assertions above could pass by finding nothing at all.
  it('reports a bare conditional active button as silent', () => {
    const [only] = analyseSource("<button className={`yt-tab${on ? ' active' : ''}`}>A</button>");
    expect(only).toMatchObject({ announced: false });
  });

  it('accepts each of the four state attributes, in either attribute order', () => {
    for (const attr of ['aria-pressed={on}', 'aria-selected={on}', 'aria-current="true"', 'aria-checked={on}']) {
      expect(
        analyseSource(`<button ${attr} className={\`yt-tab\${on ? ' active' : ''}\`}>A</button>`)[0].announced,
      ).toBe(true);
      expect(
        analyseSource(`<button className={\`yt-tab\${on ? ' active' : ''}\`} ${attr}>A</button>`)[0].announced,
      ).toBe(true);
    }
  });

  it('is not fooled by a > inside an arrow handler before the state attribute', () => {
    const [only] = analyseSource(
      "<button onClick={() => go(a > b)} className={`yt-tab${on ? ' active' : ''}`} aria-pressed={on}>A</button>",
    );
    expect(only.announced).toBe(true);
  });

  it('ignores a static active class, which is a style and not a state', () => {
    expect(analyseSource('<button className="yt-tab active">A</button>')).toEqual([]);
  });

  it('reconstructs the pre-fix YouTube tab pair and reports both as silent', () => {
    const before = `
      <button type="button" className={\`yt-tab\${mainTab === 'news' ? ' active' : ''}\`} onClick={() => setMainTab('news')}>N</button>
      <button type="button" className={\`yt-tab\${mainTab === 'playlist' ? ' active' : ''}\`} onClick={() => setMainTab('playlist')}>P</button>`;
    const found = analyseSource(before);
    expect(found).toHaveLength(2);
    expect(found.every((b) => b.announced)).toBe(false);
  });
});

describe('D91 — the YouTube video row is reachable and operable by keyboard', () => {
  const src = fs.readFileSync('src/renderer/views/YouTubePlaylistsView.tsx', 'utf8');

  it('makes the row focusable and gives it a keyboard activation path', () => {
    // Selecting a row is the ONLY writer of `selectedVideoIds`, and `Log` and
    // `Add to Plan to watch` are disabled until there is a selection — so without
    // this both buttons are permanently dead for a keyboard-only user.
    expect(src).toMatch(/className=\{`yt-row\$\{selected/);
    expect(src).toMatch(/\btabIndex=\{0\}/);
    expect(src).toMatch(/onKeyDown=\{\(e\) => \{[\s\S]{0,400}?toggleSelect\(v\.id, true\)/);
    expect(src).toMatch(/aria-selected=\{selected\}/);
  });

  it('owns those rows with a grid, not a list, so the nested action buttons survive', () => {
    // `role="button"` on the row would make its three action buttons presentational —
    // trading one unreachable control for three. `row` inside `grid` is the one shape
    // that allows a selectable row to contain real widgets.
    expect(src).toMatch(/role="row"/);
    expect(src).toContain('gridRole="grid"');
    expect(src).not.toContain('itemRole="listitem"');
    // Windowing hides the real size unless the grid declares it.
    expect(src.match(/ariaRowCount=\{/g) ?? []).toHaveLength(2);
  });

  it('does not let Enter on a nested action button also activate the row', () => {
    expect(src).toMatch(/if \(e\.target !== e\.currentTarget\) return;/);
  });
});

describe('D93 — deleting a YouTube folder asks first', () => {
  const src = fs.readFileSync('src/renderer/views/YouTubePlaylistsView.tsx', 'utf8');

  it('guards ytDeleteFolder with a confirm that names the folder and the fallout', () => {
    const call = src.slice(src.indexOf('ytDeleteFolder') - 900, src.indexOf('ytDeleteFolder') + 120);
    expect(call).toContain('await confirmDialog({');
    expect(call).toContain("t('yt.confirm.deleteFolder'");
    expect(call).toContain('name: f.name');
    expect(call).toContain('count: affected');
    // It destroys organisation, so it is styled as destructive, not merely consequential.
    expect(call).toContain('danger: true');
    expect(call).toContain('if (!ok) return;');
  });

  it('uses the same confirm mechanism as the file two destructive siblings', () => {
    // This started as `window.confirm`, matching the siblings at the time. A concurrent
    // fix then moved BOTH siblings to `confirmDialog`, so the folder delete followed —
    // one mechanism per file, or the odd one out is the one nobody maintains.
    expect(src).not.toContain('window.confirm(');
    expect((src.match(/await confirmDialog\(\{/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
